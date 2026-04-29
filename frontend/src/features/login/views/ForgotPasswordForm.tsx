import { useState } from 'react';
import { ArrowRight, ChevronLeft, Mail } from 'lucide-react';
import * as Auth from '@/lib/auth';
import type { ViewProps } from '../types';

export function ForgotPasswordForm({ email, setEmail, goTo }: ViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Enter your email to receive a reset code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await Auth.forgotPassword(email);
      goTo('reset');
    } catch (err) {
      setError(Auth.friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="login-eyebrow">
        <span className="pulse" />
        Forgot password
      </div>
      <h1 className="login-h">Reset your password.</h1>
      <p className="login-lead">
        Enter your work email and we&rsquo;ll send a 6-digit code to set a new one.
      </p>

      <form className="login-form" onSubmit={submit} noValidate>
        <div className="lf-field">
          <label htmlFor="forgot-email">Work email</label>
          <div className="lf-input">
            <Mail size={15} />
            <input
              id="forgot-email"
              type="email"
              autoFocus
              autoComplete="email"
              placeholder="you@onecloudutopia.com"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              required
            />
          </div>
        </div>

        {error && <div className="lf-error">{error}</div>}

        <button type="submit" className="lf-submit" disabled={loading}>
          {loading ? (
            <span className="lf-spinner" />
          ) : (
            <>
              Send reset code
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      <div className="lf-otp-foot" style={{ marginTop: 24 }}>
        <button type="button" onClick={() => goTo('signin')}>
          <ChevronLeft size={13} />
          Back to sign in
        </button>
      </div>
    </>
  );
}
