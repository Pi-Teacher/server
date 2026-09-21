import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { useAuth } from '../auth/AuthProvider';

const pathName = (pathname: string) => pathname.split('/').filter(Boolean)[0] ?? 'dashboard';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentPath = pathName(location.pathname);

  const handleNavigate = (path: string) => {
    navigate(`/${path}`);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <div className="hidden lg:block">
        <Sidebar currentPath={currentPath} onNavigate={handleNavigate} onLogout={() => void auth.logout()} />
      </div>

      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-outline-variant/30 bg-surface-container-lowest px-4 lg:hidden">
        <button
          type="button"
          aria-label="打开导航"
          onClick={() => setMobileMenuOpen(true)}
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">psychology</span>
          <span className="font-semibold">Pi Teacher</span>
        </div>
        <button
          type="button"
          aria-label="退出登录"
          onClick={() => void auth.logout()}
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined">logout</span>
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[80] bg-inverse-surface/30 lg:hidden" onMouseDown={() => setMobileMenuOpen(false)}>
          <div className="h-full w-72" onMouseDown={(event) => event.stopPropagation()}>
            <Sidebar currentPath={currentPath} onNavigate={handleNavigate} onLogout={() => void auth.logout()} />
          </div>
        </div>
      )}

      <div className="min-h-screen lg:pl-72">
        <Outlet />
      </div>
    </div>
  );
};
