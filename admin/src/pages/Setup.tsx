import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupApi } from '@/api/setupApi';
import { useSetupStore } from '@/store/setupStore';
import { AdminConfig } from '@/api/configApi';
import { useAuthStore } from '@/store/authStore';

type Step = 1 | 2 | 3 | 4;

export function Setup() {
  const navigate = useNavigate();
  const { checkSetupStatus, hasEnvFile, isSetupCompleted } = useSetupStore();
  const { isAuthenticated } = useAuthStore();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // 步骤1: 管理员账户
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  
  // 步骤2: LLM配置
  const [defaultProvider, setDefaultProvider] = useState('openai');
  const [llmConfigs, setLlmConfigs] = useState<Record<string, any>>({});
  
  // 步骤3: 可选功能
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragConfig, setRagConfig] = useState({
    storagePath: './vector_store',
    baseURL: '',
    apiKey: '',
    model: 'text-embedding-3-small',
    dimensions: '',
  });

  // 初始化时检查设置状态
  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  // 监听isSetupCompleted变化，如果已完成则重定向
  useEffect(() => {
    if (isSetupCompleted) {
      console.log('[Setup] Setup completed, redirecting to login...');
      navigate('/login', { replace: true });
    }
  }, [isSetupCompleted, navigate]);
  
  // 每次组件渲染时也检查一次（确保直接访问URL时能正确跳转）
  useEffect(() => {
    const checkAndRedirect = async () => {
      await checkSetupStatus();
      const currentStatus = useSetupStore.getState().isSetupCompleted;
      if (currentStatus) {
        console.log('[Setup] Setup already completed, redirecting...');
        navigate('/login', { replace: true });
      }
    };
    checkAndRedirect();
  }, [checkSetupStatus, navigate]);

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => (prev + 1) as Step);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  const validateStep1 = (): boolean => {
    setError(''); // 清除之前的错误
    if (!adminUsername || adminUsername.length < 3) {
      setError('用户名至少需要3个字符');
      return false;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setError('密码至少需要6个字符');
      return false;
    }
    if (adminPassword !== adminPasswordConfirm) {
      setError('两次输入的密码不一致');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    setError(''); // 清除之前的错误
    const selectedProvider = llmConfigs[defaultProvider];
    if (!selectedProvider || !selectedProvider.apiKey) {
      setError(`请配置${defaultProvider}的API Key`);
      return false;
    }
    return true;
  };

  const handleMigrateFromEnv = async () => {
    try {
      setLoading(true);
      const result = await setupApi.migrateFromEnv();
      if (result.config) {
        // 填充表单
        setAdminUsername(result.config.auth?.admin?.username || 'admin');
        if (result.config.llm?.defaultProvider) {
          setDefaultProvider(result.config.llm.defaultProvider);
        }
        // 填充LLM配置
        const configs: Record<string, any> = {};
        Object.keys(result.config.llm || {}).forEach((key) => {
          if (key !== 'defaultProvider' && result.config.llm[key]) {
            configs[key] = result.config.llm[key];
          }
        });
        setLlmConfigs(configs);
        // 填充RAG配置
        if (result.config.rag?.enabled) {
          setRagEnabled(true);
          setRagConfig({
            storagePath: result.config.rag.storagePath || './vector_store',
            baseURL: result.config.rag.vectorizer?.baseURL || '',
            apiKey: result.config.rag.vectorizer?.apiKey || '',
            model: result.config.rag.vectorizer?.model || 'text-embedding-3-small',
            dimensions: result.config.rag.vectorizer?.dimensions?.toString() || '',
          });
        }
      }
      setError('');
      alert('配置已从.env文件导入');
    } catch (err: any) {
      setError(err.response?.data?.message || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    try {
      setLoading(true);
      setError('');

      // 构建完整配置
      const config: AdminConfig = {
        setup_completed: true,
        server: {
          port: 8088,
          host: '0.0.0.0',
          nodeEnv: 'development',
          debugMode: false,
        },
        auth: {
          apiKey: '', // 原vcpKey，用于节点之间的认证（WebSocket），现改为apiKey
          apiKeys: [],
          admin: {
            username: adminUsername,
            password: adminPassword,
          },
        },
        plugins: {
          directory: './plugins',
          autoLoad: true,
        },
        llm: {
          defaultProvider,
          ...Object.fromEntries(
            Object.entries(llmConfigs).map(([key, value]) => [
              key,
              // 确保Zhipu的mode和baseURL正确保存
              key === 'zhipu' && value
                ? {
                    ...value,
                    mode: value.mode || 'default',
                    // 如果baseURL为空，根据mode设置
                    baseURL: value.baseURL || (value.mode === 'coding'
                      ? 'https://open.bigmodel.cn/api/coding/paas/v4'
                      : 'https://open.bigmodel.cn/api/paas/v4'),
                  }
                : value,
            ])
          ),
        },
        rag: ragEnabled ? {
          enabled: true,
          storagePath: ragConfig.storagePath,
          vectorizer: ragConfig.baseURL && ragConfig.apiKey ? {
            baseURL: ragConfig.baseURL,
            apiKey: ragConfig.apiKey,
            model: ragConfig.model,
            dimensions: ragConfig.dimensions ? parseInt(ragConfig.dimensions) : undefined,
          } : undefined,
        } : {
          enabled: false,
          storagePath: './vector_store',
        },
      };

      await setupApi.completeSetup(config);
      
      // 更新设置状态
      await checkSetupStatus();
      
      // 如果已经登录，直接跳转到dashboard；否则跳转到登录页
      if (isAuthenticated) {
        navigate('/dashboard');
      } else {
        navigate('/login');
      }
    } catch (err: any) {
      // 显示详细的验证错误信息
      const errorMessage = err.response?.data?.error || '设置失败，请重试';
      const errorDetails = err.response?.data?.errors || [];
      if (errorDetails.length > 0) {
        setError(`${errorMessage}:\n${errorDetails.join('\n')}`);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateLlmConfig = (provider: string, field: string, value: string) => {
    // 清除错误提示（如果用户正在修复）
    if (error) {
      setError('');
    }
    
    setLlmConfigs((prev) => {
      const currentConfig = prev[provider] || {};
      
      // 🆕 如果是Zhipu且修改了mode，需要特殊处理
      if (provider === 'zhipu' && field === 'mode') {
        const defaultNormalURL = 'https://open.bigmodel.cn/api/paas/v4';
        const defaultCodingURL = 'https://open.bigmodel.cn/api/coding/paas/v4';
        const currentBaseURL = currentConfig.baseURL;
        
        // 确定新的baseURL
        let newBaseURL = currentBaseURL;
        // 如果baseURL为空、是默认值之一，或者与当前mode不匹配，则更新
        if (!currentBaseURL || 
            currentBaseURL === defaultNormalURL || 
            currentBaseURL === defaultCodingURL) {
          newBaseURL = value === 'coding' ? defaultCodingURL : defaultNormalURL;
        }
        
        return {
          ...prev,
          [provider]: {
            ...currentConfig,
            mode: value, // 更新mode
            baseURL: newBaseURL, // 更新baseURL
            apiKey: currentConfig.apiKey || '',
            defaultModel: currentConfig.defaultModel || getDefaultModel(provider),
            timeout: currentConfig.timeout || 60000,
            maxRetries: currentConfig.maxRetries || 3,
          },
        };
      }
      
      // 构建更新后的配置（非mode字段的更新）
      const updated = {
        ...prev,
        [provider]: {
          ...currentConfig,
          [field]: value, // 更新当前字段
          // 保留已有字段，如果没有则使用默认值
          baseURL: currentConfig.baseURL || getDefaultBaseUrl(provider),
          defaultModel: currentConfig.defaultModel || getDefaultModel(provider),
          timeout: currentConfig.timeout || 60000,
          maxRetries: currentConfig.maxRetries || 3,
          mode: currentConfig.mode || 'default',
        },
      };
      
      // 🆕 如果是Zhipu且baseURL为空或默认，根据mode设置
      if (provider === 'zhipu' && field !== 'mode') {
        const mode = updated[provider].mode || 'default';
        const currentBaseURL = updated[provider].baseURL;
        const defaultNormalURL = 'https://open.bigmodel.cn/api/paas/v4';
        const defaultCodingURL = 'https://open.bigmodel.cn/api/coding/paas/v4';
        
        if (!currentBaseURL || 
            currentBaseURL === defaultNormalURL || 
            currentBaseURL === defaultCodingURL) {
          updated[provider].baseURL = mode === 'coding'
            ? defaultCodingURL
            : defaultNormalURL;
        }
      }
      
      return updated;
    });
  };

  const getDefaultBaseUrl = (provider: string): string => {
    const urls: Record<string, string> = {
      openai: 'https://api.openai.com/v1',
      deepseek: 'https://api.deepseek.com/v1',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      claude: 'https://api.anthropic.com/v1',
      ollama: 'http://localhost:11434',
      custom: 'http://localhost:8080/v1',
    };
    return urls[provider] || '';
  };

  const getDefaultModel = (provider: string): string => {
    const models: Record<string, string> = {
      openai: 'gpt-4',
      deepseek: 'deepseek-chat',
      zhipu: 'glm-4',
      claude: 'claude-3-5-sonnet-20241022',
      ollama: 'llama3',
      custom: 'custom-model',
    };
    return models[provider] || '';
  };

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-8">
      <div className="card max-w-4xl w-full">
        <h1 className="text-4xl font-semibold mb-4 tracking-tight">欢迎使用 Apex Bridge</h1>
        <p className="text-text-secondary mb-12 text-lg">请完成初始设置以开始使用</p>

        {/* 进度指示 */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`flex-1 h-1.5 mx-1 rounded-full transition-all duration-300 ${
                  step <= currentStep ? 'bg-text-primary' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between text-sm text-text-tertiary">
            <span>管理员账户</span>
            <span>LLM配置</span>
            <span>可选功能</span>
            <span>完成设置</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm whitespace-pre-line">
            {error}
          </div>
        )}

        {/* 步骤1: 管理员账户 */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {hasEnvFile && (
              <div className="p-6 bg-cream-100 border border-gray-200 rounded-lg mb-6">
                <p className="text-sm text-text-secondary mb-4">
                  检测到.env文件，是否要从.env导入配置？
                </p>
                <button
                  onClick={handleMigrateFromEnv}
                  disabled={loading}
                  className="btn btn-secondary text-sm"
                >
                  从.env导入
                </button>
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label className="label">
                  管理员用户名 *
                </label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => {
                    setAdminUsername(e.target.value);
                    // 清除错误提示（如果用户正在修复）
                    if (error && e.target.value.length >= 3) {
                      setError('');
                    }
                  }}
                  className="input"
                  placeholder="admin"
                  required
                />
              </div>

              <div>
                <label className="label">
                  密码 *
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    // 清除错误提示（如果用户正在修复）
                    if (error && adminPasswordConfirm && e.target.value === adminPasswordConfirm) {
                      setError('');
                    }
                  }}
                  className="input"
                  placeholder="至少6个字符"
                  required
                />
              </div>

              <div>
                <label className="label">
                  确认密码 *
                </label>
                <input
                  type="password"
                  value={adminPasswordConfirm}
                  onChange={(e) => {
                    setAdminPasswordConfirm(e.target.value);
                    // 清除错误提示（如果用户正在修复）
                    if (error && adminPassword && e.target.value === adminPassword) {
                      setError('');
                    }
                  }}
                  className="input"
                  placeholder="再次输入密码"
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* 步骤2: LLM配置 */}
        {currentStep === 2 && (
          <div className="space-y-8">
            <div>
              <label className="label">
                默认LLM提供商 *
              </label>
              <select
                value={defaultProvider}
                onChange={(e) => setDefaultProvider(e.target.value)}
                className="input"
              >
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="zhipu">智谱AI</option>
                <option value="claude">Claude</option>
                <option value="ollama">Ollama</option>
                <option value="custom">自定义</option>
              </select>
            </div>

            <div className="divider pt-6">
              <h3 className="text-lg font-semibold text-text-primary mb-6 tracking-tight">
                配置 {defaultProvider} 提供商
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="label">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={llmConfigs[defaultProvider]?.apiKey || ''}
                    onChange={(e) => {
                      updateLlmConfig(defaultProvider, 'apiKey', e.target.value);
                      // 清除错误提示（如果用户正在修复）
                      if (error && e.target.value) {
                        setError('');
                      }
                    }}
                    className="input"
                    placeholder="sk-..."
                    required
                  />
                </div>

                {/* 🆕 Zhipu专用：Mode选择 */}
                {defaultProvider === 'zhipu' && (
                  <div>
                    <label className="label">
                      套餐模式 *
                    </label>
                    <select
                      value={llmConfigs[defaultProvider]?.mode || 'default'}
                      onChange={(e) => {
                        const newMode = e.target.value;
                        console.log('[Setup] Zhipu mode changed to:', newMode);
                        updateLlmConfig(defaultProvider, 'mode', newMode);
                      }}
                      className="input"
                      style={{ 
                        cursor: 'pointer',
                        appearance: 'auto',
                        WebkitAppearance: 'menulist',
                        MozAppearance: 'menulist'
                      }}
                    >
                      <option value="default">普通套餐</option>
                      <option value="coding">Coding套餐</option>
                    </select>
                    <p className="text-xs text-text-tertiary mt-1">
                      选择您购买的套餐类型，将自动设置对应的API地址
                      {llmConfigs[defaultProvider]?.mode && ` (当前: ${llmConfigs[defaultProvider].mode === 'coding' ? 'Coding套餐' : '普通套餐'})`}
                    </p>
                  </div>
                )}

                <div>
                  <label className="label">
                    Base URL {defaultProvider === 'zhipu' && '(根据套餐模式自动设置)'}
                  </label>
                  <input
                    type="text"
                    value={llmConfigs[defaultProvider]?.baseURL || getDefaultBaseUrl(defaultProvider)}
                    onChange={(e) => updateLlmConfig(defaultProvider, 'baseURL', e.target.value)}
                    className="input"
                    placeholder={getDefaultBaseUrl(defaultProvider)}
                    disabled={defaultProvider === 'zhipu' && !llmConfigs[defaultProvider]?.baseURL}
                  />
                  {defaultProvider === 'zhipu' && (
                    <p className="text-xs text-text-tertiary mt-1">
                      可以根据需要手动修改，或留空使用套餐模式对应的默认地址
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">
                    默认模型
                  </label>
                  <input
                    type="text"
                    value={llmConfigs[defaultProvider]?.defaultModel || getDefaultModel(defaultProvider)}
                    onChange={(e) => updateLlmConfig(defaultProvider, 'defaultModel', e.target.value)}
                    className="input"
                    placeholder={getDefaultModel(defaultProvider)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 步骤3: 可选功能 */}
        {currentStep === 3 && (
          <div className="space-y-8">
            <div className="flex items-center justify-between p-6 border border-gray-200 rounded-lg bg-white">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1 tracking-tight">启用RAG功能</h3>
                <p className="text-sm text-text-tertiary">向量检索增强生成</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={ragEnabled}
                  onChange={(e) => setRagEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-primary"></div>
              </label>
            </div>

            {ragEnabled && (
              <div className="p-6 bg-cream-50 rounded-lg space-y-6 border border-gray-200">
                <div>
                  <label className="label">
                    存储路径
                  </label>
                  <input
                    type="text"
                    value={ragConfig.storagePath}
                    onChange={(e) => setRagConfig({ ...ragConfig, storagePath: e.target.value })}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">
                    Vectorizer Base URL
                  </label>
                  <input
                    type="text"
                    value={ragConfig.baseURL}
                    onChange={(e) => setRagConfig({ ...ragConfig, baseURL: e.target.value })}
                    className="input"
                    placeholder="https://api.siliconflow.cn/v1"
                  />
                </div>

                <div>
                  <label className="label flex items-center justify-between gap-2">
                    <span>Embedding API Key</span>
                    <span className="text-xs text-text-tertiary">真实嵌入服务密钥，保存后用于向量写入</span>
                  </label>
                  <input
                    type="password"
                    value={ragConfig.apiKey}
                    onChange={(e) => setRagConfig({ ...ragConfig, apiKey: e.target.value })}
                    className="input"
                    placeholder="例如：sk-xxxx"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="label">
                      模型名称
                    </label>
                    <input
                      type="text"
                      value={ragConfig.model}
                      onChange={(e) => setRagConfig({ ...ragConfig, model: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="label">
                      维度
                    </label>
                    <input
                      type="number"
                      value={ragConfig.dimensions}
                      onChange={(e) => setRagConfig({ ...ragConfig, dimensions: e.target.value })}
                      className="input"
                      placeholder="1536"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 步骤4: 完成设置 */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="p-6 bg-cream-100 border border-gray-200 rounded-lg">
              <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">配置摘要</h3>
              <ul className="text-sm text-text-secondary space-y-2">
                <li>管理员账户: <span className="font-medium text-text-primary">{adminUsername}</span></li>
                <li>默认LLM提供商: <span className="font-medium text-text-primary">{defaultProvider}</span></li>
                <li>RAG功能: <span className="font-medium text-text-primary">{ragEnabled ? '已启用' : '未启用'}</span></li>
              </ul>
            </div>

            <p className="text-base text-text-secondary">
              点击"完成设置"保存配置并开始使用系统。
            </p>
          </div>
        )}

        {/* 按钮 */}
        <div className="flex justify-between mt-12">
          <button
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="btn btn-secondary"
          >
            上一步
          </button>

          {currentStep < 4 ? (
            <button
              onClick={() => {
                if (currentStep === 1 && validateStep1()) {
                  handleNext();
                } else if (currentStep === 2 && validateStep2()) {
                  handleNext();
                } else if (currentStep === 3) {
                  handleNext();
                }
              }}
              className="btn btn-primary"
            >
              下一步
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? '保存中...' : '完成设置'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
