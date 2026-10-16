import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Home from './pages/Home';
import Ask from './pages/Ask';
import Search from './pages/Search';
import Conversations from './pages/Conversations';
import Spaces from './pages/Spaces';
import Documents from './pages/Documents';
import DocumentDetail from './pages/DocumentDetail';
import EvidenceViewer from './pages/EvidenceViewer';
import Compare from './pages/Compare';
import Pipeline from './pages/Pipeline';
import Quality from './pages/Quality';
import Team from './pages/Team';
import Integrations from './pages/Integrations';
import SettingsPage from './pages/Settings';
import Architecture from './pages/Architecture';

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="ask/:conversationId?" element={<Ask />} />
        <Route path="search" element={<Search />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="spaces" element={<Spaces />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:id" element={<DocumentDetail />} />
        <Route path="evidence/:chunkId" element={<EvidenceViewer />} />
        <Route path="compare" element={<Compare />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="quality" element={<Quality />} />
        <Route path="team" element={<Team />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="architecture" element={<Architecture />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
