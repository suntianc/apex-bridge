/**
 * Web 搜索工具
 * 搜索互联网信息
 */

import { Tool } from '../../../types/react';

export const webSearchTool: Tool = {
  name: 'web_search',
  description: '搜索互联网获取最新信息',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词，例如：天气、新闻、科技动态等'
      }
    },
    required: ['query']
  },
  execute: async (args) => {
    const { query } = args;

    // TODO: 接入真实的搜索 API（如 Google, Bing, SerpAPI 等）
    // 现在是 mock 实现，返回模拟数据

    const mockResults = {
      '北京天气': {
        query: '北京天气',
        results: [
          { title: '北京今天天气', content: '今天北京晴，气温 15-25°C，适合外出' },
          { title: '北京天气预报', content: '未来三天北京天气晴朗，气温逐渐升高' }
        ]
      },
      '新闻': {
        query: '新闻',
        results: [
          { title: '今日热点新闻', content: '今日国内国际热点新闻汇总...' }
        ]
      }
    };

    const result = mockResults[query] || {
      query,
      results: [
        { title: `搜索结果：${query}`, content: `找到关于 "${query}" 的相关信息` }
      ]
    };

    return result;
  }
};
