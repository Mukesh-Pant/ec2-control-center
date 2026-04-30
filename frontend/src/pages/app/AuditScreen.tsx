import { useState } from 'react';
import { Button, Card, Icon, PageHeader } from '@/components/ui';
import { useAuditLog } from '@/lib/queries/audit';
import { useAccounts } from '@/lib/queries/accounts';
import { getRole } from '@/lib/auth';
import type { AuditFilters } from '@/lib/queries/audit';

const ACTIONS = ['start', 'stop', 'auto-stop', 'terminate', 'account-linked'];

export default function AuditScreen() {
  const isAdmin = getRole() === 'admin';

  const [filters, setFilters] = useState<AuditFilters>({ limit: 50 });
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [search, setSearch]         = useState('');
  const [userEmail, setUserEmail]   = useState('');
  const [action, setAction]         = useState('');
  const [accountId, setAccountId]   = useState('');

  const { data, isLoading, error } = useAuditLog(filters);
  const { data: acctData }         = useAccounts();
  const accounts = acctData?.accounts ?? [];

  const applyFilters = () => {
    setCursorStack([]);
    setFilters({ limit: 50, instanceId: search || undefined, userEmail: isAdmin ? userEmail || undefined : undefined, action: action || undefined, accountId: accountId || undefined });
  };

  const clearFilters = () => {
    setSearch('');
    setUserEmail('');
    setAction('');
    setAccountId('');
    setCursorStack([]);
    setFilters({ limit: 50 });
  };

  const loadNext = () => {
    if (!data?.lastKey) return;
    const nextKey = JSON.stringify(data.lastKey);
    setCursorStack((s) => [...s, nextKey]);
    setFilters((f) => ({ ...f, lastKey: nextKey }));
  };

  const loadPrev = () => {
    const stack = [...cursorStack];
    stack.pop();
    const prevKey = stack[stack.length - 1];
    setCursorStack(stack);
    setFilters((f) => ({ ...f, lastKey: prevKey }));
  };

  const items = data?.items ?? [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="History"
        title="Audit Log"
        sub="Complete history — every action, every user, every server."
        actions={<Button icon="RotateCw" variant="ghost" size="sm" onClick={applyFilters}>Refresh</Button>}
      />

      <Card pad={false}>
        <div className="filter-bar">
          <div className="field">
            <label className="field-label">Instance</label>
            <div className="inp-group">
              <span className="inp-ico"><Icon name="Search" size={14} /></span>
              <input className="inp" placeholder="Instance ID or name…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
            </div>
          </div>
          {isAdmin && (
            <div className="field">
              <label className="field-label">User</label>
              <input className="inp" placeholder="User email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
            </div>
          )}
          <div className="field">
            <label className="field-label">Action</label>
            <select className="inp" value={action} onChange={(e) => { setAction(e.target.value); }}>
              <option value="">All actions</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Account</label>
            <select className="inp" value={accountId} onChange={(e) => { setAccountId(e.target.value); }}>
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.accountName}</option>)}
            </select>
          </div>
          <div className="field" style={{ gap: 6, justifyContent: 'flex-end' }}>
            <Button variant="accent" size="sm" icon="Search" onClick={applyFilters}>Filter</Button>
            <Button variant="ghost" size="sm" icon="X" onClick={clearFilters}>Clear</Button>
          </div>
        </div>

        {error && (
          <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load audit log.</div>
        )}

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
            {isLoading && (
              <tr><td colSpan={7} style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>No audit entries found.</td></tr>
            )}
            {items.map((r, idx) => (
              <tr key={`${r.instanceId}-${idx}`}>
                <td className="mono">{r.timestamp}</td>
                <td><span className={`action-chip ${r.action}`}>{r.action}</span></td>
                <td>
                  <div className="strong" style={{ color: 'var(--ink)' }}>{r.instanceName}</div>
                  <div className="mono" style={{ color: 'var(--ink-4)' }}>{r.instanceId}</div>
                </td>
                <td className="mono">{r.instanceType}</td>
                <td className="mono">{r.accountId}</td>
                <td className="mono">{r.region}</td>
                <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{r.userEmail}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ padding: '16px var(--pad)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-3)' }}>
          <span>{items.length} entries loaded</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="xs" icon="ChevronLeft" disabled={cursorStack.length === 0} onClick={loadPrev}>Prev</Button>
            <Button variant="ghost" size="xs" iconRight="ChevronRight" disabled={!data?.lastKey} onClick={loadNext}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
