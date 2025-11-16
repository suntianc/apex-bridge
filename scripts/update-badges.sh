#!/bin/bash

# 徽章更新脚本 - 快速更新README中的GitHub仓库链接

set -e

echo "🏠 ApexBridge 徽章更新工具"
echo "=============================="

# 检查是否提供了GitHub用户名
if [ $# -eq 0 ]; then
    echo "❌ 错误: 请提供GitHub用户名"
    echo "用法: ./scripts/update-badges.sh <github-username>"
    echo "示例: ./scripts/update-badges.sh myusername"
    exit 1
fi

GITHUB_USERNAME="$1"
REPO_NAME="apex-bridge"

echo "📝 将更新所有README文件中的GitHub仓库链接"
echo "👤 目标用户名: $GITHUB_USERNAME"
echo "📦 仓库名称: $REPO_NAME"

# 1. 更新根目录README
if [ -f "README.md" ]; then
    echo ""
    echo "📖 更新根目录 README.md..."

    # 备份原文件
    cp README.md README.md.backup

    # 替换GitHub相关链接
    sed -i "s|suntianc/apex-bridge|$GITHUB_USERNAME/$REPO_NAME|g" README.md

    # 特殊处理GitHub Actions徽章
    sed -i "s|github.com/suntianc/apex-bridge/workflows/|github.com/$GITHUB_USERNAME/$REPO_NAME/workflows/|g" README.md
    sed -i "s|codecov.io/gh/suntianc/apex-bridge|codecov.io/gh/$GITHUB_USERNAME/$REPO_NAME|g" README.md

    echo "✅ 根目录README.md已更新"
else
    echo "⚠️  根目录README.md不存在"
fi

# 2. 更新子模块README
echo ""
echo "📦 更新子模块README文件..."

# RAG模块
if [ -f "vcp-intellicore-rag/README.md" ]; then
    echo "📖 更新 VCP RAG README.md..."
    sed -i "s|suntianc/vcp-intellicore-rag|$GITHUB_USERNAME/vcp-intellicore-rag|g" vcp-intellicore-rag/README.md
    echo "✅ VCP RAG README.md已更新"
fi

# SDK模块
if [ -f "vcp-intellicore-sdk/README.md" ]; then
    echo "📖 更新 VCP SDK README.md..."
    sed -i "s|suntianc/vcp-intellicore-sdk|$GITHUB_USERNAME/vcp-intellicore-sdk|g" vcp-intellicore-sdk/README.md
    echo "✅ VCP SDK README.md已更新"
fi

# 3. 更新package.json中的仓库信息
echo ""
echo "📦 更新package.json文件..."

# 主项目package.json
if [ -f "apex-bridge/package.json" ]; then
    echo "📖 更新主项目package.json..."
    sed -i "s|\"url\": \"https://github.com/suntianc/apex-bridge.git\"|\"url\": \"https://github.com/$GITHUB_USERNAME/$REPO_NAME.git\"|g" apex-bridge/package.json
    sed -i "s|\"url\": \"https://github.com/suntianc/apex-bridge/issues\"|\"url\": \"https://github.com/$GITHUB_USERNAME/$REPO_NAME/issues\"|g" apex-bridge/package.json
    sed -i "s|\"url\": \"https://github.com/suntianc/apex-bridge#readme\"|\"url\": \"https://github.com/$GITHUB_USERNAME/$REPO_NAME#readme\"|g" apex-bridge/package.json
    echo "✅ 主项目package.json已更新"
fi

# RAG项目package.json
if [ -f "vcp-intellicore-rag/package.json" ]; then
    echo "📖 更新RAG项目package.json..."
    sed -i "s|suntianc/vcp-intellicore-rag|$GITHUB_USERNAME/vcp-intellicore-rag|g" vcp-intellicore-rag/package.json
    echo "✅ RAG项目package.json已更新"
fi

# SDK项目package.json
if [ -f "vcp-intellicore-sdk/package.json" ]; then
    echo "📖 更新SDK项目package.json..."
    sed -i "s|suntianc/vcp-intellicore-sdk|$GITHUB_USERNAME/vcp-intellicore-sdk|g" vcp-intellicore-sdk/package.json
    echo "✅ SDK项目package.json已更新"
fi

# 4. 更新CLAUDE.md文件中的链接
echo ""
echo "🤖 更新CLAUDE.md文件..."

if [ -f "CLAUDE.md" ]; then
    echo "📖 更新根目录CLAUDE.md..."
    sed -i "s|https://github.com/suntianc/apex-bridge|https://github.com/$GITHUB_USERNAME/$REPO_NAME|g" CLAUDE.md
    echo "✅ 根目录CLAUDE.md已更新"
fi

if [ -f "apex-bridge/CLAUDE.md" ]; then
    echo "📖 更新主项目CLAUDE.md..."
    sed -i "s|https://github.com/suntianc/apex-bridge|https://github.com/$GITHUB_USERNAME/$REPO_NAME|g" apex-bridge/CLAUDE.md
    echo "✅ 主项目CLAUDE.md已更新"
fi

# 5. 显示更新摘要
echo ""
echo "🎉 徽章更新完成!"
echo "=================="
echo "📁 已更新的文件:"
echo "  - README.md (根目录)"
echo "  - vcp-intellicore-rag/README.md"
echo "  - vcp-intellicore-sdk/README.md"
echo "  - apex-bridge/package.json"
echo "  - vcp-intellicore-rag/package.json"
echo "  - vcp-intellicore-sdk/package.json"
echo "  - CLAUDE.md (相关文件)"

echo ""
echo "🔗 你的GitHub仓库: https://github.com/$GITHUB_USERNAME/$REPO_NAME"
echo ""
echo "🚀 下一步操作:"
echo "  1. 检查更新结果: git diff"
echo "  2. 提交更改: git add . && git commit -m 'chore: update badges and links for $GITHUB_USERNAME'"
echo "  3. 推送到GitHub: git remote add origin https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
echo "  4. git push -u origin main"

# 6. 检查结果
echo ""
echo "🔍 验证更新结果..."
if command -v grep >/dev/null 2>&1; then
    if grep -q "suntianc/apex-bridge" README.md; then
        echo "⚠️  警告: 根目录README.md中仍包含旧链接"
    else
        echo "✅ 根目录README.md链接已正确更新"
    fi
fi

echo ""
echo "💡 提示: 使用 'npm run docs:check-badges' 验证徽章配置"