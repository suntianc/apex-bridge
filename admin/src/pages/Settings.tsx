import { useEffect, useState, useRef } from 'react';
import { useConfigStore } from '@/store/configStore';
import { AdminConfig, configApi } from '@/api/configApi';
import { authApi, ApiKeyInfo } from '@/api/authApi';

export function Settings() {
  const { config, loading, error, loadConfig, updateConfig } = useConfigStore();
  const [localConfig, setLocalConfig] = useState<Partial<AdminConfig> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [requiresRestart, setRequiresRestart] = useState(false);
  
  // 🆕 API Keys 管理状态
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [showCreateApiKeyModal, setShowCreateApiKeyModal] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [showRegenerateNodeKeyConfirm, setShowRegenerateNodeKeyConfirm] = useState(false);

  useEffect(() => {
    loadConfig();
    loadApiKeys();
  }, []);

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    }
  }, [config]);

  // 🆕 加载 API Keys
  const loadApiKeys = async () => {
    try {
      setLoadingApiKeys(true);
      const response = await authApi.listApiKeys();
      if (response.success) {
        setApiKeys(response.apiKeys);
      }
    } catch (err) {
      console.error('Failed to load API Keys:', err);
    } finally {
      setLoadingApiKeys(false);
    }
  };

  // 🆕 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('已复制到剪贴板');
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('复制失败');
    });
  };

  // 🆕 创建 API Key
  const handleCreateApiKey = async () => {
    if (!newApiKeyName.trim()) {
      alert('请输入 API Key 名称');
      return;
    }
    try {
      const response = await authApi.generateApiKey({ name: newApiKeyName.trim() });
      if (response.success) {
        setShowCreateApiKeyModal(false);
        setNewApiKeyName('');
        await loadApiKeys();
        // 显示完整的 key 供用户复制
        if (confirm(`API Key 已生成：\n${response.apiKey.key}\n\n是否复制到剪贴板？`)) {
          copyToClipboard(response.apiKey.key);
        }
      }
    } catch (err: any) {
      console.error('Failed to create API Key:', err);
      alert(err.response?.data?.error || '创建 API Key 失败');
    }
  };

  // 🆕 删除 API Key
  const handleDeleteApiKey = async (id: string, name: string) => {
    if (confirm(`确定要删除 API Key "${name}" 吗？此操作不可恢复。`)) {
      try {
        await authApi.deleteApiKey(id);
        await loadApiKeys();
      } catch (err) {
        console.error('Failed to delete API Key:', err);
        alert('删除失败');
      }
    }
  };

  // 🆕 重新生成节点认证Key（原VCP Key，现改为API Key）
  const handleRegenerateNodeKey = async () => {
    if (!showRegenerateNodeKeyConfirm) {
      setShowRegenerateNodeKeyConfirm(true);
      return;
    }
    
    try {
      // 优先使用新的generateNodeKey，fallback到generateVCPKey（向后兼容）
      let response;
      try {
        response = await authApi.generateNodeKey();
      } catch (err) {
        // 如果新API不存在，使用旧API（向后兼容）
        response = await authApi.generateVCPKey();
      }
      
      if (response.success) {
        handleUpdate(['auth', 'apiKey'], response.key);
        // 向后兼容：如果存在vcpKey字段，也更新它
        if ((localConfig as any).auth?.vcpKey !== undefined) {
          handleUpdate(['auth', 'vcpKey'], response.key);
        }
        setShowRegenerateNodeKeyConfirm(false);
        alert('节点认证Key已重新生成（原VCP Key）');
      }
    } catch (err) {
      console.error('Failed to regenerate node authentication key:', err);
      alert('生成节点认证Key失败');
    }
  };

  const handleUpdate = (path: string[], value: any) => {
    if (!localConfig) return;
    
    const newConfig = { ...localConfig };
    let current: any = newConfig;
    
    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) {
        current[path[i]] = {};
      }
      current = current[path[i]];
    }
    
    current[path[path.length - 1]] = value;
    setLocalConfig(newConfig);
  };

  const handleSave = async () => {
    if (!localConfig) return;
    
    try {
      setSaving(true);
      setSaveSuccess(false);
      const needsRestart = await updateConfig(localConfig);
      setRequiresRestart(needsRestart);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (confirm('确定要重置为默认配置吗？')) {
      try {
        await useConfigStore.getState().resetConfig();
        await loadConfig();
      } catch (err) {
        console.error('Failed to reset config:', err);
      }
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 导出配置
  const handleExport = async () => {
    try {
      const blob = await configApi.exportConfig();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `admin-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to export config:', err);
      alert(err.response?.data?.error || '导出配置失败');
    }
  };

  // 导入配置
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedConfig = JSON.parse(text);

      // 验证配置格式
      if (!importedConfig || typeof importedConfig !== 'object') {
        alert('配置文件格式无效');
        return;
      }

      if (!confirm('确定要导入此配置吗？当前配置将被覆盖。')) {
        return;
      }

      const result = await configApi.importConfig(importedConfig);
      setRequiresRestart(result.requires_restart);
      
      // 重新加载配置
      await loadConfig();
      
      alert(result.requires_restart 
        ? '配置已导入，需要重启服务器才能生效。'
        : '配置已导入成功。');
    } catch (err: any) {
      console.error('Failed to import config:', err);
      if (err instanceof SyntaxError) {
        alert('配置文件格式错误：无效的JSON格式');
      } else {
        alert(err.response?.data?.error || '导入配置失败');
      }
    } finally {
      // 清空文件输入，允许重复导入同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return <div className="text-center py-16">
      <p className="text-text-tertiary">加载中...</p>
    </div>;
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
        错误: {error}
      </div>
    );
  }

  if (!localConfig) {
    return <div>配置未加载</div>;
  }

  return (
    <div className="space-y-8 md:space-y-12">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold mb-4 tracking-tight">配置管理</h1>
          <p className="text-text-secondary text-base md:text-lg">系统配置和参数设置</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button onClick={handleExport} className="btn btn-ghost w-full md:w-auto">
            📥 导出配置
          </button>
          <label className="btn btn-ghost w-full md:w-auto cursor-pointer">
            📤 导入配置
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button onClick={handleReset} className="btn btn-secondary w-full md:w-auto">
            重置为默认
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary w-full md:w-auto"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-6 bg-cream-100 border border-gray-200 text-text-primary rounded-lg">
          {requiresRestart ? (
            <p className="font-medium">配置已保存，需要重启服务器才能生效。</p>
          ) : (
            <p className="font-medium">配置已保存。</p>
          )}
        </div>
      )}

      {/* 系统参数 */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-8 tracking-tight">系统参数</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label">
              端口
            </label>
            <input
              type="number"
              value={localConfig.server?.port || 8088}
              onChange={(e) => handleUpdate(['server', 'port'], parseInt(e.target.value))}
              className="input"
            />
          </div>
          <div>
            <label className="label">
              主机地址
            </label>
            <input
              type="text"
              value={localConfig.server?.host || '0.0.0.0'}
              onChange={(e) => handleUpdate(['server', 'host'], e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">
              运行环境
            </label>
            <select
              value={localConfig.server?.nodeEnv || 'development'}
              onChange={(e) => handleUpdate(['server', 'nodeEnv'], e.target.value)}
              className="input"
            >
              <option value="development">development</option>
              <option value="production">production</option>
              <option value="test">test</option>
            </select>
          </div>
          <div>
            <label className="label">
              调试模式
            </label>
            <label className="relative inline-flex items-center cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={localConfig.server?.debugMode || false}
                onChange={(e) => handleUpdate(['server', 'debugMode'], e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-primary"></div>
            </label>
          </div>
        </div>
        <p className="text-sm text-text-tertiary mt-6">⚠️ 修改系统参数需要重启服务器</p>
      </div>

      {/* 认证配置 */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-8 tracking-tight">认证配置</h2>
        <div className="space-y-6">
          <div className="p-4 bg-cream-50 rounded-lg border border-gray-200 mb-6">
            <p className="text-sm text-text-secondary mb-2">
              <strong>节点认证Key（原VCP Key）</strong>：用于节点之间的认证（WebSocket 连接）。节点之间通信使用此 Key 进行认证。
            </p>
            <p className="text-sm text-text-secondary">
              <strong>客户端API Keys</strong>：用于客户端连接服务器的认证（HTTP API）。每个客户端可以使用不同的 API Key，支持多客户端访问、密钥轮换或权限分级。
            </p>
          </div>
          
          {/* 节点认证Key（ABP-only） */}
          <div>
            <label className="label flex items-center gap-2">
              <span>节点认证 Key</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                   const nodeKey = localConfig.auth?.apiKey;
                    if (nodeKey) {
                      copyToClipboard(nodeKey);
                    }
                  }}
                  className="text-xs btn btn-secondary py-1 px-3"
                  disabled={!localConfig.auth?.apiKey}
                >
                  复制
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateNodeKey}
                  className="text-xs btn btn-secondary py-1 px-3"
                >
                  {showRegenerateNodeKeyConfirm ? '确认重新生成' : '重新生成'}
                </button>
                {showRegenerateNodeKeyConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowRegenerateNodeKeyConfirm(false)}
                    className="text-xs btn py-1 px-3"
                  >
                    取消
                  </button>
                )}
              </div>
            </label>
            <input
              type="text"
              value={localConfig.auth?.apiKey || ''}
              onChange={(e) => {
                handleUpdate(['auth', 'apiKey'], e.target.value);
              }}
              className="input"
              placeholder="sk-intellicore-xxx"
              readOnly={showRegenerateNodeKeyConfirm}
            />
            {showRegenerateNodeKeyConfirm && (
              <p className="text-sm text-text-secondary mt-2">
                警告：重新生成节点认证Key将导致所有使用旧 Key 的节点连接断开，需要更新节点配置。
              </p>
            )}
          </div>
          
          {/* 🆕 API Keys（客户端连接用）- 表格展示 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="label mb-0">API Keys（客户端连接用）</label>
              <button
                type="button"
                onClick={() => setShowCreateApiKeyModal(true)}
                className="text-sm btn btn-primary py-2 px-4"
              >
                + 创建 API Key
              </button>
            </div>
            
            {loadingApiKeys ? (
              <p className="text-sm text-text-secondary">加载中...</p>
            ) : apiKeys.length === 0 ? (
              <p className="text-sm text-text-secondary">暂无 API Keys，点击"创建 API Key"添加</p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">名称</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">API key</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">创建时间</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">上次使用时间</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {apiKeys.map((apiKey) => (
                      <tr key={apiKey.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{apiKey.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{apiKey.key}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(apiKey.fullKey || apiKey.key)}
                              className="text-gray-400 hover:text-gray-600"
                              title="复制完整 Key"
                            >
                              📋
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(apiKey.createdAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {apiKey.lastUsedAt 
                            ? new Date(apiKey.lastUsedAt).toLocaleDateString('zh-CN')
                            : <span className="text-gray-400">未使用</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            type="button"
                            onClick={() => handleDeleteApiKey(apiKey.id, apiKey.name)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          {/* 🆕 创建 API Key 对话框 */}
          {showCreateApiKeyModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-96">
                <h3 className="text-lg font-semibold mb-4">创建 API Key</h3>
                <div className="mb-4">
                  <label className="label">名称</label>
                  <input
                    type="text"
                    value={newApiKeyName}
                    onChange={(e) => setNewApiKeyName(e.target.value)}
                    className="input w-full"
                    placeholder="例如：默认项目、cherry、cursor"
                    autoFocus
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateApiKey();
                      }
                    }}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateApiKeyModal(false);
                      setNewApiKeyName('');
                    }}
                    className="btn btn-secondary py-2 px-4"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateApiKey}
                    className="btn btn-primary py-2 px-4"
                  >
                    创建
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LLM配置 */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-8 tracking-tight">LLM配置</h2>
        <div className="space-y-8">
          <div>
            <label className="label">
              默认提供商
            </label>
            <select
              value={localConfig.llm?.defaultProvider || 'openai'}
              onChange={(e) => handleUpdate(['llm', 'defaultProvider'], e.target.value)}
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

          {/* 各提供商配置 */}
          {['openai', 'deepseek', 'zhipu', 'claude', 'ollama', 'custom'].map((provider) => {
            const providerConfig = localConfig.llm?.[provider as keyof typeof localConfig.llm];
            if (!providerConfig) return null;
            
            return (
              <div key={provider} className="divider pt-6">
                <h3 className="text-base font-semibold text-text-primary mb-6 capitalize tracking-tight">{provider}</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="label">API Key</label>
                    <input
                      type="password"
                      value={(providerConfig as any)?.apiKey || ''}
                      onChange={(e) => {
                        const current = providerConfig || {};
                        handleUpdate(['llm', provider], { ...current, apiKey: e.target.value });
                      }}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Base URL</label>
                    <input
                      type="text"
                      value={(providerConfig as any)?.baseURL || ''}
                      onChange={(e) => {
                        const current = providerConfig || {};
                        handleUpdate(['llm', provider], { ...current, baseURL: e.target.value });
                      }}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">默认模型</label>
                    <input
                      type="text"
                      value={(providerConfig as any)?.defaultModel || ''}
                      onChange={(e) => {
                        const current = providerConfig || {};
                        handleUpdate(['llm', provider], { ...current, defaultModel: e.target.value });
                      }}
                      className="input"
                    />
                  </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="label">超时(ms)</label>
                    <input
                      type="number"
                      value={(providerConfig as any)?.timeout || 60000}
                      onChange={(e) => {
                        const current = providerConfig || {};
                        handleUpdate(['llm', provider], { ...current, timeout: parseInt(e.target.value) });
                      }}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">重试次数</label>
                    <input
                      type="number"
                      value={(providerConfig as any)?.maxRetries || 3}
                      onChange={(e) => {
                        const current = providerConfig || {};
                        handleUpdate(['llm', provider], { ...current, maxRetries: parseInt(e.target.value) });
                      }}
                      className="input"
                    />
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RAG配置 */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-8 tracking-tight">RAG配置</h2>
        <div className="space-y-6">
          {/* 启用开关 */}
          <div className="flex items-center justify-between p-6 border border-gray-200 rounded-lg bg-white">
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-1 tracking-tight">启用RAG</h3>
              <p className="text-sm text-text-tertiary">向量检索增强生成</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localConfig.rag?.enabled || false}
                onChange={(e) => {
                  handleUpdate(['rag'], {
                    ...localConfig.rag,
                    enabled: e.target.checked,
                    storagePath: localConfig.rag?.storagePath || './vector_store',
                  });
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-primary"></div>
            </label>
          </div>

          {localConfig.rag?.enabled && (
            <div className="space-y-8">
              {/* ========== 基础配置 ========== */}
              <div className="p-6 bg-cream-50 rounded-lg space-y-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">基础配置</h3>
                <div>
                  <label className="label">存储路径</label>
                  <input
                    type="text"
                    value={localConfig.rag?.storagePath || './vector_store'}
                    onChange={(e) => handleUpdate(['rag', 'storagePath'], e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              {/* ========== Vectorizer 配置 ========== */}
              <div className="p-6 bg-cream-50 rounded-lg space-y-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">Vectorizer 配置</h3>
                {!localConfig.rag?.vectorizer && (
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdate(['rag', 'vectorizer'], {
                        baseURL: '',
                        apiKey: '',
                        model: 'text-embedding-3-small',
                        dimensions: 1536,
                      });
                    }}
                    className="btn btn-secondary"
                  >
                    + 添加 Vectorizer 配置
                  </button>
                )}
                
                {localConfig.rag?.vectorizer && (
                  <>
                    <div>
                      <label className="label">Vectorizer Base URL</label>
                      <input
                        type="text"
                        value={localConfig.rag.vectorizer.baseURL || ''}
                        onChange={(e) => handleUpdate(['rag', 'vectorizer', 'baseURL'], e.target.value)}
                        className="input"
                        placeholder="https://api.siliconflow.cn/v1"
                      />
                    </div>
                    <div>
                      <label className="label flex items-center justify-between gap-2">
                        <span>Embedding API Key</span>
                        <span className="text-xs text-text-tertiary">用于向量写入，请填写真实嵌入服务密钥</span>
                      </label>
                      <input
                        type="password"
                        value={localConfig.rag.vectorizer.apiKey || ''}
                        onChange={(e) => handleUpdate(['rag', 'vectorizer', 'apiKey'], e.target.value)}
                        className="input"
                        placeholder="例如：sk-xxxx"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label className="label">模型名称</label>
                        <input
                          type="text"
                          value={localConfig.rag.vectorizer.model || ''}
                          onChange={(e) => handleUpdate(['rag', 'vectorizer', 'model'], e.target.value)}
                          className="input"
                          placeholder="text-embedding-3-small"
                        />
                      </div>
                      <div>
                        <label className="label">维度</label>
                        <input
                          type="number"
                          value={localConfig.rag.vectorizer.dimensions || ''}
                          onChange={(e) => handleUpdate(['rag', 'vectorizer', 'dimensions'], parseInt(e.target.value) || undefined)}
                          className="input"
                          placeholder="1536"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div>
                        <label className="label">Provider</label>
                        <input
                          type="text"
                          value={localConfig.rag.vectorizer.provider || ''}
                          onChange={(e) => handleUpdate(['rag', 'vectorizer', 'provider'], e.target.value)}
                          className="input"
                          placeholder="openai"
                        />
                      </div>
                      <div>
                        <label className="label">Batch Size</label>
                        <input
                          type="number"
                          value={localConfig.rag.vectorizer.batch || ''}
                          onChange={(e) => handleUpdate(['rag', 'vectorizer', 'batch'], parseInt(e.target.value) || undefined)}
                          className="input"
                          placeholder="32"
                        />
                      </div>
                      <div>
                        <label className="label">Timeout (ms)</label>
                        <input
                          type="number"
                          value={localConfig.rag.vectorizer.timeout || ''}
                          onChange={(e) => handleUpdate(['rag', 'vectorizer', 'timeout'], parseInt(e.target.value) || undefined)}
                          className="input"
                          placeholder="30000"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ========== 检索模式配置 ========== */}
              <div className="p-6 bg-cream-50 rounded-lg space-y-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">检索模式配置</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="label">默认模式</label>
                    <select
                      value={localConfig.rag?.defaultMode || 'basic'}
                      onChange={(e) => handleUpdate(['rag', 'defaultMode'], e.target.value)}
                      className="input"
                    >
                      <option value="basic">Basic (基础语义检索)</option>
                      <option value="time">Time (时间感知检索)</option>
                      <option value="group">Group (语义组检索)</option>
                      <option value="rerank">Rerank (重排序检索)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">默认召回数量 K</label>
                    <input
                      type="number"
                      value={localConfig.rag?.defaultK || 5}
                      onChange={(e) => handleUpdate(['rag', 'defaultK'], parseInt(e.target.value) || 5)}
                      className="input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="label">最大召回数量</label>
                    <input
                      type="number"
                      value={localConfig.rag?.maxK || 20}
                      onChange={(e) => handleUpdate(['rag', 'maxK'], parseInt(e.target.value) || 20)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">最大乘数限制</label>
                    <input
                      type="number"
                      step="0.1"
                      value={localConfig.rag?.maxMultiplier || 5.0}
                      onChange={(e) => handleUpdate(['rag', 'maxMultiplier'], parseFloat(e.target.value) || 5.0)}
                      className="input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="label">语义相似度权重 (0-1)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={localConfig.rag?.semanticWeight || 0.7}
                      onChange={(e) => handleUpdate(['rag', 'semanticWeight'], parseFloat(e.target.value) || 0.7)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">时间相关性权重 (0-1)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={localConfig.rag?.timeWeight || 0.3}
                      onChange={(e) => handleUpdate(['rag', 'timeWeight'], parseFloat(e.target.value) || 0.3)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">相似度阈值 (0-1)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={localConfig.rag?.similarityThreshold || 0.6}
                      onChange={(e) => handleUpdate(['rag', 'similarityThreshold'], parseFloat(e.target.value) || 0.6)}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              {/* ========== 语义组配置 ========== */}
              <div className="p-6 bg-cream-50 rounded-lg space-y-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">语义组配置</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="label">配置文件路径</label>
                    <input
                      type="text"
                      value={localConfig.rag?.semanticGroup?.configPath || './config/semantic_groups.json'}
                      onChange={(e) => {
                        handleUpdate(['rag', 'semanticGroup'], {
                          ...localConfig.rag?.semanticGroup,
                          configPath: e.target.value,
                          weight: localConfig.rag?.semanticGroup?.weight || 0.5,
                        });
                      }}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">语义组权重 (0-1)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={localConfig.rag?.semanticGroup?.weight || 0.5}
                      onChange={(e) => {
                        handleUpdate(['rag', 'semanticGroup'], {
                          ...localConfig.rag?.semanticGroup,
                          configPath: localConfig.rag?.semanticGroup?.configPath || './config/semantic_groups.json',
                          weight: parseFloat(e.target.value) || 0.5,
                        });
                      }}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              {/* ========== Rerank 配置 ========== */}
              <div className="p-6 bg-cream-50 rounded-lg space-y-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">Rerank 配置</h3>
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-white">
                  <div>
                    <h4 className="text-base font-semibold text-text-primary mb-1 tracking-tight">启用 Rerank</h4>
                    <p className="text-sm text-text-tertiary">外部重排序API提升检索精度</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localConfig.rag?.rerank?.enabled || false}
                      onChange={(e) => {
                        handleUpdate(['rag', 'rerank'], {
                          ...localConfig.rag?.rerank,
                          enabled: e.target.checked,
                          baseURL: localConfig.rag?.rerank?.baseURL || '',
                          apiKey: localConfig.rag?.rerank?.apiKey || '',
                          model: localConfig.rag?.rerank?.model || 'rerank-english-v2.0',
                          multiplier: localConfig.rag?.rerank?.multiplier || 2.0,
                          timeout: localConfig.rag?.rerank?.timeout || 5000,
                        });
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-primary"></div>
                  </label>
                </div>

                {localConfig.rag?.rerank?.enabled && (
                  <div className="space-y-6 pt-4">
                    <div>
                      <label className="label">Rerank Base URL</label>
                      <input
                        type="text"
                        value={localConfig.rag.rerank.baseURL || ''}
                        onChange={(e) => handleUpdate(['rag', 'rerank', 'baseURL'], e.target.value)}
                        className="input"
                        placeholder="https://api.siliconflow.cn/v1"
                      />
                    </div>
                    <div>
                      <label className="label">Rerank API Key</label>
                      <input
                        type="password"
                        value={localConfig.rag.rerank.apiKey || ''}
                        onChange={(e) => handleUpdate(['rag', 'rerank', 'apiKey'], e.target.value)}
                        className="input"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <label className="label">Rerank 模型</label>
                        <input
                          type="text"
                          value={localConfig.rag.rerank.model || 'rerank-english-v2.0'}
                          onChange={(e) => handleUpdate(['rag', 'rerank', 'model'], e.target.value)}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">超量获取倍数</label>
                        <input
                          type="number"
                          step="0.1"
                          value={localConfig.rag.rerank.multiplier || 2.0}
                          onChange={(e) => handleUpdate(['rag', 'rerank', 'multiplier'], parseFloat(e.target.value) || 2.0)}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">超时时间 (ms)</label>
                        <input
                          type="number"
                          value={localConfig.rag.rerank.timeout || 5000}
                          onChange={(e) => handleUpdate(['rag', 'rerank', 'timeout'], parseInt(e.target.value) || 5000)}
                          className="input"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ========== Tag 配置 ========== */}
              <div className="p-6 bg-cream-50 rounded-lg space-y-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">Tag 配置</h3>
                <div>
                  <label className="label">Tag 权重配置文件路径</label>
                  <input
                    type="text"
                    value={localConfig.rag?.tagsConfig || './config/rag_tags.json'}
                    onChange={(e) => handleUpdate(['rag', 'tagsConfig'], e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              {/* ========== 日记归档配置 ========== */}
              <div className="p-6 bg-cream-50 rounded-lg space-y-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">日记归档配置</h3>
                <div>
                  <label className="label">归档时间 (天)</label>
                  <input
                    type="number"
                    value={localConfig.rag?.diaryArchiveAfterDays || 0}
                    onChange={(e) => handleUpdate(['rag', 'diaryArchiveAfterDays'], parseInt(e.target.value) || 0)}
                    className="input"
                    placeholder="0 表示不归档"
                  />
                  <p className="text-sm text-text-tertiary mt-2">设置为 0 表示不自动归档日记</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 插件系统已移除，相关配置不再展示 */}

      {/* 安全配置 - 限流 */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-8 tracking-tight">安全配置 - API 限流</h2>
        <div className="space-y-6">
          <div className="p-4 bg-cream-50 rounded-lg border border-gray-200 mb-6">
            <p className="text-sm text-text-secondary">
              API 限流功能可以防止 API 滥用和 DoS 攻击。支持按 API Key、IP 地址或用户 ID 进行限流。
            </p>
          </div>

          {/* 启用限流 */}
          <div className="flex items-center justify-between p-6 border border-gray-200 rounded-lg bg-white">
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-1 tracking-tight">启用限流</h3>
              <p className="text-sm text-text-tertiary">启用 API 限流保护</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localConfig.security?.rateLimit?.enabled !== false}
                onChange={(e) => {
                  const rateLimit = localConfig.security?.rateLimit || {
                    enabled: true,
                    provider: 'auto',
                    trustProxy: true,
                    keyPrefix: 'rate_limit',
                    rules: []
                  };
                  handleUpdate(['security', 'rateLimit'], {
                    ...rateLimit,
                    enabled: e.target.checked
                  });
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-primary"></div>
            </label>
          </div>

          {localConfig.security?.rateLimit?.enabled !== false && (
            <div className="space-y-6 pt-4 border-t border-gray-200">
              {/* 提供者选择 */}
              <div>
                <label className="label">限流提供者</label>
                <select
                  value={localConfig.security?.rateLimit?.provider || 'auto'}
                  onChange={(e) => {
                    const rateLimit = localConfig.security?.rateLimit || {};
                    handleUpdate(['security', 'rateLimit'], {
                      ...rateLimit,
                      provider: e.target.value as 'auto' | 'redis' | 'memory'
                    });
                  }}
                  className="input"
                >
                  <option value="auto">自动选择（优先 Redis，否则内存）</option>
                  <option value="redis">Redis（分布式部署）</option>
                  <option value="memory">内存（单实例部署）</option>
                </select>
                <p className="text-sm text-text-tertiary mt-2">
                  选择限流存储方式。Redis 适用于多实例部署，内存适用于单实例。
                </p>
              </div>

              {/* 信任代理 */}
              <div className="flex items-center justify-between p-6 border border-gray-200 rounded-lg bg-white">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1 tracking-tight">信任代理</h3>
                  <p className="text-sm text-text-tertiary">信任反向代理的 X-Forwarded-For 头</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localConfig.security?.rateLimit?.trustProxy !== false}
                    onChange={(e) => {
                      const rateLimit = localConfig.security?.rateLimit || {};
                      handleUpdate(['security', 'rateLimit'], {
                        ...rateLimit,
                        trustProxy: e.target.checked
                      });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-primary"></div>
                </label>
              </div>

              {/* Key 前缀 */}
              <div>
                <label className="label">Key 前缀</label>
                <input
                  type="text"
                  value={localConfig.security?.rateLimit?.keyPrefix || 'rate_limit'}
                  onChange={(e) => {
                    const rateLimit = localConfig.security?.rateLimit || {};
                    handleUpdate(['security', 'rateLimit'], {
                      ...rateLimit,
                      keyPrefix: e.target.value
                    });
                  }}
                  className="input"
                  placeholder="rate_limit"
                />
                <p className="text-sm text-text-tertiary mt-2">
                  Redis 键的前缀，用于区分不同的限流实例
                </p>
              </div>

              {/* 默认策略顺序 */}
              <div>
                <label className="label">默认策略顺序</label>
                <input
                  type="text"
                  value={Array.isArray(localConfig.security?.rateLimit?.defaultStrategyOrder)
                    ? localConfig.security.rateLimit.defaultStrategyOrder.join(', ')
                    : 'apiKey, ip'}
                  onChange={(e) => {
                    const rateLimit = localConfig.security?.rateLimit || {};
                    const strategies = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                    handleUpdate(['security', 'rateLimit'], {
                      ...rateLimit,
                      defaultStrategyOrder: strategies
                    });
                  }}
                  className="input"
                  placeholder="apiKey, ip"
                />
                <p className="text-sm text-text-tertiary mt-2">
                  默认的识别策略顺序，用逗号分隔（如：apiKey, ip, user）
                </p>
              </div>

              {/* 白名单 */}
              <div className="p-6 bg-cream-50 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">白名单</h3>
                <div className="space-y-4">
                  <div>
                    <label className="label">IP 白名单</label>
                    <textarea
                      value={Array.isArray(localConfig.security?.rateLimit?.whitelist?.ips)
                        ? localConfig.security.rateLimit.whitelist.ips.join('\n')
                        : ''}
                      onChange={(e) => {
                        const rateLimit = localConfig.security?.rateLimit || {};
                        const whitelist = rateLimit.whitelist || {};
                        const ips = e.target.value.split('\n').map(s => s.trim()).filter(s => s);
                        handleUpdate(['security', 'rateLimit'], {
                          ...rateLimit,
                          whitelist: {
                            ...whitelist,
                            ips
                          }
                        });
                      }}
                      className="input"
                      rows={3}
                      placeholder="127.0.0.1&#10;192.168.1.1"
                    />
                    <p className="text-sm text-text-tertiary mt-2">每行一个 IP 地址</p>
                  </div>
                  <div>
                    <label className="label">API Key 白名单</label>
                    <textarea
                      value={Array.isArray(localConfig.security?.rateLimit?.whitelist?.apiKeys)
                        ? localConfig.security.rateLimit.whitelist.apiKeys.join('\n')
                        : ''}
                      onChange={(e) => {
                        const rateLimit = localConfig.security?.rateLimit || {};
                        const whitelist = rateLimit.whitelist || {};
                        const apiKeys = e.target.value.split('\n').map(s => s.trim()).filter(s => s);
                        handleUpdate(['security', 'rateLimit'], {
                          ...rateLimit,
                          whitelist: {
                            ...whitelist,
                            apiKeys
                          }
                        });
                      }}
                      className="input"
                      rows={3}
                      placeholder="sk-intellicore-api-xxx"
                    />
                    <p className="text-sm text-text-tertiary mt-2">每行一个 API Key</p>
                  </div>
                </div>
              </div>

              {/* 限流规则 */}
              <div className="p-6 bg-cream-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-text-primary tracking-tight">限流规则</h3>
                  <p className="text-sm text-text-tertiary">
                    {Array.isArray(localConfig.security?.rateLimit?.rules)
                      ? `${localConfig.security.rateLimit.rules.length} 个规则`
                      : '0 个规则'}
                  </p>
                </div>
                <p className="text-sm text-text-secondary mb-4">
                  限流规则定义了不同端点的限流策略。规则按优先级匹配，优先级数字越小越优先。
                </p>
                {Array.isArray(localConfig.security?.rateLimit?.rules) && localConfig.security.rateLimit.rules.length > 0 ? (
                  <div className="space-y-4">
                    {localConfig.security.rateLimit.rules.map((rule: any, index: number) => (
                      <div key={rule.id || index} className="p-4 bg-white rounded-lg border border-gray-200">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-text-primary">{rule.name || rule.id}</h4>
                            {rule.description && (
                              <p className="text-sm text-text-tertiary mt-1">{rule.description}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const rateLimit = localConfig.security?.rateLimit || {};
                              const rules = Array.isArray(rateLimit.rules) ? [...rateLimit.rules] : [];
                              rules.splice(index, 1);
                              handleUpdate(['security', 'rateLimit'], {
                                ...rateLimit,
                                rules
                              });
                            }}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            删除
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-text-tertiary">窗口时间:</span>
                            <span className="ml-2 font-medium">{rule.windowMs ? `${rule.windowMs / 1000}秒` : '-'}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary">最大请求:</span>
                            <span className="ml-2 font-medium">{rule.maxRequests || '-'}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary">模式:</span>
                            <span className="ml-2 font-medium">{rule.mode || 'sliding'}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary">优先级:</span>
                            <span className="ml-2 font-medium">{rule.priority || '-'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-tertiary">暂无限流规则。限流规则需要在配置文件中手动添加。</p>
                )}
                <p className="text-sm text-text-tertiary mt-4">
                  💡 提示：限流规则的详细配置（如匹配器、策略顺序等）需要在配置文件中手动编辑。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
