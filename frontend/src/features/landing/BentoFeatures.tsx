import { Server, DollarSign, ScrollText, Sparkles, ShieldCheck, Briefcase } from 'lucide-react';
import type { ReactNode } from 'react';

const ACCOUNT_ROWS = [
  'Central Account · 976792586566',
  'Mukesh-Testing · 196750375951',
  'Production-EU · 482910385771',
];

const COST_BARS = [40, 55, 42, 68, 75, 58, 72, 85, 68, 90, 78, 95, 82, 88, 72];

interface CellProps {
  span: 2 | 3;
  rowSpan?: 2;
  icon: ReactNode;
  title: string;
  desc: string;
  visual?: ReactNode;
}

function Cell({ span, rowSpan, icon, title, desc, visual }: CellProps) {
  const cls = ['bento-cell', `span-${span}`, rowSpan ? 'row-2' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="bento-ico">{icon}</div>
      <div className="bento-ti">{title}</div>
      <div className="bento-desc">{desc}</div>
      {visual && <div className="bento-visual">{visual}</div>}
    </div>
  );
}

export function BentoFeatures() {
  return (
    <section className="section reveal" id="features">
      <div className="section-eyebrow">Built for the long haul</div>
      <h2>
        <span className="grad">A control plane that respects</span> your time, your fleet, and
        your wallet.
      </h2>
      <p className="section-lead">
        Six capabilities, one canvas. Every screen designed to surface signal — and bury the noise
        that AWS leaves behind.
      </p>

      <div className="bento">
        <Cell
          span={3}
          rowSpan={2}
          icon={<Server />}
          title="Multi-account fleet control"
          desc="Start, stop, and inspect instances across every linked AWS account from one screen. Cross-account IAM roles handle the auth — you handle the strategy."
          visual={
            <div style={{ display: 'grid', gap: 8 }}>
              {ACCOUNT_ROWS.map((a) => (
                <div
                  key={a}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(110,163,255,.05)',
                    border: '1px solid rgba(110,163,255,.12)',
                    borderRadius: 8,
                    fontSize: 11.5,
                    fontFamily: 'var(--f-mono)',
                    color: 'rgba(232,238,255,.7)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{a}</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      color: '#10b981',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '.05em',
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: '#10b981',
                        boxShadow: '0 0 8px #10b981',
                      }}
                    />
                    ENABLED
                  </span>
                </div>
              ))}
            </div>
          }
        />

        <Cell
          span={3}
          icon={<DollarSign />}
          title="Real-time cost intelligence"
          desc="Per-account, per-instance, per-hour. NPR / USD / multi-currency with live FX and forecast."
          visual={
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
              {COST_BARS.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    background: `linear-gradient(180deg, rgba(59,127,255,${0.4 + h / 200}), rgba(59,127,255,.1))`,
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              ))}
            </div>
          }
        />

        <Cell
          span={3}
          icon={<ScrollText />}
          title="Tamper-proof audit trail"
          desc="Every action — every user, every account, every server. Filter by any dimension. Export anywhere."
          visual={
            <div
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10.5,
                color: 'rgba(232,238,255,.6)',
                lineHeight: 1.7,
              }}
            >
              <div>
                <span style={{ color: '#10b981' }}>start</span> · Navigator_Web · 14:15
              </div>
              <div>
                <span style={{ color: '#ef4444' }}>stop</span> · api-prod-eu · 13:48
              </div>
              <div>
                <span style={{ color: '#10b981' }}>start</span> · batch-render · 12:03
              </div>
              <div style={{ color: 'rgba(232,238,255,.3)' }}>· · ·  90 events / 30d</div>
            </div>
          }
        />

        <Cell
          span={2}
          icon={<Sparkles />}
          title="Instant provisioning"
          desc="Templates with real ap-south-1 pricing."
        />
        <Cell
          span={2}
          icon={<ShieldCheck />}
          title="Granular RBAC"
          desc="Admin / operator / viewer per account."
        />
        <Cell
          span={2}
          icon={<Briefcase />}
          title="Vendor & customer ledger"
          desc="Renewals, payables, and contract value in one view."
        />
      </div>
    </section>
  );
}
