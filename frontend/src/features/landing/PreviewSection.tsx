import {
  LayoutGrid,
  Server,
  HardDriveUpload,
  Receipt,
  Activity,
  ScrollText,
  Briefcase,
  Building2,
} from 'lucide-react';

const SIDEBAR_ITEMS = [
  { icon: <LayoutGrid size={14} />, label: 'Dashboard', on: true },
  { icon: <Server size={14} />, label: 'Instances' },
  { icon: <HardDriveUpload size={14} />, label: 'Backups' },
  { icon: <Receipt size={14} />, label: 'Billing' },
  { icon: <Activity size={14} />, label: 'Analytics' },
  { icon: <ScrollText size={14} />, label: 'Audit Log' },
  { icon: <Briefcase size={14} />, label: 'Vendors' },
  { icon: <Building2 size={14} />, label: 'Accounts' },
];

const STATS = [
  { l: 'Total', v: '12', d: '+2 today', dColor: undefined },
  { l: 'Running', v: '9', d: '75% active', dColor: undefined },
  { l: 'Stopped', v: '3', d: 'idle', dColor: 'rgba(232,238,255,.4)' as const },
  { l: 'MTD', v: '$1,847', d: '-29% MoM', dColor: undefined },
];

export function PreviewSection() {
  return (
    <section className="preview-section reveal" id="preview">
      <div className="section-eyebrow" style={{ display: 'block' }}>
        The dashboard, up close
      </div>
      <h2 style={{ margin: '0 auto', maxWidth: 780 }}>
        <span className="grad">Designed like a Bugatti dashboard.</span> Engineered like a flight
        deck.
      </h2>

      <div className="preview-frame">
        <div className="preview-glow" />
        <div className="preview-card">
          <div className="preview-bar">
            <div className="tlights">
              <span />
              <span />
              <span />
            </div>
            <div className="url">app.onecloudutopia.com / dashboard</div>
          </div>

          <div className="preview-body">
            <div className="preview-sb">
              {SIDEBAR_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={`preview-sb-item${item.on ? ' on' : ''}`}
                >
                  <span className="pi-ico">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>

            <div className="preview-main">
              <div className="preview-h">Dashboard</div>
              <div className="preview-sub">
                Real-time fleet overview · 2 accounts · updated continuously
              </div>

              <div className="preview-stats">
                {STATS.map((s) => (
                  <div key={s.l} className="preview-stat">
                    <div className="preview-stat-l">{s.l}</div>
                    <div className="preview-stat-v">{s.v}</div>
                    <div className="preview-stat-d" style={s.dColor ? { color: s.dColor } : undefined}>
                      {s.d}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  height: 240,
                  borderRadius: 10,
                  background:
                    'linear-gradient(180deg, rgba(59,127,255,.08), rgba(59,127,255,.02))',
                  border: '1px solid rgba(110,163,255,.12)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <svg
                  viewBox="0 0 600 240"
                  preserveAspectRatio="none"
                  style={{ width: '100%', height: '100%' }}
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="lgPv" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#3b7fff" stopOpacity=".4" />
                      <stop offset="100%" stopColor="#3b7fff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,180 C60,160 100,120 150,130 C200,140 240,100 290,90 C340,80 380,110 430,100 C480,90 520,60 600,50 L600,240 L0,240 Z"
                    fill="url(#lgPv)"
                  />
                  <path
                    d="M0,180 C60,160 100,120 150,130 C200,140 240,100 290,90 C340,80 380,110 430,100 C480,90 520,60 600,50"
                    fill="none"
                    stroke="#3b7fff"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
