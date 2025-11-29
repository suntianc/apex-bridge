/**
 * ReAct 工具集合
 */

import { Tool } from '../../../types/react';
import { dateTool } from './date';
import { webSearchTool } from './web-search';

// 导出所有工具
export const tools: Tool[] = [
  dateTool,
  webSearchTool
];

// 单独导出
export { dateTool } from './date';
export { webSearchTool } from './web-search';
