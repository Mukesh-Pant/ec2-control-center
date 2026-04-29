import { useEffect, useRef } from 'react';

const SPARK_BARS = [40, 55, 42, 68, 75, 58, 72, 85, 68, 90, 78, 95, 82];

const ROWS = [
  { n: 'api-gateway-prod', m: 'i-076355d8 · t3.medium', s: 'live' },
  { n: 'analytics-worker', m: 'i-3ebdbd9c · m6i.xlarge', s: 'live' },
  { n: 'batch-render-eu', m: 'i-0875bff1 · c6i.large', s: 'stop' },
] as const;

/**
 * Right-pane 3D dashboard preview. Reacts to the global mouse position
 * by updating --rx / --ry CSS vars, which the .lv-main transform reads.
 */
export function LoginVisual() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handler = (e: MouseEvent) => {
      const r = stage.getBoundingClientRect();
      const cx = (e.clientX - r.left) / r.width - 0.5;
      const cy = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty('--rx', `${cy * -6}deg`);
      stage.style.setProperty('--ry', `${cx * 6}deg`);
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  return (
    <div className="login-visual" ref={stageRef}>
      <div className="lv-orb" />
      <div className="lv-card lv-main">
        <div className="lv-bar">
          <span className="lv-dot live" />
          <span className="lv-dot" />
          <span className="lv-dot" />
          <span className="lv-title">Fleet · live</span>
          <span className="lv-tag">ap-south-1</span>
        </div>
        <div className="lv-stat-row">
          <div className="lv-stat">
            <div className="l">Running</div>
            <div className="v">12</div>
          </div>
          <div className="lv-stat">
            <div className="l">MTD</div>
            <div className="v">$1,847</div>
          </div>
          <div className="lv-stat">
            <div className="l">Uptime</div>
            <div className="v">99.97%</div>
          </div>
        </div>
        <div className="lv-rows">
          {ROWS.map((r) => (
            <div className="lv-row" key={r.n}>
              <div>
                <div className="lv-row-n">{r.n}</div>
                <div className="lv-row-m">{r.m}</div>
              </div>
              <span className={`lv-pill ${r.s}`}>
                {r.s === 'live' ? (
                  <>
                    <span className="lv-pill-dot" />
                    live
                  </>
                ) : (
                  'stopped'
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="lv-spark">
          {SPARK_BARS.map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      <div className="lv-card lv-float-1">
        <div className="lv-bar">
          <span className="lv-dot" style={{ background: '#10b981' }} />
          <span className="lv-title">Audit · 14:15</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(232,238,255,.85)', lineHeight: 1.5 }}>
          <strong style={{ color: '#fff' }}>kandelmahesh</strong> started{' '}
          <span style={{ fontFamily: 'var(--f-mono)', color: '#6ea3ff' }}>Navigator_Web</span>
        </div>
      </div>

      <div className="lv-card lv-float-2">
        <div className="lv-bar">
          <span className="lv-dot live" />
          <span className="lv-title">Cost · 30d</span>
        </div>
        <div
          style={{
            fontFamily: 'var(--f-display)',
            fontSize: 24,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-.02em',
          }}
        >
          $1,847
        </div>
        <div style={{ fontSize: 10.5, color: '#10b981', marginTop: 2, fontWeight: 600 }}>
          ↓ 29% MoM
        </div>
      </div>
    </div>
  );
}
