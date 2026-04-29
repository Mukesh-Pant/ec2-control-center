import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { BrandMark } from '@/components/BrandMark';
import { LoginBackground } from './LoginBackground';
import { LoginVisual } from './LoginVisual';
import { LoginQuote } from './LoginQuote';
import { SignInForm } from './views/SignInForm';
import { SignUpForm } from './views/SignUpForm';
import { VerifyEmailForm } from './views/VerifyEmailForm';
import { ForgotPasswordForm } from './views/ForgotPasswordForm';
import { ResetPasswordForm } from './views/ResetPasswordForm';
import { NewPasswordForm } from './views/NewPasswordForm';
import { PendingApprovalView } from './views/PendingApprovalView';
import type { LoginView, ViewProps } from './types';
import './login.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [view, setView] = useState<LoginView>('signin');
  const [email, setEmail] = useState('');

  // If a session was restored on boot, decide where to send them.
  useEffect(() => {
    if (auth.isBooting) return;
    if (auth.isAuthenticated) {
      if (auth.role === 'none') setView('pending');
      else navigate('/app/dashboard', { replace: true });
    }
  }, [auth.isBooting, auth.isAuthenticated, auth.role, navigate]);

  const onAuthenticated = () => {
    if (auth.role === 'none' || useAuth.getState().role === 'none') {
      setEmail(useAuth.getState().email || email);
      setView('pending');
      return;
    }
    navigate('/app/dashboard', { replace: true });
  };

  const props: ViewProps = {
    email,
    setEmail,
    goTo: setView,
    onAuthenticated,
  };

  return (
    <div className="login-page">
      <LoginBackground />

      <nav className="login-nav">
        <button
          className="login-back"
          onClick={() => navigate('/')}
          type="button"
          aria-label="Back to landing"
        >
          <span className="login-mark">
            <BrandMark size={14} />
          </span>
          One Cloud Utopia
        </button>
        <div className="login-nav-r">
          <span className="login-nav-q">
            {view === 'signup' ? 'Already have an account?' : 'New here?'}
          </span>
          <button
            type="button"
            className="login-nav-link"
            onClick={() => setView(view === 'signup' ? 'signin' : 'signup')}
          >
            {view === 'signup' ? 'Sign in' : 'Request access'}
            <ArrowUpRight size={13} />
          </button>
        </div>
      </nav>

      <div className="login-shell">
        <div className="login-form-pane">
          <div className="login-form-wrap" key={view}>
            {view === 'signin' && <SignInForm {...props} />}
            {view === 'signup' && <SignUpForm {...props} />}
            {view === 'verify' && <VerifyEmailForm {...props} />}
            {view === 'forgot' && <ForgotPasswordForm {...props} />}
            {view === 'reset' && <ResetPasswordForm {...props} />}
            {view === 'newpass' && <NewPasswordForm {...props} />}
            {view === 'pending' && <PendingApprovalView {...props} />}
          </div>
        </div>

        <div className="login-visual-pane">
          <LoginVisual />
          <LoginQuote />
        </div>
      </div>
    </div>
  );
}
