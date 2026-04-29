/**
 * The 3D-floating dashboard mockup behind the hero copy.
 * Uses CSS perspective + rotateY/rotateX on `.hero-stage` and
 * the `float1` / `float2` keyframes for the side cards.
 */
const SPARK_BARS = [40, 55, 42, 68, 75, 58, 72, 85, 68, 90, 78, 95];
const COST_BARS = [35, 42, 28, 55, 48, 60, 52, 38, 65, 72, 58, 80];

export function HeroPreviewCard() {
  return (
    <div className="hero-stage">
      <div className="hero-orb" />
      <div className="hero-orb b" />

      <div className="hero-card main">
        <div className="hc-bar">
          <span className="hc-dot live" />
          <span className="hc-dot" />
          <span className="hc-dot" />
          <span className="hc-title">Fleet · live</span>
        </div>

        <div className="hc-stat-grid">
          <div className="hc-stat">
            <div className="hc-stat-l">Running</div>
            <div className="hc-stat-v">12</div>
            <div className="hc-stat-d">+2 today</div>
          </div>
          <div className="hc-stat">
            <div className="hc-stat-l">MTD spend</div>
            <div className="hc-stat-v">$1,847</div>
            <div className="hc-stat-d">-29% MoM</div>
          </div>
        </div>

        <div className="hc-row">
          <div>
            <div className="name">api-gateway-prod</div>
            <div className="meta">i-076355d8 · t3.medium</div>
          </div>
          <span className="hc-pill run">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
            live
          </span>
        </div>
        <div className="hc-row">
          <div>
            <div className="name">analytics-worker-01</div>
            <div className="meta">i-3ebdbd9c · m6i.xlarge</div>
          </div>
          <span className="hc-pill run">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
            live
          </span>
        </div>
        <div className="hc-row">
          <div>
            <div className="name">batch-render-eu</div>
            <div className="meta">i-0875bff1 · c6i.large</div>
          </div>
          <span className="hc-pill stop">stopped</span>
        </div>

        <div className="hc-spark">
          {SPARK_BARS.map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      <div className="hero-card float-1">
        <div className="hc-bar">
          <span className="hc-dot live" />
          <span className="hc-title">Cost · last 30d</span>
        </div>
        <div
          style={{
            fontFamily: 'var(--f-display)',
            fontSize: 32,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-.02em',
          }}
        >
          $1,847
        </div>
        <div style={{ fontSize: 11, color: 'rgba(232,238,255,.55)', marginTop: 4 }}>
          vs $2,612 last month
        </div>
        <div style={{ display: 'flex', gap: 2, marginTop: 8, height: 18 }}>
          {COST_BARS.map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                background: 'rgba(110,163,255,.4)',
                alignSelf: 'flex-end',
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      </div>

      <div className="hero-card float-2">
        <div className="hc-bar">
          <span className="hc-dot" style={{ background: '#10b981' }} />
          <span className="hc-title">Audit · just now</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(232,238,255,.85)', lineHeight: 1.5 }}>
          <strong style={{ color: '#fff' }}>kandelmahesh39</strong> started{' '}
          <span style={{ fontFamily: 'var(--f-mono)', color: '#6ea3ff' }}>Navigator_Web</span>
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'rgba(232,238,255,.45)',
            marginTop: 6,
            fontFamily: 'var(--f-mono)',
          }}
        >
          14:15:35 · ap-south-1
        </div>
      </div>
    </div>
  );
}
