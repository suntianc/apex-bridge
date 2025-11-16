import { Logger } from 'winston';
import { TaskOrchestrator } from '../tasks/TaskOrchestrator';
import { TaskContext, TaskResult } from '../tasks/types';
import { delay, AbortError } from '../utils/time';
import { LLMProxy, LLMProxyError } from '../llm/LLMProxy';
import { LLMMessage } from '../protocol/types';

interface WorkerConversationArgs {
  conversationId?: string;
  messages?: LLMMessage[];
  llm?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

export function registerWorkerCapabilities(orchestrator: TaskOrchestrator, logger: Logger, llmProxy?: LLMProxy): void {
  orchestrator.registerTool('echo', async ({ assignment }: TaskContext): Promise<TaskResult> => {
    return {
      success: true,
      result: {
        echoed: assignment.toolArgs,
        metadata: assignment.metadata ?? null
      }
    };
  });

  orchestrator.registerTool('wait', async ({ assignment, signal, logger: taskLogger }: TaskContext): Promise<TaskResult> => {
    const durationRaw = assignment.toolArgs.durationMs ?? assignment.toolArgs.duration ?? 1000;
    const duration = typeof durationRaw === 'number' ? durationRaw : Number.parseInt(String(durationRaw), 10);
    const clamped = Number.isFinite(duration) && duration > 0 ? Math.min(duration, 5 * 60_000) : 1000;

    taskLogger.debug('Wait task started', { durationMs: clamped });

    try {
      await delay(clamped, signal);
      taskLogger.debug('Wait task completed');
      return {
        success: true,
        result: {
          sleptMs: clamped
        }
      };
    } catch (error) {
      if (error instanceof AbortError) {
        taskLogger.warn('Wait task aborted');
        throw error;
      }
      throw error;
    }
  });

  orchestrator.registerTool('llm-tool', async ({ assignment, logger: taskLogger }: TaskContext): Promise<TaskResult> => {
    if (!llmProxy) {
      taskLogger.error('LLM proxy not available for llm-tool');
      return {
        success: false,
        error: {
          code: 'llm_proxy_unavailable',
          message: 'LLM proxy is not available on this node'
        }
      };
    }

    const messagesRaw = assignment.toolArgs.messages;
    if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
      return {
        success: false,
        error: {
          code: 'invalid_arguments',
          message: 'llm-tool requires messages array'
        }
      };
    }

    const model = typeof assignment.toolArgs.model === 'string' ? assignment.toolArgs.model : undefined;
    const stream = assignment.toolArgs.stream === true;

    try {
      const handle = llmProxy.request({
        model,
        messages: messagesRaw,
        options: assignment.toolArgs.options as Record<string, unknown> | undefined,
        stream
      });

      let aggregated = '';
      if (stream && handle.stream) {
        for await (const chunk of handle.stream) {
          aggregated += chunk;
        }
      }

      const final = await handle.final;
      return {
        success: true,
        result: {
          content: final.content ?? aggregated,
          usage: final.usage
        }
      };
    } catch (error) {
      const llmError = error as LLMProxyError;
      taskLogger.error('llm-tool execution failed', {
        code: llmError.code,
        message: llmError.message
      });
      return {
        success: false,
        error: {
          code: llmError.code,
          message: llmError.message,
          details: llmError.details
        }
      };
    }
  });

  orchestrator.registerTool(
    'worker_conversation',
    async ({ assignment, logger: taskLogger, signal }: TaskContext): Promise<TaskResult> => {
      if (!llmProxy) {
        return {
          success: false,
          error: {
            code: 'llm_proxy_unavailable',
            message: 'LLM proxy is not initialised for Worker node'
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

      const args: WorkerConversationArgs = (assignment.toolArgs ?? {}) as WorkerConversationArgs;
      const conversationId = args.conversationId ?? assignment.metadata?.conversationId ?? assignment.taskId;
      const messages: LLMMessage[] = Array.isArray(args.messages) ? [...args.messages] : [];

      if (messages.length === 0) {
        return {
          success: false,
          error: {
            code: 'invalid_payload',
            message: 'worker_conversation requires non-empty messages array'
          }
        };
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

      taskLogger.debug('Worker LLM request options', {
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
            taskLogger.debug('Worker streaming chunk', {
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

        taskLogger.info('Worker conversation completed', {
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
          taskLogger.error('Worker conversation failed via LLM proxy', {
            conversationId,
            code: error.code,
            message: error.message,
            latencyMs: elapsed
          });
          return {
            success: false,
            error: {
              code: error.code,
              message: error.message,
              details: error.details
            }
          };
        }

        const message =
          error instanceof Error ? error.message : 'Unknown error during worker conversation';
        taskLogger.error('Worker conversation failed with unexpected error', {
          conversationId,
          message,
          latencyMs: elapsed
        });
        return {
          success: false,
          error: {
            code: 'worker_conversation_failed',
            message
          }
        };
      } finally {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  );

  logger.info('Registered default worker capabilities', {
    tools: ['echo', 'wait', 'llm-tool', 'worker_conversation']
  });
}

