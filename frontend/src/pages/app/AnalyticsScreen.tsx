import { Button, Card, Donut, PageHeader, Stat } from '@/components/ui';
import { useInstances } from '@/lib/queries/ec2';

export default function AnalyticsScreen() {
  const { data, isLoading, refetch } = useInstances();
  const inst = data?.instances ?? [];

  const running  = inst.filter((i) => i.state === 'running').length;
  const stopped  = inst.filter((i) => i.state === 'stopped').length;
  const types    = Array.from(new Set(inst.map((i) => i.instanceType)));
  const accounts = Array.from(
    inst.reduce<Map<string, { accountId: string; name: string; count: number }>>(
      (m, i) => {
        const e = m.get(i.accountId) ?? { accountId: i.accountId, name: i.accountName, count: 0 };
        e.count++;
        m.set(i.accountId, e);
        return m;
      },
      new Map(),
    ).values(),
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        sub="Usage patterns, fleet health, and activity intelligence."
        actions={<Button icon="RotateCw" variant="ghost" size="sm" onClick={() => void refetch()}>Refresh</Button>}
      />

      <div className="stats">
        <Stat label="Total instances"   icon="Server"     value={isLoading ? '—' : inst.length} meta="across all accounts" />
        <Stat label="Running"           icon="Play"        value={isLoading ? '—' : running}     meta="active right now" />
        <Stat label="Stopped"           icon="Square"      value={isLoading ? '—' : stopped}     meta="idle" />
        <Stat label="Accounts"          icon="Building2"   value={isLoading ? '—' : accounts.length} meta="linked AWS accounts" />
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--gap)' }}>
        <Card title="Fleet health" subtitle={`${running} / ${inst.length} running`} pad={false}>
          <div className="chart-row">
            <Donut running={running} total={inst.length} />
            <div className="legend" style={{ flex: 1 }}>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{ background: 'var(--accent)' }} /> Running</div>
                <div className="legend-n">{running}</div>
              </div>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{ background: 'var(--line-2)' }} /> Stopped</div>
                <div className="legend-n">{stopped}</div>
              </div>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{ background: 'var(--ink-5)' }} /> Other</div>
                <div className="legend-n">{inst.length - running - stopped}</div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Instances by account" subtitle="Current fleet distribution" pad={false}>
          <div style={{ padding: 'var(--pad)' }}>
            {accounts.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No data yet.</div>
            )}
            {accounts.map((a) => {
              const pct = inst.length === 0 ? 0 : Math.round((a.count / inst.length) * 100);
              return (
                <div key={a.accountId} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{a.name}</span>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                      {a.count} instance{a.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="Instance type breakdown" subtitle={`${types.length} types observed`} pad={false}>
        <div style={{ padding: 'var(--pad)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {types.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No instances to analyze yet.</div>
          )}
          {types.map((t) => {
            const count = inst.filter((i) => i.instanceType === t).length;
            return (
              <div key={t} style={{ padding: '14px 18px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg)' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink)' }}>{t}</div>
                <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 4 }}>
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
