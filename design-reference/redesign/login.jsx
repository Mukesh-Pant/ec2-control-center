/* global React, Icon */

function LoginPage({ onLogin, onBack }) {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [step, setStep] = React.useState('signin'); // signin | mfa
  const [code, setCode] = React.useState(['','','','','','']);
  const codeRefs = React.useRef([]);

  const submit = (e) => {
    e?.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep('mfa');
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    }, 900);
  };

  const verify = () => {
    setLoading(true);
    setTimeout(() => onLogin(), 700);
  };

  const setDigit = (idx, val) => {
    const v = val.replace(/\D/g, '').slice(0, 1);
    const next = [...code];
    next[idx] = v;
    setCode(next);
    if (v && idx < 5) codeRefs.current[idx+1]?.focus();
    if (next.every(d => d) && next.join('').length === 6) setTimeout(verify, 200);
  };

  const onKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) codeRefs.current[idx-1]?.focus();
  };

  // pointer parallax for the preview card
  React.useEffect(() => {
    const stage = document.querySelector('.login-visual');
    if (!stage) return;
    const handler = (e) => {
      const r = stage.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width - 0.5;
      const cy = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty('--rx', (cy * -6) + 'deg');
      stage.style.setProperty('--ry', (cx * 6) + 'deg');
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  return (
    <div className="login-page">
      {/* Animated grid + orbs */}
      <div className="login-bg">
        <div className="login-grid" />
        <div className="login-orb a" />
        <div className="login-orb b" />
        <div className="login-orb c" />
        <div className="login-noise" />
      </div>

      {/* Top nav */}
      <nav className="login-nav">
        <a className="login-back" onClick={onBack}>
          <span className="login-mark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6">
              <rect x="3" y="3" width="18" height="7" rx="1.5" />
              <rect x="3" y="14" width="18" height="7" rx="1.5" />
            </svg>
          </span>
          One Cloud Utopia
        </a>
        <div className="login-nav-r">
          <span className="login-nav-q">New here?</span>
          <a className="login-nav-link">Request access <Icon name="ArrowUpRight" size={13} /></a>
        </div>
      </nav>

      <div className="login-shell">
        {/* Form pane */}
        <div className="login-form-pane">
          <div className="login-form-wrap">
            <div className="login-eyebrow">
              <span className="pulse" />
              {step === 'signin' ? 'Secure access · OAuth 2.0 + MFA' : 'Two-factor authentication'}
            </div>

            {step === 'signin' ? (
              <>
                <h1 className="login-h">Welcome back.</h1>
                <p className="login-lead">Sign in to your control plane and continue managing your fleet.</p>

                <form className="login-form" onSubmit={submit}>
                  <div className="lf-field">
                    <label>Work email</label>
                    <div className="lf-input">
                      <Icon name="Mail" size={15} />
                      <input
                        type="email"
                        autoFocus
                        autoComplete="email"
                        placeholder="you@onecloudutopia.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="lf-field">
                    <div className="lf-label-row">
                      <label>Password</label>
                      <a className="lf-help">Forgot password?</a>
                    </div>
                    <div className="lf-input">
                      <Icon name="Lock" size={15} />
                      <input
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                      />
                      <button type="button" className="lf-eye" onClick={() => setShowPw(s => !s)} tabIndex={-1}>
                        <Icon name={showPw ? 'EyeOff' : 'Eye'} size={14} />
                      </button>
                    </div>
                  </div>

                  <label className="lf-check">
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                    <span className="lf-check-box"><Icon name="Check" size={11} /></span>
                    <span>Keep me signed in for 30 days</span>
                  </label>

                  <button type="submit" className={`lf-submit ${loading ? 'loading' : ''}`} disabled={loading}>
                    {loading ? <span className="lf-spinner" /> : <>Continue <Icon name="ArrowRight" size={15} /></>}
                  </button>
                </form>

                <div className="lf-divider"><span>or sign in with</span></div>

                <div className="lf-sso">
                  <button className="lf-sso-btn"><GoogleGlyph /><span>Google</span></button>
                  <button className="lf-sso-btn"><AwsGlyph /><span>AWS SSO</span></button>
                  <button className="lf-sso-btn"><Icon name="KeyRound" size={15} /><span>Passkey</span></button>
                </div>
              </>
            ) : (
              <>
                <h1 className="login-h">Verify it's you.</h1>
                <p className="login-lead">We sent a 6-digit code to <strong style={{color:'#fff'}}>{email || 'your authenticator'}</strong>. The code expires in 5 minutes.</p>

                <div className="lf-otp-row">
                  {code.map((d, i) => (
                    <input
                      key={i}
                      ref={el => codeRefs.current[i] = el}
                      className="lf-otp"
                      inputMode="numeric"
                      maxLength={1}
                      value={d}
                      onChange={e => setDigit(i, e.target.value)}
                      onKeyDown={e => onKeyDown(i, e)}
                    />
                  ))}
                </div>

                <button className={`lf-submit ${loading ? 'loading' : ''}`} disabled={loading || code.some(d => !d)} onClick={verify}>
                  {loading ? <span className="lf-spinner" /> : <>Verify & sign in <Icon name="ArrowRight" size={15} /></>}
                </button>

                <div className="lf-otp-foot">
                  <a onClick={() => setStep('signin')}><Icon name="ChevronLeft" size={13} />Back to sign in</a>
                  <a>Resend code in 0:42</a>
                </div>
              </>
            )}

            <div className="login-foot">
              Protected by <strong>SOC 2</strong> · <strong>ISO 27001</strong> · <strong>HIPAA</strong>-aligned controls
            </div>
          </div>
        </div>

        {/* Visual pane */}
        <div className="login-visual-pane">
          <div className="login-visual">
            <div className="lv-orb" />
            <div className="lv-card lv-main">
              <div className="lv-bar">
                <span className="lv-dot live" /><span className="lv-dot" /><span className="lv-dot" />
                <span className="lv-title">Fleet · live</span>
                <span className="lv-tag">ap-south-1</span>
              </div>
              <div className="lv-stat-row">
                <div className="lv-stat"><div className="l">Running</div><div className="v">12</div></div>
                <div className="lv-stat"><div className="l">MTD</div><div className="v">$1,847</div></div>
                <div className="lv-stat"><div className="l">Uptime</div><div className="v">99.97%</div></div>
              </div>
              <div className="lv-rows">
                {[
                  {n:'api-gateway-prod',  m:'i-076355d8 · t3.medium',  s:'live'},
                  {n:'analytics-worker',   m:'i-3ebdbd9c · m6i.xlarge', s:'live'},
                  {n:'batch-render-eu',   m:'i-0875bff1 · c6i.large',  s:'stop'},
                ].map(r => (
                  <div key={r.n} className="lv-row">
                    <div>
                      <div className="lv-row-n">{r.n}</div>
                      <div className="lv-row-m">{r.m}</div>
                    </div>
                    <span className={`lv-pill ${r.s}`}>{r.s === 'live' ? <><span className="lv-pill-dot" />live</> : 'stopped'}</span>
                  </div>
                ))}
              </div>
              <div className="lv-spark">
                {[40,55,42,68,75,58,72,85,68,90,78,95,82].map((h,i) => <span key={i} style={{height:h+'%'}} />)}
              </div>
            </div>

            <div className="lv-card lv-float-1">
              <div className="lv-bar"><span className="lv-dot" style={{background:'#10b981'}} /><span className="lv-title">Audit · 14:15</span></div>
              <div style={{fontSize:11.5, color:'rgba(232,238,255,.85)', lineHeight:1.5}}>
                <strong style={{color:'#fff'}}>kandelmahesh</strong> started <span style={{fontFamily:'var(--f-mono)', color:'#6ea3ff'}}>Navigator_Web</span>
              </div>
            </div>
            <div className="lv-card lv-float-2">
              <div className="lv-bar"><span className="lv-dot live" /><span className="lv-title">Cost · 30d</span></div>
              <div style={{fontFamily:'var(--f-display)', fontSize:24, fontWeight:700, color:'#fff', letterSpacing:'-.02em'}}>$1,847</div>
              <div style={{fontSize:10.5, color:'#10b981', marginTop:2, fontWeight:600}}>↓ 29% MoM</div>
            </div>
          </div>

          <div className="login-quote">
            <div className="lq-mark">"</div>
            <p>One Cloud Utopia replaced six bookmarks and three IAM tabs with a single, calm dashboard. Our on-call team sleeps better.</p>
            <div className="lq-author">
              <div className="lq-avatar">SR</div>
              <div>
                <div className="lq-name">Sushant Regmi</div>
                <div className="lq-role">Head of Platform · Cloudmandap</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function AwsGlyph() {
  return (
    <svg width="18" height="11" viewBox="0 0 18 11" fill="none">
      <path fill="#FF9900" d="M14.2 8.8c-1.7 1.3-4.2 2-6.4 2C4.7 10.8 2 9.6 0 7.7c-.2-.2 0-.4.2-.3 2.2 1.3 5 2 7.8 2 1.9 0 4-.4 5.9-1.2.3-.1.5.2.3.6z"/>
      <path fill="#FF9900" d="M14.9 8c-.2-.3-1.5-.1-2.1 0-.2 0-.2-.1-.1-.3.9-.6 2.4-.5 2.6-.2.2.3-.1 1.7-1 2.4-.1.1-.3 0-.2-.1.2-.5.6-1.4.4-1.7z"/>
      <path fill="#fff" d="M3.5 4.6V3.8c0-.1.1-.2.2-.2h3.5c.1 0 .2.1.2.2v.7c0 .1-.1.2-.2.4l-1.8 2.6c.7 0 1.4.1 2 .4.1.1.2.2.2.3v.8c0 .1-.1.2-.2.2-1-.5-2.4-.6-3.6 0-.1 0-.2 0-.2-.2v-.8c0-.1 0-.3.1-.5l2.1-3h-1.8c-.2 0-.3-.1-.3-.2zM10.6 9.4h-1c-.1 0-.2-.1-.2-.2V3.7c0-.1.1-.2.2-.2h.9c.1 0 .2.1.2.2v.7c.3-.7.7-1 1.4-1 .7 0 1 .3 1.3 1 .3-.7.8-1 1.4-1 .5 0 1 .2 1.2.6.3.5.3 1.2.3 1.8v3.4c0 .1-.1.2-.2.2h-1c-.1 0-.2-.1-.2-.2V6.2c0-.3 0-1 0-1.2-.1-.4-.3-.5-.6-.5-.3 0-.5.2-.6.4-.1.3-.1.7-.1 1v3c0 .1-.1.2-.2.2h-1c-.1 0-.2-.1-.2-.2V6.2c0-.6 0-1.5-.7-1.5-.7 0-.7.9-.7 1.5v3c0 .1-.1.2-.2.2z"/>
    </svg>
  );
}

Object.assign(window, { LoginPage });
