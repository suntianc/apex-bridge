import { BaseLLM } from 'ace-engine-core';
import { LLMManager } from '../LLMManager';
import { Message } from '../../types';
import { logger } from '../../utils/logger';

export interface ApexLLMAdapterConfig {
  /**
   * Getter for the execution model (Hot Path)
   * Usually follows the user's current selection
   */
  executionModelGetter: () => { provider: string; model: string };

  /**
   * Evolution model configuration (Cold Path)
   * Anchored to a high-intelligence model for reflection
   */
  evolutionModel: { provider: string; model: string };
}

/**
 * Adapter to bridge ACE Engine's BaseLLM interface with ApexBridge's LLMManager
 * Implements the "Dual-Channel" strategy for model routing
 */
export class ApexLLMAdapter implements BaseLLM {
  constructor(
    private llmManager: LLMManager,
    private config: ApexLLMAdapterConfig
  ) { }

  /**
   * Generate text
   */
  async generate(prompt: string): Promise<string> {
    // 1. Smart Routing
    const isEvolutionTask = this.detectEvolutionContext(prompt);
    const targetModel = isEvolutionTask
      ? this.config.evolutionModel
      : this.config.executionModelGetter();

    logger.debug(`[ACE Adapter] Routing to ${targetModel.provider}/${targetModel.model} (Is Evolution: ${isEvolutionTask})`);

    try {
      // 2. Call LLMManager
      const messages: Message[] = [{ role: 'user', content: prompt }];

      const response = await this.llmManager.chat(messages, {
        provider: targetModel.provider,
        model: targetModel.model,
        stream: false // ACE Core expects complete response
      });

      return response.choices[0]?.message?.content || '';
    } catch (error: any) {
      logger.error(`[ACE Adapter] Generate failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate structured output (JSON)
   */
  async generateStructured<T>(prompt: string, schema: unknown): Promise<T> {
    // 1. Force JSON format in prompt
    const jsonPrompt = `${prompt}\n\nIMPORTANT: You must return ONLY a valid JSON object. Do not include any markdown formatting (like \`\`\`json), explanations, or other text. Just the raw JSON string.`;

    // 2. Generate text
    const result = await this.generate(jsonPrompt);

    // 3. Clean and Parse
    const cleanJson = this.extractJson(result);

    try {
      return JSON.parse(cleanJson) as T;
    } catch (e) {
      logger.error(`[ACE Adapter] JSON Parse Error. Raw: ${result.substring(0, 100)}...`);
      throw new Error('Failed to parse structured output from LLM');
    }
  }

  /**
   * Detect if the prompt belongs to Evolution (Reflector/Curator) context
   */
  private detectEvolutionContext(prompt: string): boolean {
    // Keywords from ACE Core prompts
    if (prompt.includes('You are an advanced Reflector')) return true;
    if (prompt.includes('You are a distinct Curator')) return true;
    if (prompt.includes('Analyze the following task execution trajectory')) return true; // Reflector
    if (prompt.includes('Manage and evolve the rule library')) return true; // Curator

    return false;
  }

  /**
   * Extract JSON from potential markdown code blocks
   */
  private extractJson(text: string): string {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) return match[1];

    const match2 = text.match(/```\s*([\s\S]*?)\s*```/);
    if (match2) return match2[1];

    return text.trim();
  }
}
