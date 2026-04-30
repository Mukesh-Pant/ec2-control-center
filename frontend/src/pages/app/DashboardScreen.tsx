import { useNavigate } from 'react-router-dom';
import { Button, Card, Icon, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { INSTANCES } from '@/features/app/mockData';

interface QuickAction {
  id: string;
  icon: string;
  tone: 'blue' | 'teal' | 'amber' | 'forest' | 'violet' | 'rose';
  ti: string;
  sub: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'instances', icon: 'Server',          tone: 'blue',   ti: 'Instances',  sub: 'Start, stop & inspect' },
  { id: 'servers',   icon: 'Monitor',         tone: 'teal',   ti: 'My Servers', sub: 'Provision lab servers' },
  { id: 'billing',   icon: 'Receipt',         tone: 'amber',  ti: 'Billing',    sub: 'Cost & usage estimates' },
  { id: 'backups',   icon: 'HardDriveUpload', tone: 'forest', ti: 'Backups',    sub: 'Snapshots & restores' },
  { id: 'audit',     icon: 'ScrollText',      tone: 'violet', ti: 'Audit Log',  sub: 'Full action history' },
  { id: 'analytics', icon: 'Activity',        tone: 'rose',   ti: 'Analytics',  sub: 'Usage & fleet health' },
];

export default function DashboardScreen() {
  const navigate = useNavigate();
  const inst = INSTANCES;
  const running = inst.filter((i) => i.state === 'running').length;
  const stopped = inst.filter((i) => i.state === 'stopped').length;
  const cost = inst.reduce((s, i) => s + i.cost, 0);
  const runningPct = inst.length === 0 ? 0 : Math.round((running / inst.length) * 100);
  const hourly = inst.length === 0 ? 0 : cost / inst.length / 30;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fleet overview"
        title="Dashboard"
        sub="Real-time fleet overview across every linked AWS account. Updated continuously."
        actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>}
      />

      <div className="stats">
        <Stat label="Total instances" icon="Server" value={inst.length} meta="across 2 accounts" />
        <Stat label="Running now" icon="Play" value={running} meta={`${runningPct}% of fleet active`} delta="+1" />
        <Stat label="Stopped" icon="Square" value={stopped} meta="idle · no cost accruing" />
        <Stat label="Est. monthly cost" icon="DollarSign" value={`$${cost.toFixed(2)}`} unit="USD" meta="running fleet projection" />
      </div>

      <div className="grid-2">
        <Card
          title="Fleet · Quick Control"
          subtitle={`${inst.length} instances · ${running} running · $${hourly.toFixed(4)} /hr accumulated`}
          pad={false}
          action={
            <Button variant="ghost" size="sm" iconRight="ArrowUpRight" onClick={() => navigate('/app/instances')}>
              View all
            </Button>
          }
        >
          {inst.map((i) => (
            <div className="fleet-row" key={i.id}>
              <div>
                <div className="fleet-name">{i.name}</div>
                <div className="fleet-meta">{i.account} · {i.region} · {i.type}</div>
              </div>
              <StatusBadge state={i.state} />
              <div className="fleet-actions">
                <Button variant="ok" size="xs" icon="Play">Start</Button>
                <Button variant="danger" size="xs" icon="Square">Stop</Button>
              </div>
              <Button variant="ghost" size="xs" icon="ChevronRight" aria-label="Open instance" />
            </div>
          ))}
        </Card>

        <Card title="Quick actions" subtitle="Jump to the most-used workflows" pad={false}>
          <div className="qa-grid">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.id}
                className="qa"
                data-tone={qa.tone}
                onClick={() => navigate(`/app/${qa.id}`)}
                type="button"
              >
                <span className="qa-glow" />
                <div className="qa-ico"><Icon name={qa.icon} size={20} /></div>
                <div className="qa-ti">{qa.ti}</div>
                <div className="qa-sub">{qa.sub}</div>
                <span className="qa-arrow"><Icon name="ArrowUpRight" size={14} /></span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
