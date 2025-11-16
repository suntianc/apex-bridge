#!/bin/bash

# API测试脚本 - 用于测试主动场景触发
# 
# 使用方法：
# 1. 设置环境变量 ADMIN_TOKEN 或修改下面的 TOKEN
# 2. 确保服务器已启动（npm run dev）
# 3. 运行：bash tests/api-test.sh

BASE_URL="http://localhost:3000"
ADMIN_TOKEN="${ADMIN_TOKEN:-your-admin-token-here}"

echo "🧪 开始测试主动场景触发API"
echo "📍 服务器地址: $BASE_URL"
echo "---"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_trigger() {
    local scene_id=$1
    local user_id=${2:-default}
    
    echo -e "${YELLOW}测试场景: $scene_id${NC}"
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/admin/proactivity/trigger" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -d "{
            \"sceneId\": \"$scene_id\",
            \"userId\": \"$user_id\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✅ 成功${NC}"
        echo "   响应: $body" | jq '.' 2>/dev/null || echo "   $body"
    else
        echo -e "${RED}❌ 失败 (HTTP $http_code)${NC}"
        echo "   响应: $body"
    fi
    echo "---"
}

# 测试1: 生日提醒
test_trigger "birthday_reminder" "default"

# 等待1秒
sleep 1

# 测试2: 纪念日提醒
test_trigger "anniversary_reminder" "default"

# 等待1秒
sleep 1

# 测试3: 早晨问候
test_trigger "morning_greeting" "default"

# 等待1秒
sleep 1

# 测试4: 晚上问候
test_trigger "evening_greeting" "default"

echo -e "${GREEN}✅ 所有测试完成${NC}"
echo ""
echo "💡 提示："
echo "   1. 检查服务器日志查看详细执行情况"
echo "   2. 如果使用WebSocket测试脚本，应该能看到主动消息推送"
echo "   3. 如果场景未触发，检查是否在静音窗或非工作日"

