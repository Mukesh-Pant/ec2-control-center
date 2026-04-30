import { Button, Card, PageHeader, Stat } from '@/components/ui';
import { INSTANCES } from '@/features/app/mockData';

export default function BillingScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Intelligence"
        title="Billing & Cost"
        sub="Transparent, per-account cost accounting with monthly projections."
        actions={<Button icon="Download" variant="ghost" size="sm">Export CSV</Button>}
      />

      <div className="stats">
        <Stat label="Month to date" icon="DollarSign" value="$29.95" unit="USD" meta="projected end-of-month" />
        <Stat label="Running rate" icon="Activity" value="$0.0416" unit="/hr" meta="1 running instance" />
        <Stat label="Last month" icon="Calendar" value="$42.18" unit="USD" meta="delta" delta="-29%" />
        <Stat label="Forecast · 30d" icon="TrendingUp" value="$31.00" unit="est." meta="based on last 7 days" />
      </div>

      <Card title="Cost by instance" subtitle="Current month" pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Instance</th>
              <th>Account</th>
              <th>Type</th>
              <th className="num">Hours</th>
              <th className="num">Rate</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {INSTANCES.map((i) => (
              <tr key={i.id}>
                <td className="strong">{i.name}</td>
                <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{i.account}</td>
                <td className="mono">{i.type}</td>
                <td className="num mono">{i.state === 'running' ? '720' : '0'}</td>
                <td className="num mono">${(i.cost / 720).toFixed(4)}</td>
                <td className="num strong">${i.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
