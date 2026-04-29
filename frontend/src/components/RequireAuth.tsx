import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/stores/auth';

interface Props {
  children: ReactNode;
}

/**
 * Route guard for /app/*. While the auth store is bootstrapping,
 * renders nothing (a thin loader could go here in a later phase).
 * If the user has no Cognito group ('none'), bounces them to /login
 * which renders the pending-approval view.
 */
export function RequireAuth({ children }: Props) {
  const { isAuthenticated, isBooting, role } = useAuth();
  const location = useLocation();

  if (isBooting) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg)',
          color: 'var(--ink-3)',
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!isAuthenticated || role === 'none') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
