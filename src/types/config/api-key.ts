/**
 * API Key 信息结构
 */
export interface ApiKeyInfo {
  /** 唯一标识 */
  id: string;
  /** 名称（如 "默认项目"、"cherry"） */
  name: string;
  /** 完整的 API Key */
  key: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 上次使用时间戳（可选） */
  lastUsedAt?: number;
  /** 所属人ID（可选） */
  ownerId?: string;
}
