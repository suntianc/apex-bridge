# 深度思考流式输出前端实现示例

## 概述

本文档展示如何在前端实时展示 AI 的深度思考过程。当 `enableStreamThoughts: true` 时，前端会接收到多个 SSE 事件，展示完整的思考-行动-观察循环。

## API 请求示例

```javascript
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      {
        role: 'user',
        content: '请分析这个算法的时间复杂度：for(i=0;i<n;i++) for(j=i;j<n;j++) sum += arr[j];'
      }
    ],
    model: 'gpt-4',
    stream: true,  // 启用流式输出
    selfThinking: {
      enabled: true,
      maxIterations: 3,              // 最多思考 3 轮
      includeThoughtsInResponse: true,
      enableStreamThoughts: true     // ⭐ 启用思考过程流式输出
    }
  })
});
```

## 前端实现示例（原生 JavaScript）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>思考过程实时展示</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }

    .container {
      background: white;
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    h1 {
      color: #333;
      margin-bottom: 30px;
    }

    /* 思考过程容器 */
    .thinking-container {
      margin: 20px 0;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #4dabf7;
    }

    .thinking-title {
      font-weight: 600;
      color: #495057;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .thinking-icon {
      width: 20px;
      height: 20px;
      border: 2px solid #4dabf7;
      border-radius: 50%;
      border-top-color: transparent;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* 思考步骤 */
    .thought-step {
      margin: 10px 0;
      padding: 12px;
      background: white;
      border-radius: 6px;
      border-left: 3px solid #339af0;
    }

    .thought-iteration {
      font-size: 12px;
      color: #868e96;
      margin-bottom: 5px;
    }

    .thought-content {
      color: #212529;
      line-height: 1.6;
    }

    /* 行动步骤 */
    .action-step {
      margin: 10px 0;
      padding: 12px;
      background: #fff3bf;
      border-radius: 6px;
      border-left: 3px solid #fab005;
    }

    .action-name {
      font-weight: 600;
      color: #e67700;
      margin-bottom: 5px;
    }

    .action-params {
      font-size: 13px;
      color: #495057;
      font-family: 'Courier New', monospace;
    }

    /* 观察结果 */
    .observation-step {
      margin: 10px 0;
      padding: 12px;
      background: #d3f9d8;
      border-radius: 6px;
      border-left: 3px solid #40c057;
    }

    .observation-label {
      font-weight: 600;
      color: #2f9e44;
      margin-bottom: 5px;
    }

    .observation-result {
      font-size: 13px;
      color: #212529;
      font-family: 'Courier New', monospace;
      white-space: pre-wrap;
    }

    /* 最终答案 */
    .final-answer {
      margin-top: 20px;
      padding: 20px;
      background: #e7f5ff;
      border-radius: 8px;
      border-left: 4px solid #228be6;
    }

    .answer-label {
      font-weight: 600;
      color: #1864ab;
      margin-bottom: 10px;
    }

    .answer-content {
      color: #212529;
      line-height: 1.7;
      white-space: pre-wrap;
    }

    /* 状态提示 */
    .status {
      padding: 10px;
      margin: 10px 0;
      border-radius: 6px;
      font-size: 14px;
    }

    .status-info {
      background: #e7f5ff;
      color: #1971c2;
      border-left: 4px solid #4dabf7;
    }

    .status-error {
      background: #ffe3e3;
      color: #c92a2a;
      border-left: 4px solid #ff6b6b;
    }

    /* 按钮 */
    button {
      background: #339af0;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 500;
      margin-top: 20px;
    }

    button:hover {
      background: #228be6;
    }

    button:disabled {
      background: #ced4da;
      cursor: not-allowed;
    }

    /* 迭代指示器 */
    .iteration-indicator {
      display: inline-block;
      padding: 4px 8px;
      background: #339af0;
      color: white;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 深度思考过程实时展示</h1>

    <button id="startBtn" onclick="startThinking()">开始思考</button>

    <div id="output"></div>
  </div>

  <script>
    // 存储思考状态的变量
    const state = {
      currentIteration: 0,
      thinkingStep: '',
      currentThought: '',
      currentTool: '',
      finalAnswer: ''
    };

    async function startThinking() {
      const button = document.getElementById('startBtn');
      const output = document.getElementById('output');

      // 重置状态
      button.disabled = true;
      output.innerHTML = '';

      try {
        const response = await fetch('http://localhost:3000/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: '请帮我分析这个算法的时间复杂度：for(i=0;i<n;i++) for(j=i;j<n;j++) sum += arr[j];'
            }],
            model: 'gpt-4',
            stream: true,
            selfThinking: {
              enabled: true,
              maxIterations: 3,
              includeThoughtsInResponse: true,
              enableStreamThoughts: true  // ⭐ 启用思考流式输出
            }
          })
        });

        // 创建 EventSource 读取流（或使用 response.body.getReader()）
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // 创建思考容器
        const thinkingContainer = createThinkingContainer();
        output.appendChild(thinkingContainer);

        // 读取流式数据
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              // 处理自定义事件
              const eventType = line.replace('event: ', '').trim();
              await processEvent(eventType, reader, decoder);
            } else if (line.startsWith('data: ')) {
              // 处理数据
              const data = line.replace('data: ', '').trim();
              if (data === '[DONE]') {
                addStatus('✅ 思考完成！', 'status-info');
                button.disabled = false;
                return;
              }

              try {
                const parsed = JSON.parse(data);
                processDataEvent(parsed);
              } catch (e) {
                console.error('解析失败:', data);
              }
            }
          }
        }

      } catch (error) {
        console.error('错误:', error);
        addStatus(`❌ 错误: ${error.message}`, 'status-error');
        button.disabled = false;
      }
    }

    function createThinkingContainer() {
      const container = document.createElement('div');
      container.className = 'thinking-container';
      container.innerHTML = `
        <div class="thinking-title">
          <div class="thinking-icon"></div>
          正在思考中...
          <span class="iteration-indicator" id="iterationBadge" style="display: none;">第 1 轮</span>
        </div>
        <div id="thinkingSteps"></div>
      `;
      return container;
    }

    async function processEvent(eventType, reader, decoder) {
      const { value } = await reader.read();
      const chunk = new TextDecoder().decode(value);
      const dataLine = chunk.split('\n')[0];

      if (dataLine.startsWith('data: ')) {
        const data = JSON.parse(dataLine.replace('data: ', ''));

        switch (eventType) {
          case 'thought_start':
            state.currentIteration = data.iteration;
            updateIterationBadge(data.iteration);
            addThoughtStep('', data.iteration, true); // 开始新思考
            break;

          case 'thought':
            // 思考内容通过 data 事件处理
            break;

          case 'thought_end':
            finalizeCurrentStep();
            break;

          case 'action_start':
            addActionStep(data.tool, data.params, data.iteration);
            break;

          case 'observation':
            addObservationStep(data.tool, data.result || data.error, data.iteration);
            break;

          case 'answer_start':
            finalizeCurrentStep();
            break;

          case 'answer_end':
            // 答案结束
            break;
        }
      }
    }

    function processDataEvent(data) {
      if (data._type === 'thought' && data.choices?.[0]?.delta?.content) {
        // 思考内容
        const content = data.choices[0].delta.content;
        updateCurrentThought(content, data._iteration);
      } else if (data._type === 'answer' && data.choices?.[0]?.delta?.content) {
        // 最终答案
        const content = data.choices[0].delta.content;
        state.finalAnswer += content;
        updateFinalAnswer();
      } else if (data.requestId) {
        // 请求 ID
        console.log('Request ID:', data.requestId);
      }
    }

    function updateIterationBadge(iteration) {
      const badge = document.getElementById('iterationBadge');
      badge.textContent = `第 ${iteration} 轮`;
      badge.style.display = 'inline-block';
    }

    function addThoughtStep(content, iteration, isNew = false) {
      const container = document.getElementById('thinkingSteps');

      if (isNew) {
        // 创建新的思考步骤
        const step = document.createElement('div');
        step.className = 'thought-step';
        step.id = `thought-${iteration}`;
        step.innerHTML = `
          <div class="thought-iteration">思考步骤 ${iteration}</div>
          <div class="thought-content">${escapeHtml(content)}</div>
        `;
        container.appendChild(step);
      }
    }

    function updateCurrentThought(content, iteration) {
      const thought = document.getElementById(`thought-${iteration}`);
      if (thought) {
        const contentDiv = thought.querySelector('.thought-content');
        contentDiv.innerHTML = escapeHtml(content);
      }
    }

    function finalizeCurrentStep() {
      // 思考步骤完成（可以添加完成动画）
    }

    function addActionStep(tool, params, iteration) {
      const container = document.getElementById('thinkingSteps');
      const step = document.createElement('div');
      step.className = 'action-step';
      step.innerHTML = `
        <div class="action-name">🔧 执行工具: ${escapeHtml(tool)} <span class="iteration-indicator">第 ${iteration} 轮</span></div>
        <div class="action-params">参数: ${escapeHtml(JSON.stringify(params, null, 2))}</div>
      `;
      container.appendChild(step);
    }

    function addObservationStep(tool, result, iteration) {
      const container = document.getElementById('thinkingSteps');
      const step = document.createElement('div');
      step.className = 'observation-step';
      step.innerHTML = `
        <div class="observation-label">👁️ 观察结果: ${escapeHtml(tool)} <span class="iteration-indicator">第 ${iteration} 轮</span></div>
        <div class="observation-result">${escapeHtml(result)}</div>
      `;
      container.appendChild(step);
    }

    function updateFinalAnswer() {
      let answerDiv = document.getElementById('finalAnswer');

      if (!answerDiv) {
        const container = document.getElementById('output');
        answerDiv = document.createElement('div');
        answerDiv.className = 'final-answer';
        answerDiv.id = 'finalAnswer';
        answerDiv.innerHTML = `
          <div class="answer-label">📝 最终答案</div>
          <div class="answer-content">${escapeHtml(state.finalAnswer)}</div>
        `;
        container.appendChild(answerDiv);
      } else {
        const contentDiv = answerDiv.querySelector('.answer-content');
        contentDiv.innerHTML = escapeHtml(state.finalAnswer);
      }
    }

    function addStatus(message, className) {
      const output = document.getElementById('output');
      const status = document.createElement('div');
      status.className = `status ${className}`;
      status.textContent = message;
      output.appendChild(status);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>
