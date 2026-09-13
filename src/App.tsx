import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import TeacherShell from './components/layout/TeacherShell';
import CustomerShell from './components/layout/CustomerShell';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/admin/AdminLayout';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
import TokenReportPage from './pages/TokenReportPage';
import PrivacyNoticePage from './pages/PrivacyNoticePage';
import AcademicYearsPage from './pages/admin/AcademicYearsPage';
import WeeksPage from './pages/admin/WeeksPage';
import ClassesPage from './pages/admin/ClassesPage';
import CoursesPage from './pages/admin/CoursesPage';
import ClassCoursesPage from './pages/admin/ClassCoursesPage';
import TeachersPage from './pages/admin/TeachersPage';
import StudentsPage from './pages/admin/StudentsPage';
import GuardiansPage from './pages/admin/GuardiansPage';
import SchoolsPage from './pages/admin/SchoolsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminReportViewPage from './pages/admin/AdminReportViewPage';
import DigestSendPage from './pages/admin/DigestSendPage';
import TeacherDashboardPage from './pages/teacher/TeacherDashboardPage';
import ReportEntryPage from './pages/teacher/ReportEntryPage';
import ReportHistoryPage from './pages/teacher/ReportHistoryPage';
import SubmissionsReviewPage from './pages/teacher/SubmissionsReviewPage';
import HomeworkListPage from './pages/student/HomeworkListPage';
import GuardianHomePage from './pages/guardian/GuardianHomePage';
import GuardianReportDetailPage from './pages/guardian/GuardianReportDetailPage';

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
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="academic-years" element={<AcademicYearsPage />} />
        <Route path="weeks" element={<WeeksPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="class-courses" element={<ClassCoursesPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="guardians" element={<GuardiansPage />} />
        <Route path="schools" element={<SchoolsPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="reports/:id" element={<AdminReportViewPage />} />
        <Route path="digests" element={<DigestSendPage />} />
      </Route>
      <Route
        path="/teacher"
        element={
          <ProtectedRoute roles={['teacher', 'admin']}>
            <TeacherShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboardPage />} />
        <Route path="reports/history" element={<ReportHistoryPage />} />
        <Route path="submissions" element={<SubmissionsReviewPage />} />
        <Route
          path="reports/:classCourseId/:weekId"
          element={<ReportEntryPage />}
        />
      </Route>
      <Route
        path="/student"
        element={
          <ProtectedRoute roles={['student']}>
            <CustomerShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeworkListPage />} />
      </Route>
      <Route
        path="/guardian"
        element={
          <ProtectedRoute roles={['guardian']}>
            <CustomerShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<GuardianHomePage />} />
        <Route path="reports/:id" element={<GuardianReportDetailPage />} />
      </Route>
      <Route
        path="/sifre-yenile"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/gizlilik" element={<PrivacyNoticePage />} />
      <Route path="/r/:token" element={<TokenReportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
