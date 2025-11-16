import { useEffect, useState } from 'react';
import { systemApi, SecurityStats } from '@/api/systemApi';

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

/**
 * 格式化数字（添加千分位）
 */
function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

export function Security() {
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const statsData = await systemApi.getSecurityStats();
      setStats(statsData);
      setLastUpdate(new Date());
    } catch (err: any) {
      console.error('Failed to load security stats:', err);
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

  if (loading && !stats) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-text-primary mb-4"></div>
        <p className="text-text-tertiary">加载中...</p>
      </div>
    );
  }

  if (error && !stats) {
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

  const rateLimitBlockRate = stats?.rateLimit.totalRequests
    ? ((stats.rateLimit.blockedRequests / stats.rateLimit.totalRequests) * 100).toFixed(2)
    : '0.00';

  const validationRejectRate = stats?.validation.totalValidated
    ? ((stats.validation.totalRejected / stats.validation.totalValidated) * 100).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">安全仪表板</h1>
          <p className="text-text-tertiary mt-2">
            监控系统安全状态和事件统计
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-text-tertiary">自动刷新</span>
          </label>
          {lastUpdate && (
            <span className="text-sm text-text-tertiary">
              最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}
            </span>
          )}
          <button onClick={loadData} className="btn btn-secondary">
            刷新
          </button>
        </div>
      </div>

      {/* 安全概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 限流状态 */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">限流保护</h3>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              stats?.rateLimit.enabled
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}>
              {stats?.rateLimit.enabled ? '已启用' : '已禁用'}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">总请求数</span>
              <span className="font-semibold">{formatNumber(stats?.rateLimit.totalRequests || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">被阻止</span>
              <span className="font-semibold text-red-600">{formatNumber(stats?.rateLimit.blockedRequests || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">阻止率</span>
              <span className="font-semibold">{rateLimitBlockRate}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">提供者</span>
              <span className="font-semibold">{stats?.rateLimit.provider || 'auto'}</span>
            </div>
          </div>
        </div>

        {/* 验证统计 */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">输入验证</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">已验证</span>
              <span className="font-semibold">{formatNumber(stats?.validation.totalValidated || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">已拒绝</span>
              <span className="font-semibold text-red-600">{formatNumber(stats?.validation.totalRejected || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">拒绝率</span>
              <span className="font-semibold">{validationRejectRate}%</span>
            </div>
          </div>
        </div>

        {/* 竞态条件检测 */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">竞态条件</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">总检测数</span>
              <span className="font-semibold">{formatNumber(stats?.raceConditions.totalDetections || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">活跃资源</span>
              <span className="font-semibold">{formatNumber(stats?.raceConditions.activeResources || 0)}</span>
            </div>
            {stats?.raceConditions.lastDetection && (
              <div className="flex justify-between text-sm">
                <span className="text-text-tertiary">最后检测</span>
                <span className="font-semibold text-xs">
                  {formatTimestamp(stats.raceConditions.lastDetection.timestamp)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 安全事件 */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">安全事件</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">可疑请求</span>
              <span className="font-semibold text-yellow-600">
                {formatNumber(stats?.securityEvents.suspiciousRequests || 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">审计日志</span>
              <span className="font-semibold">{formatNumber(stats?.securityEvents.auditLogs || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-tertiary">错误</span>
              <span className="font-semibold text-red-600">
                {formatNumber(stats?.securityEvents.errors || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 被阻止规则统计 */}
      {stats && stats.rateLimit.topBlockedRules.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-semibold tracking-tight mb-6">被阻止规则 Top 10</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">规则名称</th>
                  <th className="text-left py-3 px-4 font-semibold">规则ID</th>
                  <th className="text-right py-3 px-4 font-semibold">被阻止次数</th>
                </tr>
              </thead>
              <tbody>
                {stats.rateLimit.topBlockedRules.map((rule, _index) => (
                  <tr key={rule.ruleId} className="border-b hover:bg-cream-50">
                    <td className="py-3 px-4">{rule.ruleName}</td>
                    <td className="py-3 px-4 text-text-tertiary text-sm">{rule.ruleId}</td>
                    <td className="py-3 px-4 text-right font-semibold text-red-600">
                      {formatNumber(rule.blockedCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 被阻止身份统计 */}
      {stats && stats.rateLimit.topBlockedIdentities.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-semibold tracking-tight mb-6">被阻止身份 Top 10</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">识别策略</th>
                  <th className="text-left py-3 px-4 font-semibold">身份值</th>
                  <th className="text-right py-3 px-4 font-semibold">被阻止次数</th>
                </tr>
              </thead>
              <tbody>
                {stats.rateLimit.topBlockedIdentities.map((identity, _index) => (
                  <tr key={`${identity.strategy}:${identity.value}`} className="border-b hover:bg-cream-50">
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {identity.strategy}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text-tertiary text-sm font-mono">
                      {identity.value.length > 50 ? `${identity.value.substring(0, 50)}...` : identity.value}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-red-600">
                      {formatNumber(identity.blockedCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 验证拒绝原因 */}
      {stats && stats.validation.rejectionReasons.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-semibold tracking-tight mb-6">验证拒绝原因 Top 10</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">拒绝原因</th>
                  <th className="text-right py-3 px-4 font-semibold">次数</th>
                </tr>
              </thead>
              <tbody>
                {stats.validation.rejectionReasons.map((reason, _index) => (
                  <tr key={reason.reason} className="border-b hover:bg-cream-50">
                    <td className="py-3 px-4">{reason.reason}</td>
                    <td className="py-3 px-4 text-right font-semibold text-red-600">
                      {formatNumber(reason.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 竞态条件资源统计 */}
      {stats && stats.raceConditions.topResources.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-semibold tracking-tight mb-6">竞态条件资源 Top 10</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">资源ID</th>
                  <th className="text-right py-3 px-4 font-semibold">检测次数</th>
                </tr>
              </thead>
              <tbody>
                {stats.raceConditions.topResources.map((resource, _index) => (
                  <tr key={resource.resourceId} className="border-b hover:bg-cream-50">
                    <td className="py-3 px-4 font-mono text-sm">{resource.resourceId}</td>
                    <td className="py-3 px-4 text-right font-semibold text-yellow-600">
                      {formatNumber(resource.detectionCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

