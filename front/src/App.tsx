import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { APIKeysPanel } from './features/settings/APIKeysPanel';
import { ApprovalsSettingsPage } from './features/settings/ApprovalsSettingsPage';
import { ChangePasswordPanel } from './features/settings/ChangePasswordPanel';
import { EmbeddingPanel } from './features/settings/EmbeddingPanel';
import { GeneralSettingsPage } from './features/settings/GeneralSettingsPage';
import { AppShell } from './layout/AppShell';
import { SettingsLayout } from './layout/SettingsLayout';
import { CardsPage } from './pages/CardsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { GlossaryPage } from './pages/GlossaryPage';
import { LoginPage } from './pages/LoginPage';
import { LogsPage } from './pages/LogsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReviewPage } from './pages/ReviewPage';
import { TopicsPage } from './pages/TopicsPage';
import { TrashPage } from './pages/TrashPage';

export const App: React.FC = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="topics" element={<TopicsPage />} />
        <Route path="glossary" element={<GlossaryPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="approval-switches" element={<ApprovalsSettingsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="trash" element={<TrashPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<GeneralSettingsPage />} />
          <Route path="embedding" element={<EmbeddingPanel />} />
          <Route path="api-keys" element={<APIKeysPanel />} />
          <Route path="password" element={<ChangePasswordPanel />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

export default App;
