# Playbook 系统架构改造 - API 设计文档

## 文档信息
- **文档版本**: v1.0.0
- **创建日期**: 2025-12-18
- **作者**: API 设计团队
- **状态**: 待评审

## 1. 设计原则

### 1.1 核心原则
- **向后兼容**: 保持现有 API 不变
- **内部优先**: Playbook 功能主要通过内部集成提供
- **最小暴露**: 仅暴露必要的维护接口
- **RESTful**: 遵循 RESTful 设计规范

### 1.2 接口分类
- **外部接口**: 对用户开放的 API（通过 `/v1/chat/completions`）
- **内部接口**: 内部服务间调用的接口
- **管理接口**: 系统管理和维护的接口

## 2. 外部接口（通过现有 API 提供）

### 2.1 聊天接口增强

#### 现有接口保持不变
```http
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer {api_key}

{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "如何快速迭代产品？"}
  ],
  "stream": true
}
```

#### 响应增强
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1701234567,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "根据快速迭代最佳实践，我建议：\n\n1. 首先明确问题边界\n2. 设计最小可行实验\n3. 快速验证假设\n\n..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 200,
    "total_tokens": 350
  },
  "playbook_metadata": {              // 🆕 新增
    "guidance_applied": true,
    "playbook_name": "快速迭代问题解决",
    "playbook_tags": ["rapid_iteration", "agile_execution"],
    "template_used": "rapid_iteration_guidance",
    "guidance_level": "medium",
    "match_score": 0.92
  }
}
```

#### 客户端提示
```json
{
  "id": "chatcmpl-124",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "...",
        "annotations": [              // 🆕 可选的注释
          {
            "type": "playbook_guidance",
            "playbook": "快速迭代问题解决",
            "confidence": 0.92,
            "description": "基于历史成功经验提供指导"
          }
        ]
      }
    }
  ]
}
```

### 2.2 查询参数扩展

#### 新增可选参数
```json
{
  "model": "gpt-4",
  "messages": [...],
  "playbook_options": {               // 🆕 Playbook 相关选项
    "enabled": true,                  // 是否启用 Playbook 指导
    "guidance_level": "auto",         // 指导强度: light/medium/intensive/auto
    "preferred_types": [              // 偏好类型（可选）
      "rapid_iteration",
      "data_driven_decision"
    ],
    "min_match_score": 0.7,           // 最小匹配分数
    "max_guidance_length": 500        // 最大指导长度
  },
  "stream": true
}
```

#### 响应头信息
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Playbook-Matched: true
X-Playbook-Name: rapid_iteration
X-Playbook-Confidence: 0.92
X-Playbook-Template: rapid_iteration_guidance
```

## 3. 内部接口

### 3.1 类型归纳接口

#### 触发类型归纳
```http
POST /api/playbook/types/induce
Content-Type: application/json
Authorization: Bearer {internal_token}

{
  "source": "historical" | "batch" | "manual",
  "options": {
    "min_samples": 5,
    "min_similarity": 0.75,
    "confidence_threshold": 0.8,
    "max_new_types": 10
  },
  "async": true                      // 是否异步执行
}

Response: 202 Accepted
{
  "task_id": "induction_task_123",
  "status": "pending",
  "estimated_duration": 300000,      // 预估耗时（毫秒）
  "message": "类型归纳任务已提交，正在后台处理"
}

# 查询任务状态
GET /api/playbook/types/induce/{task_id}
Authorization: Bearer {internal_token}

Response: 200 OK
{
  "task_id": "induction_task_123",
  "status": "completed" | "pending" | "failed",
  "progress": 75,                    // 进度百分比
  "result": {
    "induced_types": [
      {
        "tag_name": "rapid_iteration",
        "keywords": ["快速", "迭代", "实验", "验证"],
        "confidence": 0.95,
        "sample_count": 23,
        "playbook_examples": ["pb_123", "pb_456", "pb_789"],
        "rationale": "从 23 个相似 Playbook 中归纳出的快速迭代模式",
        "discovered_from": "historical_clustering"
      }
    ],
    "merged_types": ["agile_execution"],  // 合并的标签
    "deprecated_types": [],               // 衰退的标签
    "confidence_updates": {
      "data_driven_decision": 0.88
    },
    "statistics": {
      "total_playbooks_analyzed": 156,
      "clusters_formed": 12,
      "avg_cluster_size": 4.2,
      "processing_time_ms": 245000
    }
  },
  "completed_at": 1701234567890
}
```

#### 获取类型词汇表
```http
GET /api/playbook/types/vocabulary
Authorization: Bearer {internal_token}
Query Parameters:
  - min_confidence: number (可选，最小置信度)
  - limit: number (可选，最大返回数量，默认100)
  - offset: number (可选，分页偏移，默认0)
  - sort: "confidence" | "created" | "usage" (可选，排序字段)
  - order: "asc" | "desc" (可选，排序方向，默认desc)

Response: 200 OK
{
  "total": 45,
  "items": [
    {
      "tag_name": "rapid_iteration",
      "keywords": ["快速", "迭代", "实验", "验证", "敏捷"],
      "confidence": 0.95,
      "first_identified": 1701234567890,
      "playbook_count": 23,
      "discovered_from": "historical_clustering",
      "created_at": 1701234567890,
      "updated_at": 1701234567890,
      "metadata": {
        "description": "快速迭代问题解决方法",
        "usage_examples": ["MVP开发", "A/B测试", "原型验证"],
        "related_tags": ["agile_execution", "data_driven_decision"],
        "decay_score": 0.1
      },
      "statistics": {
        "usage_frequency": 15.3,          // 每周使用次数
        "avg_satisfaction": 8.7,          // 平均满意度 [1-10]
        "success_rate": 0.92              // 成功率
      }
    }
  ]
}
```

#### 获取类型相似度
```http
GET /api/playbook/types/similarity/{tag_name}
Authorization: Bearer {internal_token}
Query Parameters:
  - threshold: number (可选，相似度阈值，默认0.5)
  - limit: number (可选，最大返回数量，默认10)

Response: 200 OK
{
  "tag_name": "rapid_iteration",
  "similar_tags": [
    {
      "tag_name": "agile_execution",
      "similarity_score": 0.85,
      "co_occurrence_count": 18,
      "relationship_type": "semantic_similar"
    },
    {
      "tag_name": "data_driven_decision",
      "similarity_score": 0.72,
      "co_occurrence_count": 12,
      "relationship_type": "co_occurrence"
    }
  ],
  "statistics": {
    "total_similar_tags": 8,
    "avg_similarity": 0.68,
    "strongest_similarity": 0.85
  }
}
```

### 3.2 Playbook 匹配接口

#### 匹配 Playbook
```http
POST /api/playbook/match
Content-Type: application/json
Authorization: Bearer {internal_token}

{
  "query": "如何快速迭代产品开发？",
  "context": {
    "session_history": ["之前聊过产品规划"],
    "user_profile": {
      "userId": "user_123",
      "preferences": {
        "guidance_style": "detailed"
      }
    },
    "constraints": {
      "max_steps": 5,
      "time_limit": 1800000
    }
  },
  "options": {
    "max_recommendations": 5,
    "min_match_score": 0.6,
    "use_dynamic_types": true
  }
}

Response: 200 OK
{
  "query": "如何快速迭代产品开发？",
  "match_count": 3,
  "matches": [
    {
      "playbook": {
        "id": "pb_123",
        "name": "快速迭代问题解决",
        "description": "通过最小可行实验快速验证假设",
        "type_tags": ["rapid_iteration", "agile_execution"],
        "type_confidence": {
          "rapid_iteration": 0.92,
          "agile_execution": 0.85
        },
        "prompt_template_id": "rapid_iteration_guidance",
        "guidance_level": "medium"
      },
      "match_score": 0.92,
      "match_reasons": [
        "文本相似度高 (92%)",
        "标签 \"rapid_iteration\" 完全匹配",
        "上下文高度匹配"
      ],
      "tag_scores": [
        {"tag": "rapid_iteration", "score": 0.85},
        {"tag": "agile_execution", "score": 0.75}
      ],
      "applicable_steps": [0, 1, 2]
    }
  ]
}
```

### 3.3 提示词模板接口

#### 获取模板
```http
GET /api/playbook/templates/{template_id}
Authorization: Bearer {internal_token}

Response: 200 OK
{
  "template_id": "rapid_iteration_guidance",
  "template_type": "guidance",
  "name": "快速迭代指导模板",
  "content": "根据以下最佳实践指导本次任务：\n\n【目标】{goal}\n【关键步骤】{steps}\n【注意事项】{cautions}\n【预期结果】{expected_outcome}\n\n请在思考和行动中参考以上指导。",
  "variables": ["goal", "steps", "cautions", "expected_outcome"],
  "applicable_tags": ["rapid_iteration", "agile_execution"],
  "guidance_level": "medium",
  "created_at": 1701234567890,
  "updated_at": 1701234567890,
  "usage_count": 156,
  "effectiveness_score": 0.88,
  "metadata": {
    "language": "zh",
    "tone": "professional",
    "max_length": 500
  },
  "statistics": {
    "avg_satisfaction": 8.7,
    "success_rate": 0.92,
    "avg_response_time_ms": 120
  }
}
```

#### 搜索模板
```http
GET /api/playbook/templates
Authorization: Bearer {internal_token}
Query Parameters:
  - template_type: "guidance" | "constraint" | "framework" | "example" (可选)
  - tags: string[] (可选，适用的类型标签)
  - guidance_level: "light" | "medium" | "intensive" (可选)
  - min_effectiveness: number (可选，最小效果评分)
  - limit: number (可选，默认20)
  - offset: number (可选，默认0)

Response: 200 OK
{
  "total": 12,
  "items": [
    {
      "template_id": "rapid_iteration_guidance",
      "template_type": "guidance",
      "name": "快速迭代指导模板",
      "guidance_level": "medium",
      "effectiveness_score": 0.88,
      "usage_count": 156,
      "applicable_tags": ["rapid_iteration", "agile_execution"]
    }
  ]
}
```

#### 渲染模板
```http
POST /api/playbook/templates/{template_id}/render
Content-Type: application/json
Authorization: Bearer {internal_token}

{
  "variables": {
    "goal": "快速验证产品假设",
    "steps": "1. 明确问题边界\n2. 设计最小实验\n3. 快速验证",
    "cautions": "避免过度设计，保持灵活性",
    "expected_outcome": "在1周内获得验证结果"
  },
  "options": {
    "guidance_level": "medium",
    "language": "zh",
    "tone": "professional",
    "max_length": 500
  }
}

Response: 200 OK
{
  "rendered_content": "根据以下最佳实践指导本次任务：\n\n【目标】快速验证产品假设\n【关键步骤】1. 明确问题边界\n2. 设计最小实验\n3. 快速验证\n【注意事项】避免过度设计，保持灵活性\n【预期结果】在1周内获得验证结果\n\n请在思考和行动中参考以上指导。",
  "variables_used": ["goal", "steps", "cautions", "expected_outcome"],
  "token_count": 125,
  "truncated": false
}
```

### 3.4 Playbook 管理接口

#### 获取 Playbook
```http
GET /api/playbook/{playbook_id}
Authorization: Bearer {internal_token}

Response: 200 OK
{
  "id": "pb_123",
  "name": "快速迭代问题解决",
  "description": "通过最小可行实验快速验证假设",
  "type_tags": ["rapid_iteration", "agile_execution"],
  "type_confidence": {
    "rapid_iteration": 0.92,
    "agile_execution": 0.85
  },
  "prompt_template_id": "rapid_iteration_guidance",
  "guidance_level": "medium",
  "guidance_steps": [
    {
      "id": "step_1",
      "description": "明确问题边界",
      "expected_outcome": "清晰的问题定义",
      "key_points": ["具体", "可衡量"],
      "optional": false
    }
  ],
  "context": {
    "domain": "产品开发",
    "scenario": "产品假设验证",
    "complexity": "medium",
    "stakeholders": ["产品经理", "开发团队"]
  },
  "metrics": {
    "successRate": 0.92,
    "usageCount": 45,
    "averageOutcome": 8.7,
    "lastUsed": 1701234567890,
    "timeToResolution": 3600000,
    "userSatisfaction": 8.5
  },
  "createdAt": 1701234567890,
  "lastUpdated": 1701234567890
}
```

#### 搜索 Playbook
```http
GET /api/playbook/search
Authorization: Bearer {internal_token}
Query Parameters:
  - q: string (搜索关键词)
  - type_tags: string[] (类型标签筛选)
  - min_success_rate: number (最小成功率)
  - status: "active" | "archived" | "deprecated" (状态)
  - limit: number (默认20)
  - offset: number (默认0)
  - sort: "relevance" | "success_rate" | "usage_count" | "created" (默认relevance)
  - order: "asc" | "desc" (默认desc)

Response: 200 OK
{
  "total": 45,
  "items": [
    {
      "id": "pb_123",
      "name": "快速迭代问题解决",
      "description": "通过最小可行实验快速验证假设",
      "type_tags": ["rapid_iteration", "agile_execution"],
      "metrics": {
        "successRate": 0.92,
        "usageCount": 45
      },
      "match_score": 0.95
    }
  ]
}
```

## 4. WebSocket 接口

### 4.1 流式聊天增强

#### 客户端发送
```json
{
  "type": "chat.completion",
  "request_id": "req_123",
  "data": {
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "如何快速迭代？"}
    ],
    "stream": true,
    "playbook_options": {
      "enabled": true,
      "guidance_level": "auto"
    }
  }
}
```

#### 服务端响应
```json
{
  "type": "chat.completion.chunk",
  "request_id": "req_123",
  "data": {
    "id": "chatcmpl-123",
    "object": "chat.completion.chunk",
    "created": 1701234567,
    "model": "gpt-4",
    "choices": [
      {
        "index": 0,
        "delta": {
          "content": "根据快速迭代最佳实践..."
        },
        "finish_reason": null
      }
    ],
    "playbook_metadata": {
      "matched": true,
      "playbook_name": "快速迭代问题解决",
      "confidence": 0.92
    }
  }
}
```

## 5. 错误处理

### 5.1 错误响应格式
```json
{
  "error": {
    "code": "PLAYBOOK_MATCH_NOT_FOUND",
    "message": "未找到匹配的 Playbook",
    "details": {
      "query": "如何快速迭代？",
      "min_match_score": 0.7,
      "matched_count": 0
    },
    "request_id": "req_123",
    "timestamp": 1701234567890
  }
}
```

### 5.2 常见错误码
| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| PLAYBOOK_NOT_FOUND | 404 | Playbook 不存在 |
| PLAYBOOK_MATCH_NOT_FOUND | 404 | 未找到匹配的 Playbook |
| TEMPLATE_NOT_FOUND | 404 | 模板不存在 |
| TYPE_NOT_FOUND | 404 | 类型标签不存在 |
| INVALID_TEMPLATE_VARIABLES | 400 | 模板变量无效 |
| INDUCTION_TASK_NOT_FOUND | 404 | 归纳任务不存在 |
| INDUCTION_TASK_FAILED | 500 | 归纳任务执行失败 |
| RATE_LIMIT_EXCEEDED | 429 | 速率限制超限 |
| INSUFFICIENT_PERMISSIONS | 403 | 权限不足 |

## 6. 版本控制

### 6.1 API 版本策略
- **主版本**: 路径版本 `/v1/`, `/v2/`
- **次版本**: 通过 `Accept` 头指定 `application/vnd.apexbridge.v2+json`
- **补丁版本**: 通过查询参数 `?version=1.0.1`

### 6.2 向后兼容
- **现有 API**: 完全保持兼容
- **新增字段**: 以可选方式添加，不影响现有客户端
- **弃用流程**: 提供 6 个月过渡期

### 6.3 示例
```http
GET /v1/playbook/types/vocabulary
Accept: application/vnd.apexbridge.v2+json
```

## 7. 速率限制

### 7.1 限制策略
- **内部接口**: 1000 req/min
- **管理接口**: 100 req/min
- **类型归纳**: 10 req/hour
- **WebSocket**: 100 conn/min

### 7.2 响应头
```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1701234567
X-RateLimit-Window: 60
```

## 8. 监控指标

### 8.1 接口指标
- **请求量**: 每接口、每状态码
- **响应时间**: P50, P95, P99
- **错误率**: 每接口、每错误码
- **Playbook 匹配率**: 匹配成功/总请求

### 8.2 业务指标
- **类型归纳频率**: 每日新增类型数
- **模板使用率**: 每个模板的使用次数
- **指导效果评分**: 平均满意度
- **匹配准确率**: 用户反馈评分

## 9. 安全

### 9.1 认证
- **外部接口**: Bearer Token (API Key)
- **内部接口**: Service-to-Service 认证
- **管理接口**: Admin Token + RBAC

### 9.2 授权
- **角色**: admin, operator, viewer
- **权限**: read, write, manage
- **范围**: 全局、命名空间、具体资源

### 9.3 数据保护
- **敏感信息**: 日志脱敏
- **数据加密**: 传输加密 (HTTPS/WSS)
- **访问审计**: 所有管理操作记录日志

---

**下一步行动**: 请查看 `05-IMPLEMENTATION-PLAN.md` 了解实施计划。
