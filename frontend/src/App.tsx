import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bindTweaksToDocument } from '@/stores/tweaks';
import { useAuth } from '@/stores/auth';
import { RequireAuth } from '@/components/RequireAuth';
import LandingPage from '@/features/landing/LandingPage';
import LoginPage from '@/features/login/LoginPage';
import { PhasePlaceholder } from '@/pages/PhasePlaceholder';

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
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/app/*"
            element={
              <RequireAuth>
                <PhasePlaceholder
                  phase="Phase 4"
                  title="Dashboard shell coming next"
                  description="Sidebar + topbar + nested routes for all 13 screens. You're authenticated, so the next push will drop you straight into /app/dashboard."
                />
              </RequireAuth>
            }
          />
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
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
