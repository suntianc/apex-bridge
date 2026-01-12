/**
 * 自定义适配器
 */

import { BaseOpenAICompatibleAdapter } from "./BaseAdapter";
import { LLMProviderConfig } from "../../../types";

export class CustomAdapter extends BaseOpenAICompatibleAdapter {
  constructor(config: LLMProviderConfig) {
    super("Custom", config);
  }
}
