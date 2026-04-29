import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail, KeyRound } from 'lucide-react';
import * as Auth from '@/lib/auth';
import { useAuth } from '@/stores/auth';
import { GoogleGlyph, AwsGlyph } from '../glyphs';
import type { ViewProps } from '../types';

export function SignInForm({ email, setEmail, goTo, onAuthenticated }: ViewProps) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const syncFromStorage = useAuth((s) => s.syncFromStorage);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await Auth.login(email, password);
      if (result.type === 'NEW_PASSWORD_REQUIRED') {
        goTo('newpass');
      } else {
        syncFromStorage();
        onAuthenticated();
      }
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
        Secure access · OAuth 2.0 + MFA
      </div>
      <h1 className="login-h">Welcome back.</h1>
      <p className="login-lead">
        Sign in to your control plane and continue managing your fleet.
      </p>

      <form className="login-form" onSubmit={submit} noValidate>
        <div className="lf-field">
          <label htmlFor="signin-email">Work email</label>
          <div className="lf-input">
            <Mail size={15} />
            <input
              id="signin-email"
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
          <div className="lf-label-row">
            <label htmlFor="signin-password">Password</label>
            <button
              type="button"
              className="lf-help"
              onClick={() => goTo('forgot')}
              tabIndex={0}
            >
              Forgot password?
            </button>
          </div>
          <div className="lf-input">
            <Lock size={15} />
            <input
              id="signin-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••••"
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

        <label className="lf-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span className="lf-check-box">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span>Keep me signed in for 30 days</span>
        </label>

        {error && <div className="lf-error">{error}</div>}

        <button
          type="submit"
          className="lf-submit"
          disabled={loading}
        >
          {loading ? (
            <span className="lf-spinner" />
          ) : (
            <>
              Continue
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      <div className="lf-divider">
        <span>or sign in with</span>
      </div>

      <div className="lf-sso">
        <button className="lf-sso-btn" type="button" disabled title="Coming soon">
          <GoogleGlyph />
          <span>Google</span>
        </button>
        <button className="lf-sso-btn" type="button" disabled title="Coming soon">
          <AwsGlyph />
          <span>AWS SSO</span>
        </button>
        <button className="lf-sso-btn" type="button" disabled title="Coming soon">
          <KeyRound size={15} />
          <span>Passkey</span>
        </button>
      </div>

      <div className="login-foot">
        Protected by <strong>SOC 2</strong> · <strong>ISO 27001</strong> ·{' '}
        <strong>HIPAA</strong>-aligned controls
      </div>

      <div style={{ marginTop: 18, fontSize: 13, color: 'rgba(232,238,255,.55)' }}>
        New here?{' '}
        <button
          type="button"
          onClick={() => goTo('signup')}
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            color: '#6ea3ff',
            cursor: 'pointer',
            fontWeight: 600,
            font: 'inherit',
          }}
        >
          Create an account
        </button>
      </div>
    </>
  );
}
