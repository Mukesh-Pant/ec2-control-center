import { Button, Card, Donut, PageHeader, Stat } from '@/components/ui';
import { INSTANCES } from '@/features/app/mockData';

export default function AnalyticsScreen() {
  const inst = INSTANCES;
  const running = inst.filter((i) => i.state === 'running').length;
  const stopped = inst.filter((i) => i.state === 'stopped').length;
  const types = Array.from(new Set(inst.map((i) => i.type)));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        sub="Usage patterns, fleet health, and activity intelligence."
        actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>}
      />

      <div className="stats">
        <Stat label="Total actions · 30d" icon="Activity" value="90" meta="all logged events" />
        <Stat label="Server starts" icon="Play" value="25" meta="power-on events" />
        <Stat label="Server stops" icon="Square" value="40" meta="shutdown events" />
        <Stat label="Monthly projection" icon="DollarSign" value="$29.95" unit="USD" meta="running fleet estimate" />
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--gap)' }}>
        <Card title="Fleet health" subtitle={`${running} / ${inst.length} running`} pad={false}>
          <div className="chart-row">
            <Donut running={running} total={inst.length} />
            <div className="legend" style={{ flex: 1 }}>
              <div className="legend-row">
                <div className="legend-l">
                  <span className="legend-swatch" style={{ background: 'var(--accent)' }} /> Running
                </div>
                <div className="legend-n">{running}</div>
              </div>
              <div className="legend-row">
                <div className="legend-l">
                  <span className="legend-swatch" style={{ background: 'var(--line-2)' }} /> Stopped
                </div>
                <div className="legend-n">{stopped}</div>
              </div>
              <div className="legend-row">
                <div className="legend-l">
                  <span className="legend-swatch" style={{ background: 'var(--ink-5)' }} /> Other
                </div>
                <div className="legend-n">0</div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Cost by account" subtitle="Current month · estimated" pad={false}>
          <div style={{ padding: 'var(--pad)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Central Account</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>$29.95</span>
            </div>
            <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '100%', background: 'var(--accent)', borderRadius: 3 }} />
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Mukesh-Testing</span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>$0.00</span>
            </div>
            <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '0%', background: 'var(--accent)', borderRadius: 3 }} />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Instance type breakdown" subtitle={`${types.length} types observed`} pad={false}>
        <div style={{ padding: 'var(--pad)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {types.map((t) => {
            const count = inst.filter((i) => i.type === t).length;
            return (
              <div
                key={t}
                style={{
                  padding: '14px 18px',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  background: 'var(--bg)',
                }}
              >
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink)' }}>{t}</div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: '.18em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                    marginTop: 4,
                  }}
                >
                  {count} {count === 1 ? 'instance' : 'instances'}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
