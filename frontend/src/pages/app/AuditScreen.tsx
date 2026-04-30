import { Button, Card, Icon, PageHeader } from '@/components/ui';
import { AUDIT } from '@/features/app/mockData';

export default function AuditScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="History"
        title="Audit Log"
        sub="Complete history — every action, every user, every server. Filterable by any dimension."
        actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>}
      />

      <Card pad={false}>
        <div className="filter-bar">
          <div className="field">
            <label className="field-label">Search</label>
            <div className="inp-group">
              <span className="inp-ico"><Icon name="Search" size={14} /></span>
              <input className="inp" placeholder="Instance ID or name…" />
            </div>
          </div>
          <div className="field">
            <label className="field-label">User</label>
            <input className="inp" placeholder="User email" />
          </div>
          <div className="field">
            <label className="field-label">Action</label>
            <select className="inp" defaultValue="all">
              <option value="all">All actions</option>
              <option value="start">Start</option>
              <option value="stop">Stop</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Account</label>
            <select className="inp" defaultValue="all">
              <option value="all">All accounts</option>
            </select>
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" icon="X">Clear</Button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Instance</th>
              <th>Type</th>
              <th>Account</th>
              <th>Region</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {AUDIT.map((r, i) => (
              <tr key={`${r.iid}-${i}`}>
                <td className="mono">{r.ts}</td>
                <td><span className={`action-chip ${r.action}`}>{r.action}</span></td>
                <td>
                  <div className="strong" style={{ color: 'var(--ink)' }}>{r.instance}</div>
                  <div className="mono" style={{ color: 'var(--ink-4)' }}>{r.iid}</div>
                </td>
                <td className="mono">{r.type}</td>
                <td className="mono">{r.account}</td>
                <td className="mono">{r.region}</td>
                <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{r.user}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            padding: '16px var(--pad)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--line)',
            fontSize: 12,
            color: 'var(--ink-3)',
          }}
        >
          <span>Page 1 of 5 · 50 loaded</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="xs" icon="ChevronLeft">Prev</Button>
            <Button variant="ghost" size="xs" iconRight="ChevronRight">Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
