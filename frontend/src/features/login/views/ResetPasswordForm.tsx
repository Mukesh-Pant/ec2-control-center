import { useState } from 'react';
import { ArrowRight, ChevronLeft, Eye, EyeOff, Lock } from 'lucide-react';
import * as Auth from '@/lib/auth';
import { OtpInput } from '../OtpInput';
import type { ViewProps } from '../types';

export function ResetPasswordForm({ email, goTo }: ViewProps) {
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.join('');
    if (c.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await Auth.confirmForgotPassword(email, c, password);
      goTo('signin');
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
        Set a new password
      </div>
      <h1 className="login-h">Almost there.</h1>
      <p className="login-lead">
        Enter the code we sent to <strong style={{ color: '#fff' }}>{email}</strong> and choose a
        new password.
      </p>

      <form className="login-form" onSubmit={submit} noValidate>
        <OtpInput value={code} onChange={setCode} disabled={loading} autoFocus />

        <div className="lf-field">
          <label htmlFor="reset-password">New password</label>
          <div className="lf-input">
            <Lock size={15} />
            <input
              id="reset-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="lf-eye"
              onClick={() => setShowPw((s) => !s)}
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {error && <div className="lf-error">{error}</div>}

        <button type="submit" className="lf-submit" disabled={loading}>
          {loading ? (
            <span className="lf-spinner" />
          ) : (
            <>
              Update password
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      <div className="lf-otp-foot" style={{ marginTop: 24 }}>
        <button type="button" onClick={() => goTo('forgot')}>
          <ChevronLeft size={13} />
          Back
        </button>
      </div>
    </>
  );
}
