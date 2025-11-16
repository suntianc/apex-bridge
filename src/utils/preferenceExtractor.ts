/**
 * PreferenceExtractor - 偏好提取工具
 * 从对话消息中识别和提取用户偏好
 */

import { Preference } from '../types/memory';
import { logger } from './logger';

/**
 * 偏好提取结果
 */
export interface ExtractedPreference {
  preference: Preference;
  confidence: number;
}

/**
 * 偏好提取器配置
 */
export interface PreferenceExtractorConfig {
  enableLLMExtraction?: boolean;  // 是否使用LLM辅助提取（可选）
  llmClient?: any;                // LLM客户端（可选）
  minConfidence?: number;         // 最小置信度阈值（默认0.5）
}

/**
 * 偏好提取器
 */
export class PreferenceExtractor {
  private config: Required<PreferenceExtractorConfig>;

  constructor(config?: PreferenceExtractorConfig) {
    this.config = {
      enableLLMExtraction: config?.enableLLMExtraction ?? false,
      llmClient: config?.llmClient,
      minConfidence: config?.minConfidence ?? 0.5
    };
  }

  /**
   * 从消息中提取偏好
   * @param message - 用户消息
   * @returns 提取到的偏好数组（可能为空）
   */
  async extractPreferences(message: string): Promise<ExtractedPreference[]> {
    if (!message || message.trim().length === 0) {
      return [];
    }

    const results: ExtractedPreference[] = [];

    // 方法1: 关键词匹配（快速模式）
    const keywordResults = this.extractByKeywords(message);
    results.push(...keywordResults);

    // 方法2: LLM辅助提取（如果启用）
    if (this.config.enableLLMExtraction && this.config.llmClient) {
      try {
        const llmResults = await this.extractByLLM(message);
        results.push(...llmResults);
      } catch (error: any) {
        logger.warn(`⚠️ LLM preference extraction failed: ${error.message}`);
        // 继续使用关键词匹配结果
      }
    }

    // 过滤低置信度结果
    return results.filter(r => r.confidence >= this.config.minConfidence);
  }

  /**
   * 关键词匹配提取（快速模式）
   */
  private extractByKeywords(message: string): ExtractedPreference[] {
    const results: ExtractedPreference[] = [];
    const lowerMessage = message.toLowerCase();

    // 偏好关键词模式
    const preferencePatterns: Array<{
      keywords: string[];
      preferenceType: string;
      extractValue: (msg: string) => string | null;
      confidence: number;
    }> = [
      // 电影偏好
      {
        keywords: ['喜欢', '爱看', '偏好', '最爱', '常看'],
        preferenceType: 'movie_genre',
        extractValue: (msg) => {
          const genres = ['科幻', '科幻片', '动作', '动作片', '喜剧', '喜剧片', '爱情', '爱情片', '恐怖', '恐怖片', '悬疑', '悬疑片', '纪录片', '动画', '动画片'];
          for (const genre of genres) {
            if (msg.includes(genre)) {
              return genre.replace('片', '');
            }
          }
          return null;
        },
        confidence: 0.6
      },
      // 食物偏好
      {
        keywords: ['喜欢', '爱吃', '偏好', '不喜欢', '不爱', '讨厌'],
        preferenceType: 'food_preference',
        extractValue: (msg) => {
          const foods = ['辣', '甜', '咸', '酸', '苦', '清淡', '重口味'];
          for (const food of foods) {
            if (msg.includes(food)) {
              return food;
            }
          }
          return null;
        },
        confidence: 0.6
      },
      // 音乐偏好
      {
        keywords: ['喜欢', '爱听', '偏好', '最爱'],
        preferenceType: 'music_genre',
        extractValue: (msg) => {
          const genres = ['流行', '摇滚', '古典', '爵士', '电子', '民谣', '说唱', 'R&B'];
          for (const genre of genres) {
            if (msg.includes(genre)) {
              return genre;
            }
          }
          return null;
        },
        confidence: 0.6
      },
      // 运动偏好
      {
        keywords: ['喜欢', '爱好', '偏好', '常做', '经常', '常', '总是', '最爱'],
        preferenceType: 'sport_preference',
        extractValue: (msg) => {
          const sports = ['跑步', '游泳', '健身', '瑜伽', '篮球', '足球', '羽毛球', '乒乓球', '网球'];
          for (const sport of sports) {
            if (msg.includes(sport)) {
              return sport;
            }
          }
          return null;
        },
        confidence: 0.6
      }
    ];

    // 检查每个模式
    for (const pattern of preferencePatterns) {
      // 找到匹配的关键词
      const matchedKeyword = pattern.keywords.find(kw => lowerMessage.includes(kw));
      
      if (matchedKeyword) {
        const value = pattern.extractValue(lowerMessage);
        if (value) {
          // 判断是喜欢还是不喜欢
          // 检查关键词前面是否有否定词
          const keywordIndex = lowerMessage.indexOf(matchedKeyword);
          const valueIndex = lowerMessage.indexOf(value);
          const beforeKeyword = lowerMessage.substring(0, keywordIndex);
          
          const isNegative = ['不喜欢', '不爱', '讨厌'].some(kw => beforeKeyword.includes(kw)) ||
                            (beforeKeyword.includes('不') && keywordIndex < valueIndex);

          results.push({
            preference: {
              type: pattern.preferenceType,
              value: isNegative ? `不喜欢${value}` : value,
              confidence: isNegative ? pattern.confidence * 0.8 : pattern.confidence,
              context: message.substring(0, 100) // 保留上下文片段
            },
            confidence: isNegative ? pattern.confidence * 0.8 : pattern.confidence
          });
        }
      }
    }

    return results;
  }

  /**
   * LLM辅助提取（可选，更准确但更慢）
   */
  private async extractByLLM(message: string): Promise<ExtractedPreference[]> {
    if (!this.config.llmClient) {
      return [];
    }

    // 构建LLM提示词
    const prompt = `从以下用户消息中提取偏好信息。如果消息包含用户偏好（如喜欢的电影类型、食物口味、音乐风格等），请以JSON格式返回。

消息："${message}"

请返回JSON数组，格式：
[
  {
    "type": "偏好类型（如movie_genre, food_preference等）",
    "value": "偏好值",
    "confidence": 0.0-1.0之间的置信度
  }
]

如果消息中没有明确的偏好信息，返回空数组 []。`;

    try {
      const response = await this.config.llmClient.chat([{
        role: 'user',
        content: prompt
      }], {
        temperature: 0.3,
        max_tokens: 200
      });

      const content = response.choices?.[0]?.message?.content || '';
      
      // 尝试解析JSON
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const preferences = JSON.parse(jsonMatch[0]);
        return preferences.map((p: any) => ({
          preference: {
            type: p.type,
            value: p.value,
            confidence: p.confidence ?? 0.7,
            context: message.substring(0, 100)
          },
          confidence: p.confidence ?? 0.7
        }));
      }
    } catch (error: any) {
      logger.warn(`⚠️ Failed to extract preferences using LLM: ${error.message}`);
    }

    return [];
  }
}

