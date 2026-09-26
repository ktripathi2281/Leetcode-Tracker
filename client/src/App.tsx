import { Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { GuestOnly, RequireAuth } from './auth/routeGuards';
import AppLayout from './components/AppLayout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProblemsPage from './pages/ProblemsPage';
import ProblemDetailPage from './pages/ProblemDetailPage';
import { EditProblemPage, NewProblemPage } from './pages/ProblemFormPages';
import SettingsPage from './pages/SettingsPage';
import ReviewsPage from './pages/ReviewsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import PlanPage from './pages/PlanPage';

// The router and query client are provided by main.tsx, or by tests.
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="problems" element={<ProblemsPage />} />
            <Route path="problems/new" element={<NewProblemPage />} />
            <Route path="problems/:id" element={<ProblemDetailPage />} />
            <Route path="problems/:id/edit" element={<EditProblemPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="plan" element={<PlanPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
