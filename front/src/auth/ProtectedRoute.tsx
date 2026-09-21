import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { LoadingState } from '../components/ui/States';

export const ProtectedRoute: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isRestoring) {
    return <LoadingState title="正在恢复会话" description="正在确认本地登录状态。" fullScreen />;
  }
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
};
