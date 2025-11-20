#!/bin/bash
# LLM API 测试脚本

BASE_URL="http://localhost:8088"

echo ""
echo "======================================================================"
echo "  ApexBridge LLM API 测试"
echo "======================================================================"
echo ""

# 1. 列出所有提供商
echo "1️⃣  列出所有 LLM 提供商"
echo "----------------------------------------------------------------------"
curl -s ${BASE_URL}/api/llm/providers | jq '.providers[] | {id, provider, name, enabled}'
echo ""

# 2. 获取单个提供商详情
echo "2️⃣  获取 DeepSeek 详情 (ID: 1)"
echo "----------------------------------------------------------------------"
curl -s ${BASE_URL}/api/llm/providers/1 | jq '.provider | {id, provider, name, enabled, config}'
echo ""

# 3. 测试聊天功能
echo "3️⃣  测试聊天功能"
echo "----------------------------------------------------------------------"
curl -s -X POST ${BASE_URL}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请用一句话介绍你自己"}
    ],
    "stream": false
  }' | jq '.choices[0].message.content'
echo ""

echo "======================================================================"
echo "  测试完成"
echo "======================================================================"
echo ""

