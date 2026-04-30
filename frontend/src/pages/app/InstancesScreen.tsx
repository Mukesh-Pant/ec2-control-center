import { Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import { ACCOUNTS, INSTANCES, type Instance } from '@/features/app/mockData';

export default function InstancesScreen() {
  const grouped = INSTANCES.reduce<Record<string, Instance[]>>((a, i) => {
    const list = a[i.account] ?? [];
    list.push(i);
    a[i.account] = list;
    return a;
  }, {});

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fleet"
        title="Instances"
        sub="Servers grouped by account — click any row to inspect and control."
        actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh all</Button>}
      />

      {Object.entries(grouped).map(([acct, rows]) => {
        const account = ACCOUNTS.find((a) => a.name === acct);
        return (
          <Card
            key={acct}
            title={acct}
            subtitle={account?.id}
            action={<Button variant="ghost" size="sm" icon="ExternalLink">Console</Button>}
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
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td className="strong">{i.name}</td>
                    <td className="mono">{i.id}</td>
                    <td className="mono">{i.type}</td>
                    <td><StatusBadge state={i.state} /></td>
                    <td className="mono">{i.region}</td>
                    <td className="mono">{i.ip}</td>
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
