/**
 * 智谱AI适配器
 */

import { BaseOpenAICompatibleAdapter } from "./BaseAdapter";
import { LLMProviderConfig } from "../../../types";

export class ZhipuAdapter extends BaseOpenAICompatibleAdapter {
  constructor(config: LLMProviderConfig) {
    super("ZhipuAI", config);
  }
}
