import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ChevronLeft } from 'lucide-react';
import * as Auth from '@/lib/auth';
import type { ViewProps } from '../types';

export function SignUpForm({ email, setEmail, goTo }: ViewProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirm) {
      setError('All fields are required.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await Auth.signup(email, password);
      Auth.setPendingEmail(email);
      goTo('verify');
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
        Request access · self-signup
      </div>
      <h1 className="login-h">Create your account.</h1>
      <p className="login-lead">
        Set up your One Cloud Utopia profile in seconds. We'll email a 6-digit code to verify
        your address.
      </p>

      <form className="login-form" onSubmit={submit} noValidate>
        <div className="lf-field">
          <label htmlFor="signup-email">Work email</label>
          <div className="lf-input">
            <Mail size={15} />
            <input
              id="signup-email"
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

        <div className="lf-field">
          <label htmlFor="signup-password">Password</label>
          <div className="lf-input">
            <Lock size={15} />
            <input
              id="signup-password"
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
          {password && (
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginTop: 6,
                height: 4,
              }}
              aria-hidden="true"
            >
              {[0, 1, 2, 3].map((i) => {
                const filled = i < strength;
                const color =
                  strength <= 1 ? '#ef4444' : strength === 2 ? '#f59e0b' : '#10b981';
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      borderRadius: 2,
                      background: filled ? color : 'rgba(110,163,255,.12)',
                      transition: 'background .2s',
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="lf-field">
          <label htmlFor="signup-confirm">Confirm password</label>
          <div className="lf-input">
            <Lock size={15} />
            <input
              id="signup-confirm"
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
              Create account
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
