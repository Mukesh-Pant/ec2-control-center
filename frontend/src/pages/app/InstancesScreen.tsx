import { Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import { useInstances, useStartInstance, useStopInstance } from '@/lib/queries/ec2';
import { getRole } from '@/lib/auth';
import type { Instance } from '@/types/api';

export default function InstancesScreen() {
  const { data, isLoading, error, refetch } = useInstances();
  const startMut = useStartInstance();
  const stopMut  = useStopInstance();
  const canControl = getRole() !== 'viewer';

  const inst = data?.instances ?? [];
  const grouped = inst.reduce<Record<string, Instance[]>>((acc, i) => {
    const key = i.accountId;
    const list = acc[key] ?? [];
    list.push(i);
    acc[key] = list;
    return acc;
  }, {});

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fleet"
        title="Instances"
        sub="Servers grouped by account — start, stop, and inspect from here."
        actions={<Button icon="RotateCw" variant="ghost" size="sm" onClick={() => void refetch()}>Refresh all</Button>}
      />

      {isLoading && (
        <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading instances…</div>
      )}

      {error && (
        <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>
          Failed to load instances. Check your connection and try refreshing.
        </div>
      )}

      {!isLoading && !error && inst.length === 0 && (
        <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>
          {data?.pendingApproval
            ? 'Your account is pending admin approval. Contact your administrator.'
            : data?.noAccountsAssigned
            ? 'No AWS accounts are assigned to your profile yet. Ask an admin to grant access.'
            : 'No instances found across your linked accounts.'}
        </div>
      )}

      {Object.entries(grouped).map(([acctId, rows]) => {
        const acctName = rows[0]?.accountName ?? acctId;
        return (
          <Card
            key={acctId}
            title={acctName}
            subtitle={acctId}
            pad={false}
            className="mb-gap"
          >
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Instance ID</th>
                  <th>Type</th>
                  <th>State</th>
                  <th>Region</th>
                  <th>Public IP</th>
                  {canControl && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.instanceId}>
                    <td className="strong">{i.name}</td>
                    <td className="mono">{i.instanceId}</td>
                    <td className="mono">{i.instanceType}</td>
                    <td><StatusBadge state={i.state} /></td>
                    <td className="mono">{i.region}</td>
                    <td className="mono">{i.publicIp || i.elasticIp || '—'}</td>
                    {canControl && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
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
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
