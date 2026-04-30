import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { USERS } from '@/features/app/mockData';

export default function UsersScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        sub="Manage user roles and per-account access permissions."
        actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>}
      />

      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Account access</th>
              <th>Change role</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((u) => (
              <tr key={u.email}>
                <td className="strong">{u.email}</td>
                <td><Badge tone={u.role === 'admin' ? 'accent' : 'muted'}>{u.role}</Badge></td>
                <td><Badge tone="ok" dot>{u.status}</Badge></td>
                <td style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--f-mono)' }}>{u.access}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      className="inp"
                      style={{ height: 30, fontSize: 12, width: 180 }}
                      defaultValue={u.role}
                    >
                      <option value="admin">Admin (full access)</option>
                      <option value="operator">Operator (start/stop)</option>
                      <option value="viewer">Viewer (read-only)</option>
                    </select>
                    <Button size="xs" variant="accent">Apply</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
