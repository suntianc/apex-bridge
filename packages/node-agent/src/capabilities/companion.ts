import { Logger } from 'winston';
import { TaskOrchestrator } from '../tasks/TaskOrchestrator';
import { TaskContext, TaskResult } from '../tasks/types';
import { LLMProxy, LLMProxyError } from '../llm/LLMProxy';
import { LLMMessage } from '../protocol/types';

interface CompanionConversationArgs {
  conversationId?: string;
  userId?: string;
  sceneId?: string;
  messages?: LLMMessage[];
  prompt?: string;
  llm?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export function registerCompanionCapabilities(
  orchestrator: TaskOrchestrator,
  logger: Logger,
  llmProxy?: LLMProxy
): void {
  orchestrator.registerTool('companion_ack', async ({ assignment }: TaskContext): Promise<TaskResult> => {
    const message = String(assignment.toolArgs.message ?? 'Task acknowledged');
    return {
      success: true,
      result: {
        acknowledgment: message,
        metadata: assignment.metadata ?? null
      }
    };
  });

  orchestrator.registerTool(
    'companion_delegate',
    async ({ assignment, logger: taskLogger }: TaskContext): Promise<TaskResult> => {
      taskLogger.info('Received delegate request', { payload: assignment.toolArgs });
      return {
        success: true,
        result: {
          delegated: true,
          instruction: assignment.toolArgs,
          note: 'Delegation logic to worker nodes should be implemented in business layer.'
        }
      };
    }
  );

  orchestrator.registerTool(
    'companion_conversation',
    async ({ assignment, logger: taskLogger, signal }: TaskContext): Promise<TaskResult> => {
      if (!llmProxy) {
        return {
          success: false,
          error: {
            code: 'llm_proxy_unavailable',
            message: 'LLM proxy is not initialised for Companion node'
          }
        };
      }

      if (signal.aborted) {
        return {
          success: false,
          error: {
            code: 'task_cancelled',
            message: 'Task aborted before execution'
          }
        };
      }

      const args: CompanionConversationArgs = (assignment.toolArgs ?? {}) as CompanionConversationArgs;
      const conversationId = args.conversationId ?? assignment.metadata?.conversationId ?? assignment.taskId;
      const messages: LLMMessage[] = Array.isArray(args.messages) ? [...args.messages] : [];

      if (messages.length === 0) {
        return {
          success: false,
          error: {
            code: 'invalid_payload',
            message: 'companion_conversation requires non-empty messages array'
          }
        };
      }

      if (typeof args.prompt === 'string' && args.prompt.trim()) {
        messages.unshift({ role: 'system', content: args.prompt.trim() });
      }

      const streamEnabled = args.llm?.stream !== false;
      const partialOutputs: Array<{ chunk: string; timestamp: number }> = [];
      const delegations = Array.isArray(args.metadata?.delegations) ? args.metadata?.delegations : [];

      const llmOptions = {
        model: args.llm?.model,
        options: {
          temperature: args.llm?.temperature,
          maxTokens: args.llm?.maxTokens,
          stream: streamEnabled
        }
      };

      taskLogger.info('Companion LLM request options', {
        model: llmOptions.model ?? null,
        llmArgs: args.llm ?? null
      });

      const startTime = Date.now();
      let cancelled = false;

      const handle = llmProxy.request({
        messages,
        model: llmOptions.model,
        options: llmOptions.options,
        stream: streamEnabled,
        onStreamChunk: (chunk) => {
          if (chunk.chunk) {
            partialOutputs.push({ chunk: chunk.chunk, timestamp: chunk.timestamp });
            taskLogger.debug('Companion streaming chunk', {
              conversationId,
              length: chunk.chunk.length,
              timestamp: chunk.timestamp
            });
          }
        }
      });

      const abortHandler = () => {
        cancelled = true;
        handle.cancel();
      };
      signal.addEventListener('abort', abortHandler);

      try {
        const final = await handle.final;

        if (cancelled) {
          return {
            success: false,
            error: {
              code: 'task_cancelled',
              message: 'Conversation was cancelled by abort signal'
            }
          };
        }

        taskLogger.info('Companion conversation completed', {
          conversationId,
          tokens: final.usage,
          latencyMs: Date.now() - startTime,
          streamChunks: partialOutputs.length
        });

        return {
          success: true,
          result: {
            conversationId,
            reply: final.content,
            usage: final.usage,
            startedAt: startTime,
            finishedAt: Date.now(),
            partialOutputs,
            delegations
          }
        };
      } catch (error) {
        const elapsed = Date.now() - startTime;
        if (error instanceof LLMProxyError) {
          taskLogger.error('Companion conversation failed via LLM proxy', {
            conversationId,
            code: error.code,
            message: error.message,
            latencyMs: elapsed
          });

          const fallback = args.metadata?.fallbackReply as string | undefined;
          const normalizedMessage = (error.message || '').toLowerCase();
          const isRateLimited =
            error.code === 'rate_limit_exceeded' ||
            error.code === 'quota_exceeded' ||
            (error.code === 'llm_request_failed' && (normalizedMessage.includes('per minute') || normalizedMessage.includes('quota')));
          if (fallback && isRateLimited) {
            return {
              success: true,
              result: {
                conversationId,
                reply: { text: fallback },
                usage: null,
                startedAt: startTime,
                finishedAt: Date.now(),
                partialOutputs,
                delegations,
                degraded: true,
                error: {
                  code: error.code,
                  message: error.message,
                  details: error.details
                }
              }
            };
          }

          return {
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details
            }
          };
        }

        const message = error instanceof Error ? error.message : 'Unknown error during companion conversation';
        taskLogger.error('Companion conversation failed with unexpected error', {
          conversationId,
          message,
          latencyMs: elapsed
        });
        return {
          success: false,
          error: {
            code: 'companion_conversation_failed',
            message
          }
        };
      } finally {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  );

  logger.info('Registered default companion capabilities', {
    tools: ['companion_ack', 'companion_delegate', 'companion_conversation']
  });
}

