import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PlaceholderPage } from './components/ui/PlaceholderPage';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReviewPage } from './pages/ReviewPage';

export const App: React.FC = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/review" replace />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="cards" element={<PlaceholderPage phase="阶段 2" title="卡片管理" description="搜索、筛选、创建、编辑、查重、合并和回收卡片。" />} />
        <Route path="topics" element={<PlaceholderPage phase="阶段 3" title="知识分类" description="管理 Topic、查看关联卡片数量并预览回收影响。" />} />
        <Route path="glossary" element={<PlaceholderPage phase="阶段 3" title="术语表" description="维护术语和 Markdown 定义。" />} />
        <Route path="approvals" element={<PlaceholderPage phase="阶段 6" title="AI 审批中心" description="查看并处理 CLI 提交的待审批提案。" />} />
        <Route path="trash" element={<PlaceholderPage phase="阶段 4" title="回收站" description="恢复或永久删除 Card、Topic 和 Glossary。" />} />
        <Route path="profile" element={<PlaceholderPage phase="阶段 5" title="个人信息与偏好" description="使用 Markdown 维护用户画像并处理乐观锁冲突。" />} />
        <Route path="settings" element={<PlaceholderPage phase="阶段 7" title="系统设置" description="配置审批、Embedding、API Key、日志和密码。" />} />
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default App;
