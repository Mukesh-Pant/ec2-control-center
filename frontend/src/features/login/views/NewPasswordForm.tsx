import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import * as Auth from '@/lib/auth';
import { useAuth } from '@/stores/auth';
import type { ViewProps } from '../types';

/**
 * Shown when Cognito returns NEW_PASSWORD_REQUIRED challenge — typically
 * for admin-created accounts on first login.
 */
export function NewPasswordForm({ goTo, onAuthenticated }: ViewProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const syncFromStorage = useAuth((s) => s.syncFromStorage);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await Auth.completeNewPassword(password);
      syncFromStorage();
      onAuthenticated();
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
        First-time setup
      </div>
      <h1 className="login-h">Set your password.</h1>
      <p className="login-lead">
        Welcome to One Cloud Utopia. Choose a strong password to finish activating your account.
      </p>

      <form className="login-form" onSubmit={submit} noValidate>
        <div className="lf-field">
          <label htmlFor="newpass-password">New password</label>
          <div className="lf-input">
            <Lock size={15} />
            <input
              id="newpass-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
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
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div className="lf-field">
          <label htmlFor="newpass-confirm">Confirm password</label>
          <div className="lf-input">
            <Lock size={15} />
            <input
              id="newpass-confirm"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repeat password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
              Activate &amp; continue
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      <div className="lf-otp-foot" style={{ marginTop: 24 }}>
        <button type="button" onClick={() => goTo('signin')}>
          Cancel
        </button>
      </div>
    </>
  );
}
