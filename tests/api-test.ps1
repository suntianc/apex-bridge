# PowerShell API测试脚本 - 用于测试主动场景触发
# 
# 使用方法：
# 1. 设置环境变量 $env:ADMIN_TOKEN 或修改下面的 $TOKEN
# 2. 确保服务器已启动（npm run dev）
# 3. 运行：powershell -ExecutionPolicy Bypass -File tests/api-test.ps1

$BASE_URL = "http://localhost:3000"
$ADMIN_TOKEN = if ($env:ADMIN_TOKEN) { $env:ADMIN_TOKEN } else { "your-admin-token-here" }

Write-Host "🧪 开始测试主动场景触发API" -ForegroundColor Cyan
Write-Host "📍 服务器地址: $BASE_URL"
Write-Host "---"

function Test-Trigger {
    param(
        [string]$SceneId,
        [string]$UserId = "default"
    )
    
    Write-Host "测试场景: $SceneId" -ForegroundColor Yellow
    
    $body = @{
        sceneId = $SceneId
        userId = $UserId
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$BASE_URL/api/admin/proactivity/trigger" `
            -Method POST `
            -Headers @{
                "Content-Type" = "application/json"
                "Authorization" = "Bearer $ADMIN_TOKEN"
            } `
            -Body $body `
            -ErrorAction Stop
        
        Write-Host "✅ 成功" -ForegroundColor Green
        Write-Host "   响应: $($response | ConvertTo-Json -Compress)"
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMessage = $_.Exception.Message
        Write-Host "❌ 失败 (HTTP $statusCode)" -ForegroundColor Red
        Write-Host "   错误: $errorMessage"
    }
    Write-Host "---"
    Start-Sleep -Seconds 1
}

# 测试1: 生日提醒
Test-Trigger -SceneId "birthday_reminder" -UserId "default"

# 测试2: 纪念日提醒
Test-Trigger -SceneId "anniversary_reminder" -UserId "default"

# 测试3: 早晨问候
Test-Trigger -SceneId "morning_greeting" -UserId "default"

# 测试4: 晚上问候
Test-Trigger -SceneId "evening_greeting" -UserId "default"

Write-Host "✅ 所有测试完成" -ForegroundColor Green
Write-Host ""
Write-Host "💡 提示：" -ForegroundColor Cyan
Write-Host "   1. 检查服务器日志查看详细执行情况"
Write-Host "   2. 如果使用WebSocket测试脚本，应该能看到主动消息推送"
Write-Host "   3. 如果场景未触发，检查是否在静音窗或非工作日"

