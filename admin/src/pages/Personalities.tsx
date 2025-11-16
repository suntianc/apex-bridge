import { useEffect, useState } from 'react';
import { personalityApi, PersonalityInfo, PersonalityConfig } from '@/api/personalityApi';

export function Personalities() {
  const [personalities, setPersonalities] = useState<PersonalityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPersonality, setEditingPersonality] = useState<PersonalityInfo | null>(null);
  const [formData, setFormData] = useState<PersonalityConfig & { id?: string }>({
    identity: {
      name: '',
      avatar: '',
      role: '',
    },
    traits: {
      core: [],
      interests: [],
      values: [],
    },
    style: {
      tone: '',
      address: '',
      emojiUsage: 'moderate',
    },
  });

  useEffect(() => {
    loadPersonalities();
  }, []);

  const loadPersonalities = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await personalityApi.getPersonalities();
      setPersonalities(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || '加载失败');
      console.error('Failed to load personalities:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({
      id: '',
      identity: {
        name: '',
        avatar: '',
        role: '',
      },
      traits: {
        core: [],
        interests: [],
        values: [],
      },
      style: {
        tone: '',
        address: '',
        emojiUsage: 'moderate',
      },
    });
    setEditingPersonality(null);
    setShowModal(true);
  };

  const handleEdit = async (personality: PersonalityInfo) => {
    try {
      setLoading(true);
      const config = await personalityApi.getPersonality(personality.id);
      setFormData({ ...config, id: personality.id });
      setEditingPersonality(personality);
      setShowModal(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || '加载配置失败');
      console.error('Failed to load personality:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (id === 'default') {
      alert('不能删除默认人格');
      return;
    }
    if (confirm('确定要删除这个人格吗？此操作不可恢复。')) {
      try {
        await personalityApi.deletePersonality(id);
        await loadPersonalities();
      } catch (err: any) {
        setError(err.response?.data?.error?.message || err.message || '删除失败');
        console.error('Failed to delete personality:', err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      
      const { id, ...config } = formData;
      
      if (editingPersonality) {
        await personalityApi.updatePersonality(editingPersonality.id, config);
      } else {
        if (!id || !id.trim()) {
          setError('人格ID不能为空');
          return;
        }
        await personalityApi.createPersonality(id.trim(), config);
      }
      
      setShowModal(false);
      await loadPersonalities();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || '保存失败');
      console.error('Failed to save personality:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (path: string[], value: any) => {
    setFormData((prev) => {
      const newData = { ...prev };
      let current: any = newData;
      for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]]) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newData;
    });
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold mb-4 tracking-tight">人格管理</h1>
          <p className="text-text-secondary text-base md:text-lg">管理和配置AI人格</p>
        </div>
        <button onClick={handleAdd} className="btn btn-primary w-full md:w-auto">
          + 创建新人格
        </button>
      </div>

      {error && !showModal && (
        <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          错误: {error}
        </div>
      )}

      {loading && personalities.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-text-primary mb-4"></div>
          <p className="text-text-tertiary">加载中...</p>
        </div>
      ) : error && personalities.length === 0 ? (
        <div className="card">
          <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            <p className="font-medium mb-2">加载失败</p>
            <p className="text-sm mb-4">{error}</p>
            <button onClick={loadPersonalities} className="btn btn-secondary">
              重试
            </button>
          </div>
        </div>
      ) : personalities.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-text-secondary mb-6 text-lg">暂无已配置的人格</p>
          <button onClick={handleAdd} className="btn btn-primary">
            创建第一个人格
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="min-w-full">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">人格</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary hidden md:table-cell">描述</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary hidden lg:table-cell">角色</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">状态</th>
                  <th className="text-right py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {personalities.map((personality) => (
                  <tr key={personality.id} className="border-b border-gray-100 hover:bg-cream-50 transition-colors">
                    <td className="py-4 px-4 md:px-6">
                      <div className="flex items-center gap-3">
                        {personality.avatar && (
                          <span className="text-2xl">{personality.avatar}</span>
                        )}
                        <div>
                          <div className="font-semibold text-text-primary">{personality.name}</div>
                          <div className="text-xs text-text-tertiary mt-1 hidden md:block">ID: {personality.id}</div>
                          <div className="text-xs text-text-tertiary mt-1 md:hidden">ID: {personality.id.substring(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 md:px-6 hidden md:table-cell">
                      <span className="text-sm text-text-secondary">
                        {personality.description || '-'}
                      </span>
                    </td>
                    <td className="py-4 px-4 md:px-6 hidden lg:table-cell">
                      <span className="text-sm text-text-secondary">
                        {personality.role || '-'}
                      </span>
                    </td>
                    <td className="py-4 px-4 md:px-6">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        personality.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {personality.status === 'active' ? '活跃' : '非活跃'}
                      </span>
                    </td>
                    <td className="py-4 px-4 md:px-6">
                      <div className="flex items-center justify-end gap-2 md:gap-4">
                        <button
                          onClick={() => handleEdit(personality)}
                          className="btn btn-ghost text-xs md:text-sm px-2 md:px-4"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(personality.id)}
                          disabled={personality.id === 'default'}
                          className={`text-xs md:text-sm font-medium px-2 ${
                            personality.id === 'default'
                              ? 'text-gray-400 cursor-not-allowed'
                              : 'text-accent-500 hover:text-accent-600'
                          }`}
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

      {/* 编辑/创建模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-semibold">
                {editingPersonality ? '编辑人格' : '创建新人格'}
              </h2>
            </div>
            {error && (
              <div className="p-4 mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* 基本信息 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">基本信息</h3>
                
                {!editingPersonality && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      人格ID * <span className="text-xs text-gray-500">(仅支持字母、数字、中文、连字符)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.id || ''}
                      onChange={(e) => updateField(['id'], e.target.value)}
                      className="input"
                      required
                      pattern="^[\w\u4e00-\u9fa5-]+$"
                      placeholder="例如: 专业助手"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    名称 *
                  </label>
                  <input
                    type="text"
                    value={formData.identity.name}
                    onChange={(e) => updateField(['identity', 'name'], e.target.value)}
                    className="input"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      头像 (Emoji)
                    </label>
                    <input
                      type="text"
                      value={formData.identity.avatar || ''}
                      onChange={(e) => updateField(['identity', 'avatar'], e.target.value)}
                      className="input"
                      placeholder="例如: 🤖"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      角色定位
                    </label>
                    <input
                      type="text"
                      value={formData.identity.role || ''}
                      onChange={(e) => updateField(['identity', 'role'], e.target.value)}
                      className="input"
                      placeholder="例如: 文件管理助手"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    背景故事
                  </label>
                  <textarea
                    value={formData.identity.background || ''}
                    onChange={(e) => updateField(['identity', 'background'], e.target.value)}
                    className="input min-h-[80px]"
                    placeholder="描述这个人格的背景故事..."
                  />
                </div>
              </div>

              {/* 性格特质 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">性格特质</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    核心特质 * <span className="text-xs text-gray-500">(每行一个)</span>
                  </label>
                  <textarea
                    value={(formData.traits.core || []).join('\n')}
                    onChange={(e) => updateField(['traits', 'core'], e.target.value.split('\n').filter(t => t.trim()))}
                    className="input min-h-[100px]"
                    required
                    placeholder="细心&#10;有条理&#10;专业"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    兴趣爱好 <span className="text-xs text-gray-500">(每行一个，可选)</span>
                  </label>
                  <textarea
                    value={(formData.traits.interests || []).join('\n')}
                    onChange={(e) => updateField(['traits', 'interests'], e.target.value.split('\n').filter(t => t.trim()))}
                    className="input min-h-[80px]"
                    placeholder="编程&#10;阅读"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    价值观 <span className="text-xs text-gray-500">(每行一个，可选)</span>
                  </label>
                  <textarea
                    value={(formData.traits.values || []).join('\n')}
                    onChange={(e) => updateField(['traits', 'values'], e.target.value.split('\n').filter(t => t.trim()))}
                    className="input min-h-[80px]"
                    placeholder="帮助用户&#10;追求效率"
                  />
                </div>
              </div>

              {/* 交互风格 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">交互风格</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      说话方式 *
                    </label>
                    <input
                      type="text"
                      value={formData.style.tone}
                      onChange={(e) => updateField(['style', 'tone'], e.target.value)}
                      className="input"
                      required
                      placeholder="例如: 专业、礼貌、亲昵"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      称呼方式 *
                    </label>
                    <input
                      type="text"
                      value={formData.style.address}
                      onChange={(e) => updateField(['style', 'address'], e.target.value)}
                      className="input"
                      required
                      placeholder="例如: Boss、您、爸爸"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    表情使用频率 *
                  </label>
                  <select
                    value={formData.style.emojiUsage}
                    onChange={(e) => updateField(['style', 'emojiUsage'], e.target.value)}
                    className="input"
                    required
                  >
                    <option value="frequent">频繁</option>
                    <option value="moderate">适中</option>
                    <option value="rare">很少</option>
                  </select>
                </div>
              </div>

              {/* 行为模式（可选） */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">行为模式（可选）</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    成功时的反应
                  </label>
                  <input
                    type="text"
                    value={formData.behavior?.onSuccess || ''}
                    onChange={(e) => updateField(['behavior', 'onSuccess'], e.target.value)}
                    className="input"
                    placeholder="例如: 确认完成"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    失败时的反应
                  </label>
                  <input
                    type="text"
                    value={formData.behavior?.onFailure || ''}
                    onChange={(e) => updateField(['behavior', 'onFailure'], e.target.value)}
                    className="input"
                    placeholder="例如: 说明问题并提供解决方案"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    闲暇时的话题
                  </label>
                  <input
                    type="text"
                    value={formData.behavior?.onIdle || ''}
                    onChange={(e) => updateField(['behavior', 'onIdle'], e.target.value)}
                    className="input"
                    placeholder="例如: 询问是否需要帮助"
                  />
                </div>
              </div>

              {/* 元数据（可选） */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">元数据（可选）</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    描述
                  </label>
                  <textarea
                    value={formData.metadata?.description || ''}
                    onChange={(e) => updateField(['metadata', 'description'], e.target.value)}
                    className="input min-h-[60px]"
                    placeholder="人格配置的简要描述..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      版本
                    </label>
                    <input
                      type="text"
                      value={formData.metadata?.version || ''}
                      onChange={(e) => updateField(['metadata', 'version'], e.target.value)}
                      className="input"
                      placeholder="例如: 1.0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      作者
                    </label>
                    <input
                      type="text"
                      value={formData.metadata?.author || ''}
                      onChange={(e) => updateField(['metadata', 'author'], e.target.value)}
                      className="input"
                      placeholder="例如: 开发者名称"
                    />
                  </div>
                </div>
              </div>

              {/* 自定义提示词（高级） */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">自定义提示词（高级，可选）</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    自定义System Prompt补充
                  </label>
                  <textarea
                    value={formData.customPrompt || ''}
                    onChange={(e) => updateField(['customPrompt'], e.target.value)}
                    className="input min-h-[100px] font-mono text-sm"
                    placeholder="可以添加额外的System Prompt内容，用于覆盖或补充默认生成的提示词..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? '保存中...' : editingPersonality ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

