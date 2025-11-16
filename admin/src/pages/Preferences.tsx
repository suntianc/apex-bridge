import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  listPreferences,
  createPreference,
  updatePreference,
  deletePreference,
  PreferenceDTO,
  exportPreferencesApi,
  importPreferencesApi,
} from '@/api/preferenceApi';

function formatMs(ms?: number | null): string {
  if (ms == null) return '—';
  if (ms < 0) return '过期';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

export function Preferences() {
  const [userId, setUserId] = useState<string>('demo-user');
  const { user } = useAuthStore();
  const isAdmin = !!user && (user.role === 'admin' || user.username === 'admin');
  const [items, setItems] = useState<PreferenceDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PreferenceDTO | null>(null);
  const [searchKey, setSearchKey] = useState<string>('');
  const [searchSource, setSearchSource] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const remainingTtl = useMemo(() => {
    const now = Date.now();
    const map: Record<string, number | null> = {};
    for (const it of items) {
      if (it.expiresAt) {
        const left = new Date(it.expiresAt).getTime() - now;
        map[it.id || `${it.userId}:${it.key}`] = left;
      } else {
        map[it.id || `${it.userId}:${it.key}`] = null;
      }
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const k = searchKey.trim().toLowerCase();
    const s = searchSource.trim().toLowerCase();
    return items.filter((it) => {
      const keyOk = k ? it.key.toLowerCase().includes(k) : true;
      const srcOk = s ? (it.source || '').toLowerCase().includes(s) : true;
      return keyOk && srcOk;
    });
  }, [items, searchKey, searchSource]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listPreferences({ userId });
      setItems(data);
      setPage(1);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleSave() {
    if (!editing) return;
    try {
      const payload: PreferenceDTO = {
        userId: editing.userId || userId,
        key: editing.key,
        value: editing.value,
        source: editing.source || 'admin',
        ttlMs: editing.ttlMs ?? null,
      };
      if (editing.id) {
        await updatePreference(editing.id, payload);
      } else {
        await createPreference(payload);
      }
      setEditing(null);
      await refresh();
    } catch (e: any) {
      alert(`保存失败: ${e?.message ?? String(e)}`);
    }
  }

  async function handleDelete(it: PreferenceDTO) {
    if (!it.id) {
      alert('无法删除：缺少ID');
      return;
    }
    if (!confirm(`确认删除偏好「${it.key}」?`)) return;
    try {
      await deletePreference(it.id);
      await refresh();
    } catch (e: any) {
      alert(`删除失败: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1">用户ID</label>
          <input
            className="input input-bordered"
            placeholder="输入用户ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">搜索 Key</label>
          <input
            className="input input-bordered"
            placeholder="按 Key 过滤"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">搜索 Source</label>
          <input
            className="input input-bordered"
            placeholder="按 Source 过滤"
            value={searchSource}
            onChange={(e) => setSearchSource(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={refresh} disabled={loading}>
          刷新
        </button>
        {isAdmin && (
        <button
          className="btn"
          onClick={async () => {
            try {
              const data = await exportPreferencesApi(userId);
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `preferences-${userId}.json`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e: any) {
              alert(`导出失败: ${e?.message ?? String(e)}`);
            }
          }}
        >
          导出JSON
        </button>
        )}
        {isAdmin && (
        <label className="btn">
          导入JSON
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                const prefs: Array<{ key: string; value: unknown; source?: string; ttlMs?: number|null }> =
                  Array.isArray(parsed?.preferences)
                    ? parsed.preferences.map((p: any) => ({
                        key: p.key || p.type,
                        value: p.value,
                        source: p.source || p?.context?.source,
                        ttlMs: p.ttlMs ?? null
                      }))
                    : [];
                if (prefs.length === 0) {
                  alert('导入文件无有效偏好');
                  return;
                }
                const result = await importPreferencesApi(userId, prefs);
                await refresh();
                alert(`导入完成：${result.imported} 条`);
              } catch (err: any) {
                alert(`导入失败: ${err?.message ?? String(err)}`);
              } finally {
                e.currentTarget.value = '';
              }
            }}
          />
        </label>
        )}
        {isAdmin && (
        <button
          className="btn"
          onClick={() =>
            setEditing({
              userId,
              key: '',
              value: '',
              source: 'admin',
              ttlMs: null,
            })
          }
        >
          新增偏好
        </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* 分页控制 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">总数: {filtered.length}</span>
          <span className="text-sm text-text-secondary">
            页码: {page}/{pageCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </button>
          <button className="btn btn-sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
            下一页
          </button>
          <select
            className="select select-bordered select-sm"
            value={pageSize}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPageSize(v);
              setPage(1);
            }}
          >
            <option value={10}>10/页</option>
            <option value={20}>20/页</option>
            <option value={50}>50/页</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
              <th>Source</th>
              <th>Created</th>
              <th>Updated</th>
              <th>TTL</th>
              <th>剩余TTL</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((it) => {
              const id = it.id || `${it.userId}:${it.key}`;
              const left = remainingTtl[id] ?? null;
              return (
                <tr key={id}>
                  <td className="font-mono text-xs">{it.key}</td>
                  <td className="font-mono text-xs break-all">{JSON.stringify(it.value)}</td>
                  <td>{it.source || '—'}</td>
                  <td className="text-xs text-text-tertiary">{it.createdAt ? new Date(it.createdAt).toLocaleString() : '—'}</td>
                  <td className="text-xs text-text-tertiary">{it.updatedAt ? new Date(it.updatedAt).toLocaleString() : '—'}</td>
                  <td>{it.ttlMs != null ? formatMs(it.ttlMs) : '—'}</td>
                  <td>{left != null ? formatMs(left) : '∞'}</td>
                  <td className="space-x-2">
                    <button className="btn btn-sm" onClick={() => setEditing({ ...it })}>
                      编辑
                    </button>
                    <button className="btn btn-sm btn-error" onClick={() => handleDelete(it)}>
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="text-center text-text-tertiary py-8">
                  无偏好数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 编辑/新增弹窗 */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold">{editing.id ? '编辑偏好' : '新增偏好'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm text-text-secondary mb-1">用户ID</label>
                <input
                  className="input input-bordered w-full"
                  value={editing.userId || userId}
                  onChange={(e) => setEditing({ ...editing, userId: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Key</label>
                <input
                  className="input input-bordered w-full"
                  value={editing.key}
                  onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Source</label>
                <input
                  className="input input-bordered w-full"
                  value={editing.source || ''}
                  onChange={(e) => setEditing({ ...editing, source: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-text-secondary mb-1">Value (JSON)</label>
                <textarea
                  className="textarea textarea-bordered w-full"
                  rows={4}
                  value={(() => {
                    try {
                      return typeof editing.value === 'string'
                        ? editing.value
                        : JSON.stringify(editing.value ?? '', null, 2);
                    } catch {
                      return String(editing.value ?? '');
                    }
                  })()}
                  onChange={(e) => {
                    const text = e.target.value;
                    try {
                      const parsed = JSON.parse(text);
                      setEditing({ ...editing, value: parsed });
                    } catch {
                      setEditing({ ...editing, value: text });
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">TTL (毫秒，可空)</label>
                <input
                  className="input input-bordered w-full"
                  type="number"
                  placeholder="例如 3600000"
                  value={editing.ttlMs ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      ttlMs: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


