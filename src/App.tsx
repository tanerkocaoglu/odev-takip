import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TokenReportPage from './pages/TokenReportPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/r/:token" element={<TokenReportPage />} />
      <Route path="*" element={<DashboardPage />} />
    </Routes>
  );
}