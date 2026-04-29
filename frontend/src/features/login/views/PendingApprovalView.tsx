import { Clock, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import type { ViewProps } from '../types';

/**
 * Shown after a successful self-signup login when the user is in no
 * Cognito group yet. Admin needs to approve them before they can use
 * the dashboard.
 */
export function PendingApprovalView({ email, goTo }: ViewProps) {
  const signOut = useAuth((s) => s.signOut);

  const onBack = () => {
    signOut();
    goTo('signin');
  };

  return (
    <div className="pending-card">
      <div className="pending-ico">
        <Clock size={28} strokeWidth={1.5} />
      </div>
      <h1 className="login-h" style={{ fontSize: 32 }}>
        Awaiting approval.
      </h1>
      <p className="login-lead" style={{ marginTop: 12 }}>
        Your account <strong style={{ color: '#fff' }}>{email}</strong> was created. An admin will
        grant you access shortly. You&rsquo;ll get an email when your role is assigned.
      </p>

      <button
        type="button"
        className="lf-submit"
        style={{ marginTop: 12 }}
        onClick={onBack}
      >
        <ChevronLeft size={14} />
        Sign out
      </button>
    </div>
  );
}
