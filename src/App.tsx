import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './components/layout/Layout';
import { ScanPage } from './pages/ScanPage';
import { DashboardPage } from './pages/DashboardPage';
import { SearchPage } from './pages/SearchPage';
import { StudentDetailPage } from './pages/StudentDetailPage';
import { ReportsPage } from './pages/ReportsPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useTheme } from './hooks/useTheme';
import { fetchStudents } from './services/api';
import { cacheStudents } from './services/db';
import { startSyncEngine, initSyncState } from './services/sync';
import { seedDummyStudents } from './services/seed';
import { showToast } from './components/ui/Toast';

function AppRoutes() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const { isAuthenticated, isAdmin } = useAuth();
  useTheme(); // Initialize theme

  // Load and cache students once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadStudents = async () => {
      // Seed dummy data for demo mode (no API configured)
      await seedDummyStudents();

      if (navigator.onLine) {
        const result = await fetchStudents();
        if (result.success && result.data) {
          await cacheStudents(result.data);
        }
      }
    };
    loadStudents();
  }, [isAuthenticated]);

  // Start sync engine
  useEffect(() => {
    initSyncState();
    startSyncEngine();
  }, []);

  // Toast on connectivity change
  useEffect(() => {
    if (isOnline && wasOffline) {
      showToast('success', 'Back online — syncing pending scans...');
    }
  }, [isOnline, wasOffline]);

  useEffect(() => {
    if (!isOnline) {
      showToast('warning', 'You are offline — scans will be saved on this phone');
    }
  }, [isOnline]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ScanPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/student/:id" element={<StudentDetailPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route
          path="/admin"
          element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  );
}
