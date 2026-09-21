import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PlaceholderPage } from './components/ui/PlaceholderPage';
import { AppShell } from './layout/AppShell';
import { CardsPage } from './pages/CardsPage';
import { GlossaryPage } from './pages/GlossaryPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReviewPage } from './pages/ReviewPage';
import { TopicsPage } from './pages/TopicsPage';

export const App: React.FC = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/review" replace />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="topics" element={<TopicsPage />} />
        <Route path="glossary" element={<GlossaryPage />} />
        <Route path="approvals" element={<PlaceholderPage phase="阶段 6" title="AI 审批中心" description="查看并处理 CLI 提交的待审批提案。" />} />
        <Route path="trash" element={<PlaceholderPage phase="阶段 4" title="回收站" description="恢复或永久删除 Card、Topic 和 Glossary。" />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<PlaceholderPage phase="阶段 7" title="系统设置" description="配置审批、Embedding、API Key、日志和密码。" />} />
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default App;
