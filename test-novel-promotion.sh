#!/bin/bash

echo "🚀 启动 Koma Novel Promotion 集成测试..."
echo ""
echo "✅ 已完成的功能："
echo "  - Episode 管理（创建/编辑/删除）"
echo "  - 资源库（角色/场景管理）"
echo "  - Stage 导航（Config → Script → Storyboard → Video）"
echo "  - 数据库持久化"
echo "  - IPC 通信"
echo ""
echo "📝 测试步骤："
echo "  1. 创建项目"
echo "  2. 点击左侧 '📽️ 短剧' 图标"
echo "  3. 创建 Episode"
echo "  4. 测试资源库（右上角 '📁 资源库' 按钮）"
echo ""
echo "🔧 调试工具："
echo "  - DevTools: Cmd+Option+I"
echo "  - 数据库: ~/Library/Application Support/koma-studio/db/novel_promotion.db"
echo ""

npm run dev
