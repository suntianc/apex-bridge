import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useSetupStore } from '@/store/setupStore';
import { Setup } from '@/pages/Setup';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Settings } from '@/pages/Settings';
import { Personalities } from '@/pages/Personalities';
import { Relationships } from '@/pages/Relationships';
import { Nodes } from '@/pages/Nodes';
import { Security } from '@/pages/Security';
import { Preferences } from '@/pages/Preferences';
import { Layout } from '@/components/Layout';

export function Router() {
  const { isAuthenticated } = useAuthStore();
  const { isSetupCompleted, checkSetupStatus } = useSetupStore();

  // 定期检查设置状态，确保路由保护生效
  useEffect(() => {
    checkSetupStatus();
    // 设置定期检查（每2秒检查一次）
    const interval = setInterval(() => {
      checkSetupStatus();
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Routes>
      {/* 设置向导 - 首次启动时显示 */}
      <Route
        path="/setup"
        element={
          (() => {
            // 如果设置已完成，强制跳转到登录页
            if (isSetupCompleted) {
              console.log('[Router] Setup completed, redirecting to login');
              return <Navigate to="/login" replace />;
            }
            return <Setup />;
          })()
        }
      />
      
      {/* 登录页 */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
        }
      />
      
      {/* 需要认证的路由 */}
      <Route
        path="/"
        element={
          !isSetupCompleted ? (
            <Navigate to="/setup" replace />
          ) : !isAuthenticated ? (
            <Navigate to="/login" replace />
          ) : (
            <Layout />
          )
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="personalities" element={<Personalities />} />
        <Route path="relationships" element={<Relationships />} />
        <Route path="nodes" element={<Nodes />} />
        <Route path="security" element={<Security />} />
        <Route path="preferences" element={<Preferences />} />
      </Route>
      
      {/* 404 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

