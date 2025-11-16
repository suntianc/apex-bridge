import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export function Layout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/security', label: '安全仪表板', icon: '🔒' },
    { path: '/settings', label: '配置管理', icon: '⚙️' },
    { path: '/personalities', label: '人格管理', icon: '🎭' },
    { path: '/relationships', label: '关系管理', icon: '👥' },
    { path: '/nodes', label: '节点管理', icon: '🖥️' },
    { path: '/preferences', label: '偏好管理', icon: '🧷' },
  ];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream-50">
      {/* 移动端遮罩层 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-50 transition-transform duration-300 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-8 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Apex Bridge</h1>
              <p className="text-sm text-text-tertiary mt-2">管理后台</p>
            </div>
            {/* 移动端关闭按钮 */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-text-tertiary hover:text-text-primary"
            >
              ✕
            </button>
          </div>
        </div>
        
        <nav className="p-6 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-cream-100 text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-cream-50 hover:text-text-primary'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* 主内容区 */}
      <div className="md:ml-64">
        {/* 顶部栏 */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-12 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* 移动端菜单按钮 */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden text-text-tertiary hover:text-text-primary"
              >
                ☰
              </button>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary tracking-tight">
                {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
              </h2>
            </div>
            <div className="flex items-center gap-4 md:gap-6">
              <span className="text-sm text-text-secondary hidden sm:inline">{user?.username}</span>
              {user?.role && (
                <span
                  title={`当前角色：${user.role}`}
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium border ${
                    user.role === 'admin'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  {user.role === 'admin' ? '管理员' : '普通用户'}
                </span>
              )}
              <button
                onClick={logout}
                className="btn btn-ghost text-sm"
              >
                登出
              </button>
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="p-4 md:p-8 lg:p-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

