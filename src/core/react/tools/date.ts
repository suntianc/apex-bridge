/**
 * 日期工具
 * 获取当前日期和时间
 */

import { Tool } from '../../../types/react';

export const dateTool: Tool = {
  name: 'get_current_date',
  description: '获取当前日期和时间，返回 ISO 8601 格式的时间字符串',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  execute: async () => {
    return new Date().toISOString();
  }
};
