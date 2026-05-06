import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bindTweaksToDocument } from '@/stores/tweaks';
import { useAuth } from '@/stores/auth';
import { RequireAuth } from '@/components/RequireAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import LandingPage from '@/features/landing/LandingPage';
import LoginPage from '@/features/login/LoginPage';
import { AppShell } from '@/features/app/AppShell';
import { PhasePlaceholder } from '@/pages/PhasePlaceholder';

import DashboardScreen from '@/pages/app/DashboardScreen';
import InstancesScreen from '@/pages/app/InstancesScreen';
import MyServersScreen from '@/pages/app/MyServersScreen';
import BackupsScreen from '@/pages/app/BackupsScreen';
import BillingScreen from '@/pages/app/BillingScreen';
import AnalyticsScreen from '@/pages/app/AnalyticsScreen';
import AuditScreen from '@/pages/app/AuditScreen';
import VendorsScreen from '@/pages/app/VendorsScreen';
import CustomersScreen from '@/pages/app/CustomersScreen';
import AlertsScreen from '@/pages/app/AlertsScreen';
import FinSettingsScreen from '@/pages/app/FinSettingsScreen';
import AccountsScreen from '@/pages/app/AccountsScreen';
import UsersScreen from '@/pages/app/UsersScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    const unsub = bindTweaksToDocument();
    void bootstrap();
    return unsub;
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardScreen />} />
            <Route path="instances" element={<InstancesScreen />} />
            <Route path="servers" element={<MyServersScreen />} />
            <Route path="backups" element={<BackupsScreen />} />
            <Route path="billing" element={<BillingScreen />} />
            <Route path="analytics" element={<AnalyticsScreen />} />
            <Route path="audit" element={<AuditScreen />} />
            <Route path="vendors" element={<VendorsScreen />} />
            <Route path="customers" element={<CustomersScreen />} />
            <Route path="alerts" element={<AlertsScreen />} />
            <Route path="finsettings" element={<FinSettingsScreen />} />
            <Route path="accounts" element={<AccountsScreen />} />
            <Route path="users" element={<UsersScreen />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Route>

          <Route
            path="*"
            element={
              <PhasePlaceholder
                phase="404"
                title="That route doesn't exist yet"
                description="Try the landing page, or head to /login."
              />
            }
          />
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
