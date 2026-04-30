import { useNavigate } from 'react-router-dom';
import { Button, Card, Icon, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { useInstances, useStartInstance, useStopInstance } from '@/lib/queries/ec2';
import { getRole } from '@/lib/auth';

interface QuickAction {
  id: string; icon: string;
  tone: 'blue' | 'teal' | 'amber' | 'forest' | 'violet' | 'rose';
  ti: string; sub: string;
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
  const { data, isLoading, refetch } = useInstances();
  const startMut = useStartInstance();
  const stopMut  = useStopInstance();
  const canControl = getRole() !== 'viewer';

  const inst     = data?.instances ?? [];
  const running  = inst.filter((i) => i.state === 'running').length;
  const stopped  = inst.filter((i) => i.state === 'stopped').length;
  const runPct   = inst.length === 0 ? 0 : Math.round((running / inst.length) * 100);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fleet overview"
        title="Dashboard"
        sub="Real-time fleet overview across every linked AWS account. Updated continuously."
        actions={
          <Button icon="RotateCw" variant="ghost" size="sm" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="stats">
        <Stat label="Total instances" icon="Server" value={isLoading ? '—' : inst.length} meta="across all accounts" />
        <Stat label="Running now"     icon="Play"   value={isLoading ? '—' : running} meta={`${runPct}% of fleet active`} />
        <Stat label="Stopped"         icon="Square" value={isLoading ? '—' : stopped} meta="idle · no cost accruing" />
        <Stat label="Accounts linked" icon="Building2" value={isLoading ? '—' : new Set(inst.map((i) => i.accountId)).size} meta="active AWS accounts" />
      </div>

      <div className="grid-2">
        <Card
          title="Fleet · Quick Control"
          subtitle={isLoading ? 'Loading…' : `${inst.length} instances · ${running} running`}
          pad={false}
          action={
            <Button variant="ghost" size="sm" iconRight="ArrowUpRight" onClick={() => navigate('/app/instances')}>
              View all
            </Button>
          }
        >
          {isLoading && (
            <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading instances…</div>
          )}
          {!isLoading && inst.length === 0 && (
            <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>No instances found.</div>
          )}
          {inst.map((i) => (
            <div className="fleet-row" key={i.instanceId}>
              <div>
                <div className="fleet-name">{i.name}</div>
                <div className="fleet-meta">{i.accountName} · {i.region} · {i.instanceType}</div>
              </div>
              <StatusBadge state={i.state} />
              {canControl && (
                <div className="fleet-actions">
                  <Button
                    variant="ok" size="xs" icon="Play"
                    disabled={i.state === 'running' || startMut.isPending}
                    onClick={() => startMut.mutate({ instanceId: i.instanceId, instanceName: i.name, instanceType: i.instanceType, accountId: i.accountId, region: i.region })}
                  >
                    Start
                  </Button>
                  <Button
                    variant="danger" size="xs" icon="Square"
                    disabled={i.state === 'stopped' || stopMut.isPending}
                    onClick={() => stopMut.mutate({ instanceId: i.instanceId, instanceName: i.name, instanceType: i.instanceType, accountId: i.accountId, region: i.region })}
                  >
                    Stop
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="xs" icon="ChevronRight" aria-label="Open instance" onClick={() => navigate('/app/instances')} />
            </div>
          ))}
        </Card>

        <Card title="Quick actions" subtitle="Jump to the most-used workflows" pad={false}>
          <div className="qa-grid">
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa.id} className="qa" data-tone={qa.tone} onClick={() => navigate(`/app/${qa.id}`)} type="button">
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
