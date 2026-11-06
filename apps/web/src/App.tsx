import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import { Login, Signup, Forgot, Reset } from './pages/AuthPages';
import Dashboard from './pages/Dashboard';
import GroupPage from './pages/GroupPage';
import ExamEditor from './pages/ExamEditor';
import ExamStart from './pages/ExamStart';
import AttemptPage from './pages/AttemptPage';
import Results from './pages/Results';

function Protected() {
  const { session, loading } = useAuth();
  if (loading) return <p className="p-8 text-muted">Yüklənir...</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <Layout><Outlet /></Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups/:id" element={<GroupPage />} />
        <Route path="/groups/:gid/exams/new" element={<ExamEditor />} />
        <Route path="/exams/:id/edit" element={<ExamEditor />} />
        <Route path="/exams/:id" element={<ExamStart />} />
        <Route path="/attempts/:id" element={<AttemptPage />} />
        <Route path="/results" element={<Results />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
