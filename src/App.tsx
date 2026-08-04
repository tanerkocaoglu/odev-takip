import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/admin/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TokenReportPage from './pages/TokenReportPage';
import AcademicYearsPage from './pages/admin/AcademicYearsPage';
import WeeksPage from './pages/admin/WeeksPage';
import ClassesPage from './pages/admin/ClassesPage';
import CoursesPage from './pages/admin/CoursesPage';
import ClassCoursesPage from './pages/admin/ClassCoursesPage';
import TeachersPage from './pages/admin/TeachersPage';
import StudentsPage from './pages/admin/StudentsPage';
import GuardiansPage from './pages/admin/GuardiansPage';
import TeacherDashboardPage from './pages/teacher/TeacherDashboardPage';
import ReportEntryPage from './pages/teacher/ReportEntryPage';

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
      </Route>
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['admin']}>
            <AppLayout>
              <AdminLayout />
            </AppLayout>
          </ProtectedRoute>
        }
      >
        <Route index element={<AcademicYearsPage />} />
        <Route path="weeks" element={<WeeksPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="class-courses" element={<ClassCoursesPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="guardians" element={<GuardiansPage />} />
      </Route>
      <Route
        path="/teacher"
        element={
          <ProtectedRoute roles={['teacher', 'admin']}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboardPage />} />
        <Route
          path="reports/:classCourseId/:weekId"
          element={<ReportEntryPage />}
        />
      </Route>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/r/:token" element={<TokenReportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
