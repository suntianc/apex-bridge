import { useEffect, useState } from 'react';
import { relationshipApi, StoredRelationship, Relationship, RelationshipType } from '@/api/relationshipApi';

export function Relationships() {
  const [relationships, setRelationships] = useState<StoredRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<StoredRelationship | null>(null);
  const [userId] = useState('default'); // 默认用户ID，后续可以支持多用户
  const [formData, setFormData] = useState<Relationship>({
    type: 'friend',
    name: '',
    birthday: '',
    anniversary: '',
    contact: {
      phone: '',
      email: '',
      address: '',
    },
    notes: '',
  });

  const relationshipTypeLabels: Record<RelationshipType, string> = {
    family: '家庭成员',
    friend: '朋友',
    colleague: '同事',
    other: '其他',
  };

  useEffect(() => {
    loadRelationships();
  }, []);

  const loadRelationships = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await relationshipApi.getRelationships(userId);
      setRelationships(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || '加载失败');
      console.error('Failed to load relationships:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({
      type: 'friend',
      name: '',
      birthday: '',
      anniversary: '',
      contact: {
        phone: '',
        email: '',
        address: '',
      },
      notes: '',
    });
    setEditingRelationship(null);
    setShowModal(true);
  };

  const handleEdit = async (relationship: StoredRelationship) => {
    try {
      setLoading(true);
      const data = await relationshipApi.getRelationship(relationship.id, userId);
      setFormData({
        type: data.type,
        name: data.name,
        birthday: data.birthday || '',
        anniversary: data.anniversary || '',
        contact: data.contact || {
          phone: '',
          email: '',
          address: '',
        },
        notes: data.notes || '',
      });
      setEditingRelationship(relationship);
      setShowModal(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || '加载失败');
      console.error('Failed to load relationship:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个关系吗？此操作不可恢复。')) {
      try {
        await relationshipApi.deleteRelationship(id, userId);
        await loadRelationships();
      } catch (err: any) {
        setError(err.response?.data?.error?.message || err.message || '删除失败');
        console.error('Failed to delete relationship:', err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      // 清理空字段
      const cleanedData: Relationship = {
        type: formData.type,
        name: formData.name.trim(),
        ...(formData.birthday?.trim() ? { birthday: formData.birthday.trim() } : {}),
        ...(formData.anniversary?.trim() ? { anniversary: formData.anniversary.trim() } : {}),
        ...(formData.contact?.phone || formData.contact?.email || formData.contact?.address
          ? {
              contact: {
                ...(formData.contact?.phone?.trim() ? { phone: formData.contact.phone.trim() } : {}),
                ...(formData.contact?.email?.trim() ? { email: formData.contact.email.trim() } : {}),
                ...(formData.contact?.address?.trim() ? { address: formData.contact.address.trim() } : {}),
              },
            }
          : {}),
        ...(formData.notes?.trim() ? { notes: formData.notes.trim() } : {}),
      };

      if (editingRelationship) {
        await relationshipApi.updateRelationship(editingRelationship.id, userId, cleanedData);
      } else {
        await relationshipApi.createRelationship(userId, cleanedData);
      }

      setShowModal(false);
      await loadRelationships();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || '保存失败');
      console.error('Failed to save relationship:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof Relationship, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateContactField = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      contact: {
        ...prev.contact,
        [field]: value,
      },
    }));
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return dateString;
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold mb-4 tracking-tight">关系管理</h1>
          <p className="text-text-secondary text-base md:text-lg">管理重要关系和提醒（生日、纪念日等）</p>
        </div>
        <button onClick={handleAdd} className="btn btn-primary w-full md:w-auto">
          + 添加关系
        </button>
      </div>

      {error && !showModal && (
        <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          错误: {error}
        </div>
      )}

      {loading && relationships.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-text-primary mb-4"></div>
          <p className="text-text-tertiary">加载中...</p>
        </div>
      ) : error && relationships.length === 0 ? (
        <div className="card">
          <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            <p className="font-medium mb-2">加载失败</p>
            <p className="text-sm mb-4">{error}</p>
            <button onClick={loadRelationships} className="btn btn-secondary">
              重试
            </button>
          </div>
        </div>
      ) : relationships.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-text-secondary mb-6 text-lg">暂无已添加的关系</p>
          <button onClick={handleAdd} className="btn btn-primary">
            添加第一个关系
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="min-w-full">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">姓名</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">类型</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary hidden md:table-cell">生日</th>
                  <th className="text-left py-4 px-4 md:px-6 text-sm font-medium text-text-secondary hidden lg:table-cell">纪念日</th>
                  <th className="text-right py-4 px-4 md:px-6 text-sm font-medium text-text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {relationships.map((relationship) => (
                  <tr key={relationship.id} className="border-b border-gray-100 hover:bg-cream-50 transition-colors">
                    <td className="py-4 px-4 md:px-6">
                      <div className="font-semibold text-text-primary">{relationship.name}</div>
                      <div className="text-xs text-text-tertiary mt-1 hidden md:block">ID: {relationship.id}</div>
                      <div className="text-xs text-text-tertiary mt-1 md:hidden">ID: {relationship.id.substring(0, 8)}...</div>
                    </td>
                    <td className="py-4 px-4 md:px-6">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {relationshipTypeLabels[relationship.type]}
                      </span>
                    </td>
                    <td className="py-4 px-4 md:px-6 hidden md:table-cell">
                      <span className="text-sm text-text-secondary">
                        {formatDate(relationship.birthday)}
                      </span>
                    </td>
                    <td className="py-4 px-4 md:px-6 hidden lg:table-cell">
                      <span className="text-sm text-text-secondary">
                        {formatDate(relationship.anniversary)}
                      </span>
                    </td>
                    <td className="py-4 px-4 md:px-6">
                      <div className="flex items-center justify-end gap-2 md:gap-4">
                        <button
                          onClick={() => handleEdit(relationship)}
                          className="btn btn-ghost text-xs md:text-sm px-2 md:px-4"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(relationship.id)}
                          className="text-xs md:text-sm font-medium px-2 text-accent-500 hover:text-accent-600"
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
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-semibold">
                {editingRelationship ? '编辑关系' : '添加新关系'}
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
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    姓名 *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="input"
                    required
                    placeholder="例如：张三"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    关系类型 *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => updateField('type', e.target.value as RelationshipType)}
                    className="input"
                    required
                  >
                    <option value="family">家庭成员</option>
                    <option value="friend">朋友</option>
                    <option value="colleague">同事</option>
                    <option value="other">其他</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      生日 <span className="text-xs text-gray-500">(格式: YYYY-MM-DD 或 MM-DD)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.birthday}
                      onChange={(e) => updateField('birthday', e.target.value)}
                      className="input"
                      placeholder="例如: 1990-01-01 或 01-01"
                      pattern="(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      纪念日 <span className="text-xs text-gray-500">(格式: YYYY-MM-DD 或 MM-DD)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.anniversary}
                      onChange={(e) => updateField('anniversary', e.target.value)}
                      className="input"
                      placeholder="例如: 2020-05-20 或 05-20"
                      pattern="(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})"
                    />
                  </div>
                </div>
              </div>

              {/* 联系方式 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">联系方式（可选）</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    电话
                  </label>
                  <input
                    type="text"
                    value={formData.contact?.phone || ''}
                    onChange={(e) => updateContactField('phone', e.target.value)}
                    className="input"
                    placeholder="例如：13800138000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    邮箱
                  </label>
                  <input
                    type="email"
                    value={formData.contact?.email || ''}
                    onChange={(e) => updateContactField('email', e.target.value)}
                    className="input"
                    placeholder="例如：example@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    地址
                  </label>
                  <textarea
                    value={formData.contact?.address || ''}
                    onChange={(e) => updateContactField('address', e.target.value)}
                    className="input"
                    rows={2}
                    placeholder="例如：北京市朝阳区..."
                  />
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  备注
                </label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => updateField('notes', e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="其他相关信息..."
                />
              </div>

              {/* 按钮 */}
              <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? '保存中...' : editingRelationship ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

