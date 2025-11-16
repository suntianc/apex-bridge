import { useEffect, useMemo, useState } from 'react';
import { useNodeStore } from '@/store/nodeStore';
import { NodeInfo } from '@/api/nodeApi';
import { personalityApi, PersonalityInfo } from '@/api/personalityApi';

type NodeFormType = 'worker' | 'companion' | 'custom' | 'hub';

interface NodeFormData {
  name: string;
  type: NodeFormType;
  config: {
    endpoint?: string;
    capabilities?: string[];
  };
  boundPersona?: string | null;
  boundPersonas?: string[];
}

export function Nodes() {
  const { nodes, loading, error, loadNodes, registerNode, updateNode, deleteNode } = useNodeStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNode, setEditingNode] = useState<NodeInfo | null>(null);
  const [detailNode, setDetailNode] = useState<NodeInfo | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [personas, setPersonas] = useState<PersonalityInfo[]>([]);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [personasLoading, setPersonasLoading] = useState(false);
  const emptyForm: NodeFormData = useMemo(
    () => ({
    name: '',
    type: 'custom',
    config: {
      endpoint: '',
      capabilities: [],
    },
      boundPersona: '',
      boundPersonas: []
    }),
    []
  );
  const [formData, setFormData] = useState<NodeFormData>(emptyForm);
  // 实时日志（AdminPanel WS）
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsKey, setWsKey] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const wsRef = useState<WebSocket | null>(null)[0] as any;

  useEffect(() => {
    loadNodes();
    // 定期刷新节点状态
    const interval = setInterval(() => {
      loadNodes();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadPersonas = async () => {
      try {
        setPersonasLoading(true);
        const list = await personalityApi.getPersonalities();
        setPersonas(list);
        setPersonaError(null);
      } catch (err: any) {
        console.error('Failed to load personalities:', err);
        setPersonaError('加载人格模板失败');
      } finally {
        setPersonasLoading(false);
      }
    };
    loadPersonas();
  }, []);

  const ensureFormPersonaShape = (type: NodeFormType, data: NodeFormData): NodeFormData => {
    if (type === 'hub') {
      return {
        ...data,
        boundPersona: undefined,
        boundPersonas: data.boundPersonas ?? []
      };
    }
    return {
      ...data,
      boundPersona: data.boundPersona ?? '',
      boundPersonas: undefined
    };
  };

  const handleAdd = () => {
    setFormData(emptyForm);
    setEditingNode(null);
    setShowAddModal(true);
  };

  const handleViewDetail = (node: NodeInfo) => {
    setDetailNode(node);
    setShowDetailModal(true);
    setLiveLogs([]);
  };

  const handleEdit = (node: NodeInfo) => {
    const nodeType: NodeFormType = node.type || 'custom';
    const initialForm: NodeFormData = {
      name: node.name,
      type: nodeType,
      config: {
        endpoint: node.config?.endpoint || '',
        capabilities: node.config?.capabilities || [],
      },
      boundPersona: node.boundPersona ?? '',
      boundPersonas: node.boundPersonas ?? []
    };
    setFormData(ensureFormPersonaShape(nodeType, initialForm));
    setEditingNode(node);
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个节点吗？')) {
      try {
        await deleteNode(id);
      } catch (err) {
        console.error('Failed to delete node:', err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Partial<NodeInfo> = {
        name: formData.name.trim(),
        type: formData.type,
        config: {
          endpoint: formData.config.endpoint?.trim() || undefined,
          capabilities: formData.config.capabilities?.filter((c) => c.trim())
        },
        boundPersona: undefined,
        boundPersonas: undefined
      };

      if (formData.type === 'hub') {
        payload.boundPersonas = formData.boundPersonas?.filter((id) => id.trim()) ?? [];
      } else {
        const persona = formData.boundPersona?.trim();
        payload.boundPersona = persona ? persona : undefined;
      }

      if (editingNode) {
        await updateNode(editingNode.id, payload);
      } else {
        await registerNode(payload as Omit<NodeInfo, 'id' | 'registeredAt' | 'status'>);
      }
      setShowAddModal(false);
      setFormData(emptyForm);
    } catch (err) {
      console.error('Failed to save node:', err);
    }
  };

  const handleTypeChange = (nextType: NodeFormType) => {
    setFormData((prev) => ensureFormPersonaShape(nextType, { ...prev, type: nextType }));
  };

  const togglePersonaForHub = (personaId: string) => {
    setFormData((prev) => {
      const current = prev.boundPersonas ?? [];
      const exists = current.includes(personaId);
      const next = exists ? current.filter((id) => id !== personaId) : [...current, personaId];
      return {
        ...prev,
        boundPersonas: next
      };
    });
  };

  const handleSinglePersonaChange = (personaId: string) => {
    setFormData((prev) => ({
      ...prev,
      boundPersona: personaId || ''
    }));
  };

  const renderPersonaSelector = () => {
    if (formData.type === 'hub') {
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            绑定人格（Hub 节点可多选）
          </label>
          {personasLoading ? (
            <p className="text-sm text-text-tertiary">人格列表加载中...</p>
          ) : personaError ? (
            <p className="text-sm text-red-500">{personaError}</p>
          ) : personas.length === 0 ? (
            <p className="text-sm text-text-tertiary">暂无可用的人格模板</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3 bg-cream-50">
              {personas.map((persona) => (
                <label key={persona.id} className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={formData.boundPersonas?.includes(persona.id) ?? false}
                    onChange={() => togglePersonaForHub(persona.id)}
                  />
                  <span>{persona.name}</span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-text-tertiary">
            未选择时视为不绑定任何人格，Hub 会使用默认人格。
          </p>
        </div>
      );
    }

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          绑定人格（可选）
        </label>
        <select
          value={formData.boundPersona ?? ''}
          onChange={(e) => handleSinglePersonaChange(e.target.value)}
          className="input"
        >
          <option value="">不绑定</option>
          {personas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-text-tertiary">
          若不绑定人格，节点将使用其默认内置人格行为。
        </p>
      </div>
    );
  };

  const renderPersonaSummary = (node: NodeInfo) => {
    if (node.type === 'hub') {
      if (node.boundPersonas && node.boundPersonas.length > 0) {
        return (
          <div className="text-xs text-text-tertiary mt-1">
            人格: {node.boundPersonas.join(', ')}
          </div>
        );
      }
      return <div className="text-xs text-text-tertiary mt-1">人格: 默认</div>;
    }
    if (node.boundPersona) {
      return (
        <div className="text-xs text-text-tertiary mt-1">
          人格: {node.boundPersona}
        </div>
      );
    }
    return null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800';
      case 'busy':
        return 'bg-blue-100 text-blue-800';
      case 'offline':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online':
        return '在线';
      case 'busy':
        return '繁忙';
      case 'offline':
        return '离线';
      default:
        return '未知';
    }
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold mb-4 tracking-tight">节点管理</h1>
          <p className="text-text-secondary text-base md:text-lg">管理和监控分布式节点</p>
        </div>
        <button onClick={handleAdd} className="btn btn-primary w-full md:w-auto">
          + 注册新节点
        </button>
      </div>

      {error && (
        <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          错误: {error}
        </div>
      )}

      {loading && nodes.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-text-primary mb-4"></div>
          <p className="text-text-tertiary">加载中...</p>
        </div>
      ) : error ? (
        <div className="card">
          <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            <p className="font-medium mb-2">加载失败</p>
            <p className="text-sm mb-4">{error}</p>
            <button onClick={loadNodes} className="btn btn-secondary">
              重试
            </button>
          </div>
        </div>
      ) : nodes.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-text-secondary mb-6 text-lg">暂无已注册的节点</p>
          <button onClick={handleAdd} className="btn btn-primary">
            注册第一个节点
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="min-w-full">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">名称</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary hidden md:table-cell">类型</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">状态</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary hidden lg:table-cell">注册时间</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary hidden lg:table-cell">最后活跃</th>
                  <th className="text-right py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => (
                  <tr key={node.id} className="border-b border-gray-100 hover:bg-cream-50 transition-colors">
                    <td className="py-4 px-4 md:px-6">
                      <div className="font-semibold text-text-primary">{node.name}</div>
                      <div className="text-xs text-text-tertiary mt-1 hidden md:block">{node.id}</div>
                      <div className="text-xs text-text-tertiary mt-1 md:hidden">
                        类型: {node.type || 'custom'} | ID: {node.id.substring(0, 8)}...
                      </div>
                      {renderPersonaSummary(node)}
                    </td>
                    <td className="py-4 px-4 md:px-6 hidden md:table-cell">
                      <span className="text-sm text-text-secondary capitalize">
                        {node.type || 'custom'}
                      </span>
                    </td>
                    <td className="py-4 px-4 md:px-6">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          node.status
                        )}`}
                      >
                        {getStatusText(node.status)}
                      </span>
                    </td>
                    <td className="py-4 px-4 md:px-6 text-sm text-text-tertiary hidden lg:table-cell">
                      {node.registeredAt
                        ? new Date(node.registeredAt).toLocaleString('zh-CN')
                        : '-'}
                    </td>
                    <td className="py-4 px-4 md:px-6 text-sm text-text-tertiary hidden lg:table-cell">
                      {node.lastSeen
                        ? new Date(node.lastSeen).toLocaleString('zh-CN')
                        : '-'}
                    </td>
                    <td className="py-4 px-4 md:px-6">
                      <div className="flex items-center justify-end gap-2 md:gap-4">
                        <button
                          onClick={() => handleViewDetail(node)}
                          className="btn btn-ghost text-xs md:text-sm px-2 md:px-4"
                          title="查看详情"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => handleEdit(node)}
                          className="btn btn-ghost text-xs md:text-sm px-2 md:px-4"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(node.id)}
                          className="text-xs md:text-sm text-accent-500 hover:text-accent-600 font-medium px-2"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 添加/编辑模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">
                {editingNode ? '编辑节点' : '注册新节点'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  节点名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  节点类型
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => handleTypeChange(e.target.value as NodeFormType)}
                  className="input"
                >
                  <option value="worker">Worker (专业节点)</option>
                  <option value="companion">Companion (全功能节点)</option>
                  <option value="hub">Hub (中枢节点)</option>
                  <option value="custom">Custom (自定义)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  端点地址
                </label>
                <input
                  type="text"
                  value={formData.config.endpoint}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      config: { ...formData.config, endpoint: e.target.value },
                    })
                  }
                  className="input"
                  placeholder="ws://localhost:8080"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  能力列表 (每行一个)
                </label>
                <textarea
                  value={(formData.config.capabilities || []).join('\n')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      config: {
                        ...formData.config,
                        capabilities: e.target.value.split('\n').filter((c) => c.trim()),
                      },
                    })
                  }
                  className="input min-h-[100px]"
                  placeholder="tool1&#10;tool2"
                />
              </div>

              {renderPersonaSelector()}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingNode ? '保存' : '注册'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 节点详情模态框 */}
      {showDetailModal && detailNode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold">节点详情</h2>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setDetailNode(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-lg font-semibold mb-4 text-text-primary">基本信息</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">节点名称</label>
                    <p className="text-text-primary">{detailNode.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">节点ID</label>
                    <p className="text-text-primary font-mono text-sm">{detailNode.id}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">节点类型</label>
                    <p className="text-text-primary capitalize">{detailNode.type || 'custom'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">状态</label>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        detailNode.status
                      )}`}
                    >
                      {getStatusText(detailNode.status)}
                    </span>
                  </div>
                  {detailNode.registeredAt && (
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">注册时间</label>
                      <p className="text-text-primary">
                        {new Date(detailNode.registeredAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  )}
                  {detailNode.lastSeen && (
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">最后活跃</label>
                      <p className="text-text-primary">
                        {new Date(detailNode.lastSeen).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 配置信息 */}
              {detailNode.config && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-text-primary">配置信息</h3>
                  <div className="space-y-4">
                    {detailNode.config.endpoint && (
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">端点</label>
                        <p className="text-text-primary font-mono text-sm break-all">
                          {detailNode.config.endpoint}
                        </p>
                      </div>
                    )}
                    {detailNode.config.capabilities && detailNode.config.capabilities.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">能力</label>
                        <div className="flex flex-wrap gap-2">
                          {detailNode.config.capabilities.map((cap, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 人格绑定 */}
              {(detailNode.boundPersona || (detailNode.boundPersonas && detailNode.boundPersonas.length > 0)) && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-text-primary">人格绑定</h3>
                  <div>
                    {detailNode.type === 'hub' && detailNode.boundPersonas ? (
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                          绑定的人格列表
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {detailNode.boundPersonas.map((persona, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium"
                            >
                              {persona}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : detailNode.boundPersona ? (
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">绑定的人格</label>
                        <p className="text-text-primary">{detailNode.boundPersona}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleEdit(detailNode);
                  }}
                  className="btn btn-primary"
                >
                  编辑节点
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setDetailNode(null);
                  }}
                  className="btn btn-secondary"
                >
                  关闭
                </button>
              </div>

              {/* 实时事件（AdminPanel WS） */}
              <div className="pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold mb-4 text-text-primary">实时事件（AdminPanel 通道）</h3>
                <div className="p-4 bg-cream-50 rounded-lg border border-gray-200 mb-4">
                  <p className="text-sm text-text-secondary">
                    使用 AdminPanel WebSocket 通道接收节点事件推送。需提供连接 Key（通常为节点认证 Key）。仅用于观测，读写无副作用。
                  </p>
                </div>
                <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-3">
                  <div className="flex-1">
                    <label className="label">连接 Key</label>
                    <input
                      type="text"
                      value={wsKey}
                      onChange={(e) => setWsKey(e.target.value)}
                      className="input w-full"
                      placeholder="粘贴节点认证 Key（Settings 页面可复制）"
                    />
                  </div>
                  <div className="flex gap-2">
                    {!wsConnected ? (
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            if (!wsKey.trim()) {
                              alert('请先填写连接 Key');
                              return;
                            }
                            const loc = window.location;
                            const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
                            const host = loc.host;
                            const path = `/abp-admin-panel/ABP_Key=${encodeURIComponent(wsKey.trim())}`;
                            const url = `${protocol}//${host}${path}`;
                            const ws = new WebSocket(url);
                            ws.onopen = () => {
                              setWsConnected(true);
                              setLiveLogs((logs) => [`[connected] ${new Date().toLocaleString('zh-CN')} ${url}`, ...logs]);
                            };
                            ws.onclose = () => {
                              setWsConnected(false);
                              setLiveLogs((logs) => [`[disconnected] ${new Date().toLocaleString('zh-CN')}`, ...logs]);
                            };
                            ws.onerror = () => {
                              setLiveLogs((logs) => [`[error] ${new Date().toLocaleString('zh-CN')}`, ...logs]);
                            };
                            ws.onmessage = (evt) => {
                              try {
                                const text = typeof evt.data === 'string' ? evt.data : '';
                                const json = text ? JSON.parse(text) : null;
                                const line = json ? JSON.stringify(json) : text;
                                // 过滤显示：若包含当前节点ID优先显示，否则也记录（便于全局观察）
                                if (!detailNode?.id || (line && line.includes(detailNode.id))) {
                                  setLiveLogs((logs) => {
                                    const next = [line, ...logs].slice(0, 500);
                                    return next;
                                  });
                                }
                              } catch {
                                setLiveLogs((logs) => [String(evt.data), ...logs]);
                              }
                            };
                            (wsRef as any).current = ws;
                          } catch (err) {
                            console.error('WS connect failed:', err);
                            alert('连接失败，请检查服务器与 Key');
                          }
                        }}
                        className="btn btn-primary"
                      >
                        连接
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const ws: WebSocket | null = (wsRef as any).current || null;
                            ws?.close();
                            (wsRef as any).current = null;
                          } catch {}
                        }}
                        className="btn btn-secondary"
                      >
                        断开
                      </button>
                    )}
                    <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                      />
                      自动滚动
                    </label>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg bg-white h-56 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
                  {liveLogs.length === 0 ? (
                    <span className="text-text-tertiary">暂无事件</span>
                  ) : (
                    liveLogs.map((line, idx) => <div key={idx}>{line}</div>)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
