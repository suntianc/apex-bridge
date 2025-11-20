#!/bin/bash

# ========================================================================
# 自我思考循环 API 测试脚本
# ========================================================================

set -e

API_URL="http://localhost:8088/v1/chat"
echo "🧪 自我思考循环 API 测试"
echo "============================================================"
echo ""

# 检查 jq 是否安装
if ! command -v jq &> /dev/null; then
    echo "❌ 请先安装 jq: sudo apt-get install jq (或其他包管理器)"
    exit 1
fi

# 检查服务器是否运行
echo "🔍 检查服务器状态..."
if ! curl -s -o /dev/null -w "%{http_code}" "$API_URL/completions" | grep -q "4[0-9][0-9]\|200"; then
    echo "❌ 服务器未运行或未响应"
    echo "   请先启动服务器: npm start"
    exit 1
fi
echo "✅ 服务器运行正常"
echo ""

# 测试函数
test_self_thinking_api() {
    local test_name=$1
    local user_query=$2
    local max_iterations=$3

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 测试: $test_name"
    echo "📝 用户输入: $user_query"
    echo "🔄 最大循环: $max_iterations"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # 发送请求
    response=$(curl -s -X POST "$API_URL/self-thinking" \
        -H "Content-Type: application/json" \
        -d "{
            \"messages\": [
                {
                    \"role\": \"system\",
                    \"content\": \"你是一个助手。可用工具:\\n{{ABPAllTools}}\\n\\n请使用工具来回答用户问题。如果需要多个步骤，请自我思考并逐步完成。\"
                },
                {
                    \"role\": \"user\",
                    \"content\": \"$user_query\"
                }
            ],
            \"selfThinking\": {
                \"enabled\": true,
                \"maxIterations\": $max_iterations,
                \"includeThoughtsInResponse\": true,
                \"enableTaskEvaluation\": true
            },
            \"stream\": false
        }" 2>&1)

    # 解析响应
    content=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null || echo "")
    iterations=$(echo "$response" | jq -r '.metadata.iterations // 0' 2>/dev/null || echo "0")
    tool_calls=$(echo "$response" | jq -r '.metadata.toolCalls // 0' 2>/dev/null || echo "0")
    thinking_process=$(echo "$response" | jq -r '.metadata.thinkingProcess // empty' 2>/dev/null || echo "")

    if [ "$content" = "" ]; then
        echo "❌ 请求失败"
        echo ""
        echo "错误信息:"
        echo "$response" | jq . 2>/dev/null || echo "$response"
        echo ""
        return 1
    fi

    echo "✅ 响应成功"
    echo ""
    echo "🤖 AI 回复:"
    echo "─────────────────────────────────────────────────────────────────────"
    echo "$content" | head -20
    if [ ${#content} -gt 400 ]; then
        echo "..."
        echo "（内容已截断，完整长度: ${#content} 字符）"
    fi
    echo "─────────────────────────────────────────────────────────────────────"
    echo ""
    echo "📊 执行统计:"
    echo "   - 循环次数: $iterations"
    echo "   - 工具调用: $tool_calls"

    if [ "$thinking_process" != "" ] && [ "$thinking_process" != "null" ]; then
        echo ""
        echo "🧠 思考过程:"
        echo "─────────────────────────────────────────────────────────────────────"
        echo "$thinking_process" | head -15
        if [ ${#thinking_process} -gt 500 ]; then
            echo "..."
            echo "（思考过程已截断，完整长度: ${#thinking_process} 字符）"
        fi
        echo "─────────────────────────────────────────────────────────────────────"
    fi

    echo ""
    read -p "按回车继续下一个测试..."
    echo ""
    return 0
}

# 检查自我思考功能状态
echo "🔍 检查自我思考功能状态..."
status_response=$(curl -s "$API_URL/self-thinking/status" 2>/dev/null)
if echo "$status_response" | jq -e '.available' >/dev/null 2>&1; then
    echo "✅ 自我思考功能可用"
    features=$(echo "$status_response" | jq -r '.features | keys[]' | tr '\n' ', ' | sed 's/,$//')
    echo "   功能: $features"
else
    echo "⚠️  无法获取自我思考功能状态，继续测试..."
fi
echo ""

# 运行测试用例
echo "🟢 测试 1: 简单工具调用（掷骰子）"
echo ""
test_self_thinking_api "掷骰子" "帮我掷一个六面骰子" 3

echo "🟢 测试 2: 多步骤任务（检查系统信息）"
echo ""
test_self_thinking_api "系统信息" "先检查系统状态，然后告诉我当前时间" 4

echo "🟢 测试 3: 游戏任务（石头剪刀布）"
echo ""
test_self_thinking_api "石头剪刀布" "我想玩石头剪刀布，帮我出拳并告诉我结果" 3

echo "🟢 测试 4: 复杂任务（组合操作）"
echo ""
test_self_thinking_api "复杂任务" "检查系统状态后，如果系统正常就掷3个骰子并告诉我总和" 5

# 分析任务复杂度
echo "🔍 任务复杂度分析测试"
echo "=========================================================================="

analysis_response=$(curl -s -X POST "$API_URL/self-thinking/analyze" \
    -H "Content-Type: application/json" \
    -d '{"userQuery": "先检查系统状态，然后玩游戏，最后生成报告"}' 2>/dev/null)

if echo "$analysis_response" | jq -e '.analysis' >/dev/null 2>&1; then
    echo "✅ 任务分析成功"
    complexity=$(echo "$analysis_response" | jq -r '.analysis.complexity')
    recommended=$(echo "$analysis_response" | jq -r '.analysis.recommendedIterations')
    reasoning=$(echo "$analysis_response" | jq -r '.analysis.reasoning')

    echo "📊 分析结果:"
    echo "   - 复杂度: $complexity"
    echo "   - 推荐循环次数: $recommended"
    echo "   - 推理: $reasoning"
else
    echo "⚠️  任务分析失败"
fi

echo ""
echo "============================================================"
echo "📊 测试完成"
echo "============================================================"
echo ""
echo "💡 结果解读:"
echo ""
echo "✅ 成功指标:"
echo "  • iterations > 1  → 自我思考循环正常工作"
echo "  • tool_calls > 0  → 工具调用成功"
echo "  • thinking_process 不为空 → 思考过程正常记录"
echo ""
echo "⚠️  调优建议:"
echo "  • 如果 iterations = 1 → 可能任务太简单，不需要循环"
echo "  • 如果 tool_calls = 0 → 检查工具描述是否充分"
echo "  • 如果没有思考过程 → 检查 includeThoughtsInResponse 设置"
echo ""
echo "🔧 配置选项:"
echo "  • maxIterations: 控制最大循环次数（推荐 3-5）"
echo "  • includeThoughtsInResponse: 是否返回思考过程"
echo "  • enableTaskEvaluation: 是否启用任务完成评估"
echo "  • loopTimeout: 总超时时间（毫秒）"
echo ""