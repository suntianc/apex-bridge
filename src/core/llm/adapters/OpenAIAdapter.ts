/**
 * OpenAI适配器
 */

import { BaseOpenAICompatibleAdapter } from "./BaseAdapter";
import { LLMProviderConfig } from "../../../types";
import { ChatOptions } from "../../../types";

export class OpenAIAdapter extends BaseOpenAICompatibleAdapter {
  constructor(config: LLMProviderConfig) {
    super("OpenAI", config);
  }
}
