import { Button, Card, PageHeader, Stat } from '@/components/ui';
import { useDailyBilling } from '@/lib/queries/audit';

export default function BillingScreen() {
  const { data, isLoading, refetch } = useDailyBilling(30);
  const days = data?.days ?? [];

  const totalCost   = days.reduce((s, d) => s + d.estimatedCostUsd, 0);
  const totalHours  = days.reduce((s, d) => s + d.runningHours, 0);
  const hourlyRate  = totalHours > 0 ? totalCost / totalHours : 0;
  const activeInst  = new Set(days.filter((d) => d.runningHours > 0).map((d) => d.instanceId)).size;

  const byInstance = days.reduce<Record<string, { name: string; type: string; region: string; accountId: string; hours: number; cost: number }>>((acc, d) => {
    const e = acc[d.instanceId] ?? { name: d.instanceName, type: d.instanceType, region: d.region, accountId: d.accountId, hours: 0, cost: 0 };
    e.hours += d.runningHours;
    e.cost  += d.estimatedCostUsd;
    acc[d.instanceId] = e;
    return acc;
  }, {});
  const rows = Object.entries(byInstance).sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Intelligence"
        title="Billing & Cost"
        sub="Transparent, per-account cost accounting with monthly projections."
        actions={<Button icon="RotateCw" variant="ghost" size="sm" onClick={() => void refetch()}>Refresh</Button>}
      />

      <div className="stats">
        <Stat label="Last 30 days"    icon="DollarSign"   value={isLoading ? '—' : `$${totalCost.toFixed(2)}`}   unit="USD"  meta="estimated cost" />
        <Stat label="Avg hourly rate"  icon="Activity"     value={isLoading ? '—' : `$${hourlyRate.toFixed(4)}`}  unit="/hr"  meta="across running instances" />
        <Stat label="Active instances" icon="Server"       value={isLoading ? '—' : activeInst}                              meta="had run time in period" />
        <Stat label="Total run hours"  icon="Clock"        value={isLoading ? '—' : Math.round(totalHours)}       unit="hrs"  meta="combined fleet hours" />
      </div>

      <Card title="Cost by instance" subtitle="Last 30 days · estimated from run hours" pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Instance</th>
              <th>Account</th>
              <th>Type</th>
              <th className="num">Run hours</th>
              <th className="num">Avg rate</th>
              <th className="num">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>No cost data for the last 30 days.</td></tr>
            )}
            {rows.map(([id, r]) => (
              <tr key={id}>
                <td className="strong">{r.name}</td>
                <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{r.accountId}</td>
                <td className="mono">{r.type}</td>
                <td className="num mono">{r.hours.toFixed(1)}</td>
                <td className="num mono">${r.hours > 0 ? (r.cost / r.hours).toFixed(4) : '0.0000'}</td>
                <td className="num strong">${r.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
