import { useState } from 'react';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import * as Auth from '@/lib/auth';
import { OtpInput } from '../OtpInput';
import type { ViewProps } from '../types';

export function VerifyEmailForm({ email, goTo }: ViewProps) {
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const verify = async (codeStr?: string) => {
    const c = codeStr ?? code.join('');
    if (c.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await Auth.confirmSignup(email, c);
      goTo('signin');
    } catch (err) {
      setError(Auth.friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    setInfo('');
    setResending(true);
    try {
      await Auth.resendConfirmationCode(email);
      setInfo('A new code has been sent.');
    } catch (err) {
      setError(Auth.friendlyAuthError(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <div className="login-eyebrow">
        <span className="pulse" />
        Verify your email
      </div>
      <h1 className="login-h">Verify it&rsquo;s you.</h1>
      <p className="login-lead">
        We sent a 6-digit code to{' '}
        <strong style={{ color: '#fff' }}>{email || 'your inbox'}</strong>. The code expires in
        5 minutes.
      </p>

      <OtpInput
        value={code}
        onChange={setCode}
        onComplete={verify}
        disabled={loading}
        autoFocus
      />

      {error && <div className="lf-error">{error}</div>}
      {info && <div className="lf-success">{info}</div>}

      <button
        type="button"
        className="lf-submit"
        disabled={loading || code.some((d) => !d)}
        onClick={() => verify()}
      >
        {loading ? (
          <span className="lf-spinner" />
        ) : (
          <>
            Verify &amp; sign in
            <ArrowRight size={15} />
          </>
        )}
      </button>

      <div className="lf-otp-foot">
        <button type="button" onClick={() => goTo('signin')}>
          <ChevronLeft size={13} />
          Back to sign in
        </button>
        <button type="button" onClick={resend} disabled={resending}>
          {resending ? 'Sending…' : 'Resend code'}
        </button>
      </div>
    </>
  );
}
