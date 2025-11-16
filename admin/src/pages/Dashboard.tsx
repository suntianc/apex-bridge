import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { systemApi, SystemStatus, SystemStats } from '@/api/systemApi';

/**
 * 格式化运行时间（秒数转换为可读格式）
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}天 ${hours}小时 ${minutes}分钟`;
  } else if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟 ${secs}秒`;
  } else {
    return `${secs}秒`;
  }
}

/**
 * 格式化内存大小（MB）
 */
function formatMemory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb} MB`;
}

/**
 * 计算内存使用百分比
 */
function getMemoryUsagePercent(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

export function Dashboard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [statusData, statsData] = await Promise.all([
        systemApi.getStatus(),
        systemApi.getStats(),
      ]);
      setStatus(statusData);
      setStats(statsData);
      setLastUpdate(new Date());
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err.response?.data?.error || '加载数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 自动刷新（每30秒）
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData();
    }, 30000); // 30秒刷新一次

    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading && !status) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-text-primary mb-4"></div>
        <p className="text-text-tertiary">加载中...</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="card">
        <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <p className="font-medium mb-2">加载失败</p>
          <p className="text-sm mb-4">{error}</p>
          <button onClick={loadData} className="btn btn-secondary">
            重试
          </button>
        </div>
      </div>
    );
  }

  const memoryUsage = status?.server?.memory
    ? getMemoryUsagePercent(status.server.memory.used, status.server.memory.total)
    : 0;
  const systemMemoryUsage = status?.server?.memory
    ? getMemoryUsagePercent(
        status.server.memory.systemTotal - status.server.memory.systemFree,
        status.server.memory.systemTotal
      )
    : 0;

  return (
    <div className="space-y-12">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold mb-4 tracking-tight">Dashboard</h1>
          <p className="text-text-secondary text-lg">系统概览和运行状态</p>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-sm text-text-tertiary">
              最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}
            </span>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-text-secondary">自动刷新</span>
          </label>
          <button onClick={loadData} className="btn btn-secondary text-sm" disabled={loading}>
            {loading ? '刷新中...' : '手动刷新'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* 系统状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-compact">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text-tertiary">服务器状态</h3>
            <span
              className={`w-2 h-2 rounded-full ${
                status?.server?.running ? 'bg-green-500' : 'bg-red-500'
              }`}
            ></span>
          </div>
          <p className="text-3xl font-semibold text-text-primary mb-2">
            {status?.server?.running ? '运行中' : '已停止'}
          </p>
          {status?.server?.uptime && (
            <p className="text-sm text-text-tertiary">
              运行时间: {formatUptime(status.server.uptime)}
            </p>
          )}
        </div>

        <div className="card-compact">
          <h3 className="text-sm font-medium text-text-tertiary mb-3">在线节点</h3>
          <p className="text-3xl font-semibold text-text-primary">
            {status?.nodes?.online || 0}
          </p>
          <p className="text-sm text-text-tertiary mt-2">
            共 {status?.nodes?.total || 0} 个节点
          </p>
        </div>

        <div className="card-compact">
          <h3 className="text-sm font-medium text-text-tertiary mb-3">CPU核心数</h3>
          <p className="text-3xl font-semibold text-text-primary">
            {status?.server?.cpu?.cores || 0}
          </p>
          <p className="text-sm text-text-tertiary mt-2">个核心</p>
        </div>
      </div>

      {/* 系统资源使用情况 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 应用内存使用 */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-6 tracking-tight">应用内存使用</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-text-secondary">已使用</span>
                <span className="text-sm font-medium text-text-primary">
                  {memoryUsage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    memoryUsage > 80 ? 'bg-red-500' : memoryUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${memoryUsage}%` }}
                ></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
              <div>
                <p className="text-xs text-text-tertiary mb-1">已使用</p>
                <p className="text-lg font-semibold text-text-primary">
                  {status?.server?.memory?.used
                    ? formatMemory(status.server.memory.used)
                    : '0 MB'}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary mb-1">总计</p>
                <p className="text-lg font-semibold text-text-primary">
                  {status?.server?.memory?.total
                    ? formatMemory(status.server.memory.total)
                    : '0 MB'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 系统内存使用 */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-6 tracking-tight">系统内存使用</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-text-secondary">已使用</span>
                <span className="text-sm font-medium text-text-primary">
                  {systemMemoryUsage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    systemMemoryUsage > 80
                      ? 'bg-red-500'
                      : systemMemoryUsage > 60
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${systemMemoryUsage}%` }}
                ></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
              <div>
                <p className="text-xs text-text-tertiary mb-1">已使用</p>
                <p className="text-lg font-semibold text-text-primary">
                  {status?.server?.memory?.systemTotal && status?.server?.memory?.systemFree
                    ? formatMemory(status.server.memory.systemTotal - status.server.memory.systemFree)
                    : '0 MB'}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary mb-1">总计</p>
                <p className="text-lg font-semibold text-text-primary">
                  {status?.server?.memory?.systemTotal
                    ? formatMemory(status.server.memory.systemTotal)
                    : '0 MB'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作入口 */}
      <div className="card">
        <h2 className="text-2xl font-semibold mb-6 tracking-tight">快速操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="p-6 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <span className="text-2xl">⚙️</span>
              </div>
              <span className="text-blue-500 group-hover:text-blue-600">→</span>
            </div>
            <h3 className="font-semibold text-text-primary mb-1">配置管理</h3>
            <p className="text-sm text-text-tertiary">管理系统配置、LLM提供商、认证设置等</p>
          </button>

          <button
            onClick={() => navigate('/nodes')}
            className="p-6 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center group-hover:bg-green-100 transition-colors">
                <span className="text-2xl">🖥️</span>
              </div>
              <span className="text-blue-500 group-hover:text-blue-600">→</span>
            </div>
            <h3 className="font-semibold text-text-primary mb-1">节点管理</h3>
            <p className="text-sm text-text-tertiary">查看和管理所有节点，注册新节点，监控节点状态</p>
          </button>

          <button
            onClick={() => navigate('/security')}
            className="p-6 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center group-hover:bg-red-100 transition-colors">
                <span className="text-2xl">🔒</span>
              </div>
              <span className="text-blue-500 group-hover:text-blue-600">→</span>
            </div>
            <h3 className="font-semibold text-text-primary mb-1">安全仪表板</h3>
            <p className="text-sm text-text-tertiary">查看系统安全状态、API密钥管理、访问日志</p>
          </button>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="card">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold tracking-tight">统计信息</h2>
          <span className="text-sm text-text-tertiary">
            {stats?.requests?.total === 0 && stats?.conversations?.total === 0
              ? '暂无统计数据'
              : '实时数据'}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="p-4 bg-cream-50 rounded-lg">
            <p className="text-sm text-text-tertiary mb-2">今日请求</p>
            <p className="text-3xl font-semibold text-text-primary">
              {stats?.requests?.today || 0}
            </p>
          </div>
          <div className="p-4 bg-cream-50 rounded-lg">
            <p className="text-sm text-text-tertiary mb-2">总请求数</p>
            <p className="text-3xl font-semibold text-text-primary">
              {stats?.requests?.total || 0}
            </p>
          </div>
          <div className="p-4 bg-cream-50 rounded-lg">
            <p className="text-sm text-text-tertiary mb-2">今日对话</p>
            <p className="text-3xl font-semibold text-text-primary">
              {stats?.conversations?.today || 0}
            </p>
          </div>
          <div className="p-4 bg-cream-50 rounded-lg">
            <p className="text-sm text-text-tertiary mb-2">总对话数</p>
            <p className="text-3xl font-semibold text-text-primary">
              {stats?.conversations?.total || 0}
            </p>
          </div>
        </div>
      </div>

      {/* 节点状态概览 */}
      {status?.nodes && status.nodes.total > 0 && (
        <div className="card">
          <h2 className="text-2xl font-semibold mb-8 tracking-tight">节点状态概览</h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center p-6 bg-cream-50 rounded-lg">
              <p className="text-sm text-text-tertiary mb-2">总节点数</p>
              <p className="text-3xl font-semibold text-text-primary">
                {status.nodes.total}
              </p>
            </div>
            <div className="text-center p-6 bg-green-50 rounded-lg">
              <p className="text-sm text-text-tertiary mb-2">在线节点</p>
              <p className="text-3xl font-semibold text-green-600">
                {status.nodes.online}
              </p>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-lg">
              <p className="text-sm text-text-tertiary mb-2">离线节点</p>
              <p className="text-3xl font-semibold text-gray-600">
                {status.nodes.offline}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

