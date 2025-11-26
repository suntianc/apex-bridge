# React 深度思考流式展示组件

## 安装依赖

```bash
npm install @microsoft/fetch-event-source
```

## 核心 Hook

```typescript
// hooks/useThinkingStream.ts
import { fetchEventSource } from '@microsoft/fetch-event-source';

export interface ThinkingStep {
  id: string;
  type: 'thought' | 'action' | 'observation';
  iteration: number;
  content?: string;
  tool?: string;
  params?: any;
  result?: any;
  error?: string;
}

export interface UseThinkingStreamOptions {
  onStep?: (step: ThinkingStep) => void;
  onAnswer?: (content: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function useThinkingStream(options: UseThinkingStreamOptions = {}) {
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  const [answer, setAnswer] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [currentIteration, setCurrentIteration] = useState(0);

  const startThinking = async (messages: Array<{ role: string; content: string }>) => {
    setIsThinking(true);
    setSteps([]);
    setAnswer('');

    try {
      await fetchEventSource('http://localhost:3000/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages,
          model: 'gpt-4',
          stream: true,
          selfThinking: {
            enabled: true,
            maxIterations: 3,
            includeThoughtsInResponse: true,
            enableStreamThoughts: true  // ⭐ 启用思考流式输出
          }
        }),
        onmessage(event) {
          // 处理标准 data 事件
          if (event.data === '[DONE]') {
            options.onComplete?.();
            setIsThinking(false);
            return;
          }

          try {
            const data = JSON.parse(event.data);

            // 处理思考内容
            if (data._type === 'thought' && data.choices?.[0]?.delta?.content) {
              const content = data.choices[0].delta.content;
              const iteration = data._iteration;

              setSteps(prev => {
                const existing = prev.find(s => s.type === 'thought' && s.iteration === iteration);
                if (existing) {
                  return prev.map(s =>
                    s === existing ? { ...s, content } : s
                  );
                } else {
                  const newStep: ThinkingStep = {
                    id: `thought-${iteration}`,
                    type: 'thought',
                    iteration,
                    content
                  };
                  options.onStep?.(newStep);
                  return [...prev, newStep];
                }
              });
            }
            // 处理最终答案
            else if (data._type === 'answer' && data.choices?.[0]?.delta?.content) {
              const content = data.choices[0].delta.content;
              setAnswer(prev => prev + content);
              options.onAnswer?.(answer + content);
            }
          } catch (e) {
            console.error('解析失败:', event.data);
          }
        },
        onerror(error) {
          console.error('Stream error:', error);
          options.onError?.(error);
          setIsThinking(false);
        }
      });
    } catch (error) {
      options.onError?.(error as Error);
      setIsThinking(false);
    }
  };

  return {
    steps,
    answer,
    isThinking,
    currentIteration,
    startThinking
  };
}
```

## React 组件

```typescript
// components/ThinkingProcess.tsx
import React from 'react';
import { ThinkingStep } from '../hooks/useThinkingStream';
import './ThinkingProcess.css';

interface ThinkingProcessProps {
  steps: ThinkingStep[];
  isThinking: boolean;
  currentIteration: number;
}

export const ThinkingProcess: React.FC<ThinkingProcessProps> = ({
  steps,
  isThinking,
  currentIteration
}) => {
  // 按迭代次数分组
  const groupedSteps = steps.reduce((acc, step) => {
    if (!acc[step.iteration]) {
      acc[step.iteration] = [];
    }
    acc[step.iteration].push(step);
    return acc;
  }, {} as Record<number, ThinkingStep[]>);

  const iterations = Object.keys(groupedSteps)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="thinking-container">
      <div className="thinking-header">
        <div className="thinking-title">
          {isThinking && <div className="thinking-spinner" />}
          <span>{isThinking ? '正在思考中' : '思考过程'}</span>
          {isThinking && (
            <span className="iteration-badge">
              第 {currentIteration} 轮
            </span>
          )}
        </div>
      </div>

      <div className="thinking-steps">
        {iterations.map(iteration => (
          <div key={iteration} className="iteration-block">
            <div className="iteration-title">
              第 {iteration} 轮思考
            </div>

            {groupedSteps[iteration].map(step => (
              <ThinkingStepItem key={step.id} step={step} />
            ))}
          </div>
        ))}

        {steps.length === 0 && !isThinking && (
          <div className="empty-state">
            等待思考开始...
          </div>
        )}
      </div>
    </div>
  );
};

interface ThinkingStepItemProps {
  step: ThinkingStep;
}

const ThinkingStepItem: React.FC<ThinkingStepItemProps> = ({ step }) => {
  switch (step.type) {
    case 'thought':
      return (
        <div className="thought-step">
          <div className="step-icon">🤔</div>
          <div className="step-content">
            <div className="step-title">思考</div>
            <div className="step-text">{step.content}</div>
          </div>
        </div>
      );

    case 'action':
      return (
        <div className="action-step">
          <div className="step-icon">🔧</div>
          <div className="step-content">
            <div className="step-title">执行工具: {step.tool}</div>
            {step.params && (
              <div className="step-params">
                <strong>参数:</strong>
                <pre>{JSON.stringify(step.params, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      );

    case 'observation':
      return (
        <div className="observation-step">
          <div className="step-icon">👁️</div>
          <div className="step-content">
            <div className="step-title">观察结果: {step.tool}</div>
            {step.error ? (
              <div className="step-error">
                <strong>错误:</strong> {step.error}
              </div>
            ) : (
              <div className="step-result">
                <strong>结果:</strong>
                <pre>{JSON.stringify(step.result, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
};
```

```typescript
// components/AnswerDisplay.tsx
import React from 'react';
import './AnswerDisplay.css';

interface AnswerDisplayProps {
  answer: string;
  isComplete: boolean;
}

export const AnswerDisplay: React.FC<AnswerDisplayProps> = ({ answer, isComplete }) => {
  if (!answer && !isComplete) return null;

  return (
    <div className="answer-container">
      <div className="answer-header">
        <div className="answer-title">
          📝 最终答案
          {isComplete && (
            <span className="complete-badge">
              完成
            </span>
          )}
        </div>
      </div>

      <div className="answer-content">
        {answer || '等待生成答案...'}
      </div>
    </div>
  );
};
```

## 主页面组件

```typescript
// pages/ChatPage.tsx
import React, { useState } from 'react';
import { useThinkingStream } from '../hooks/useThinkingStream';
import { ThinkingProcess } from '../components/ThinkingProcess';
import { AnswerDisplay } from '../components/AnswerDisplay';
import './ChatPage.css';

export const ChatPage: React.FC = () => {
  const [input, setInput] = useState('');
  const {
    steps,
    answer,
    isThinking,
    currentIteration,
    startThinking
  } = useThinkingStream({
    onComplete: () => {
      console.log('思考完成！');
    },
    onError: (error) => {
      console.error('思考错误:', error);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) return;

    await startThinking([
      { role: 'user', content: input }
    ]);
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <h1>🤖 AI 深度思考助手</h1>
        <p>实时查看 AI 的思考过程</p>
      </div>

      <div className="chat-content">
        <form onSubmit={handleSubmit} className="input-form">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入问题，查看 AI 如何思考..."
            rows={4}
            disabled={isThinking}
          />
          <button
            type="submit"
            disabled={isThinking || !input.trim()}
            className="submit-btn"
          >
            {isThinking ? '思考中...' : '开始思考'}
          </button>
        </form>

        {isThinking && (
          <div className="status">
            AI 正在进行深度思考（第 {currentIteration} 轮）...
          </div>
        )}

        <div className="results-section">
          <ThinkingProcess
            steps={steps}
            isThinking={isThinking}
            currentIteration={currentIteration}
          />

          <AnswerDisplay
            answer={answer}
            isComplete={!isThinking && answer.length > 0}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
```

## CSS 样式

```css
/* components/ThinkingProcess.css */
.thinking-container {
  margin: 20px 0;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
  border-left: 4px solid #4dabf7;
}

.thinking-header {
  margin-bottom: 15px;
}

.thinking-title {
  font-size: 18px;
  font-weight: 600;
  color: #495057;
  display: flex;
  align-items: center;
  gap: 10px;
}

.thinking-spinner {
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

.iteration-badge {
  display: inline-block;
  padding: 4px 8px;
  background: #339af0;
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  margin-left: 8px;
}

.thinking-steps {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.iteration-block {
  background: white;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.iteration-title {
  font-weight: 600;
  color: #495057;
  margin-bottom: 10px;
  font-size: 14px;
}

.empty-state {
  text-align: center;
  color: #868e96;
  padding: 20px;
  font-style: italic;
}

/* 思考步骤样式 */
.thought-step, .action-step, .observation-step {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5;
}

.thought-step {
  background: #e7f5ff;
  border-left: 3px solid #339af0;
}

.action-step {
  background: #fff3bf;
  border-left: 3px solid #fab005;
}

.observation-step {
  background: #d3f9d8;
  border-left: 3px solid #40c057;
}

.step-icon {
  font-size: 16px;
  margin-top: 2px;
}

.step-content {
  flex: 1;
}

.step-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: #212529;
}

.step-text {
  color: #495057;
  white-space: pre-wrap;
}

.step-params, .step-result {
  margin-top: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
}

.step-params pre, .step-result pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.step-error {
  margin-top: 8px;
  padding: 8px;
  background: #ffe3e3;
  border-radius: 4px;
  color: #c92a2a;
  font-size: 12px;
}
```

```css
/* components/AnswerDisplay.css */
.answer-container {
  margin-top: 20px;
  padding: 20px;
  background: #e7f5ff;
  border-radius: 12px;
  border-left: 4px solid #228be6;
}

.answer-header {
  margin-bottom: 15px;
}

.answer-title {
  font-size: 18px;
  font-weight: 600;
  color: #1864ab;
  display: flex;
  align-items: center;
  gap: 10px;
}

.complete-badge {
  display: inline-block;
  padding: 4px 8px;
  background: #40c057;
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  margin-left: 8px;
}

.answer-content {
  color: #212529;
  line-height: 1.7;
  white-space: pre-wrap;
  font-size: 15px;
}
```

```css
/* pages/ChatPage.css */
.chat-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chat-header {
  text-align: center;
  margin-bottom: 30px;
}

.chat-header h1 {
  color: #333;
  margin-bottom: 10px;
}

.chat-header p {
  color: #666;
  font-size: 16px;
}

.chat-content {
  background: white;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.input-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 20px;
}

.input-form textarea {
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 15px;
  resize: vertical;
  font-family: inherit;
}

.input-form textarea:focus {
  outline: none;
  border-color: #339af0;
}

.submit-btn {
  background: #339af0;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.submit-btn:hover:not(:disabled) {
  background: #228be6;
}

.submit-btn:disabled {
  background: #ced4da;
  cursor: not-allowed;
}

.status {
  padding: 12px;
  margin: 15px 0;
  background: #e7f5ff;
  border-left: 4px solid #4dabf7;
  border-radius: 4px;
  color: #1971c2;
  font-size: 14px;
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
```

## 使用示例

```typescript
// App.tsx
import React from 'react';
import { ChatPage } from './pages/ChatPage';

function App() {
  return (
    <div className="App">
      <ChatPage />
    </div>
  );
}

export default App;
```

## 用户交互流程

1. **输入阶段**：用户在输入框中输入问题
2. **提交阶段**：点击"开始思考"按钮
3. **思考阶段**：
   - 显示"正在思考中"状态
   - 实时展示每一轮思考过程
   - 显示思考内容、工具调用、观察结果
4. **答案阶段**：展示最终答案
5. **完成阶段**：可以输入新问题

## 视觉效果

### 思考过程展示：
```
🤔 思考步骤 1
用户询问算法时间复杂度...

🔧 执行工具: query_database [第 1 轮]
参数: {
  "sql": "SELECT * FROM algorithms WHERE..."
}

👁️ 观察结果: query_database [第 1 轮]
结果: {
  "name": "双重循环",
  "complexity": "O(n²)"
}

🤔 思考步骤 2
根据查询结果...

📝 最终答案
这个算法的时间复杂度是 O(n²)...
```

## 优化建议

1. **添加动画效果**：为思考过程添加淡入、打字机动画
2. **折叠功能**：允许用户折叠/展开每轮思考
3. **时间戳**：显示每个步骤的耗时
4. **复制功能**：允许用户复制思考过程
5. **导出功能**：将完整的思考过程导出为 Markdown

## 注意事项

1. **错误处理**：网络错误、解析错误需要友好提示
2. **性能优化**：大量思考步骤时考虑虚拟滚动
3. **响应式**：确保在移动端也能良好展示
4. **主题适配**：支持深色模式
5. **安全性**：转义 HTML 防止 XSS 攻击

这样，用户就可以：
- **实时观看 AI 的思考过程**
- **理解 AI 如何一步步解决问题**
- **看到 AI 使用了哪些工具**
- **获得透明的推理过程**
