import { useState } from 'react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { useUsers, useUserMutation } from '@/lib/queries/users';
import { useAccounts } from '@/lib/queries/accounts';
import type { UserRecord } from '@/types/api';

function roleFromGroups(groups: string[]): 'admin' | 'operator' | 'viewer' | 'none' {
  if (groups.includes('admins'))    return 'admin';
  if (groups.includes('operators')) return 'operator';
  if (groups.includes('viewers'))   return 'viewer';
  return 'none';
}

const roleTone: Record<string, 'accent' | 'ok' | 'muted' | 'warn'> = {
  admin: 'accent', operator: 'ok', viewer: 'muted', none: 'warn',
};

function UserRow({ u, accounts }: { u: UserRecord; accounts: { accountId: string; accountName: string }[] }) {
  const mut = useUserMutation();
  const role = roleFromGroups(u.groups);
  const [selected, setSelected]           = useState<string>(role);
  const [grantAcct, setGrantAcct]         = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState('');
  const [mutError, setMutError]           = useState('');

  const applyRole = async () => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'setrole', email: u.email, role: selected });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to update role.');
    }
  };

  const grantAccount = async () => {
    if (!grantAcct) return;
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'grantaccount', email: u.email, accountId: grantAcct, accessLevel: 'operator' });
      setGrantAcct('');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to grant account.');
    }
  };

  const revokeAccount = async (accountId: string) => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'revokeaccount', email: u.email, accountId });
      setConfirmRevoke('');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to revoke account.');
    }
  };

  return (
    <tr>
      <td className="strong">{u.email}</td>
      <td><Badge tone={roleTone[role] ?? 'muted'}>{role}</Badge></td>
      <td><Badge tone={u.status === 'CONFIRMED' ? 'ok' : 'muted'} dot>{u.status}</Badge></td>
      <td style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--f-mono)' }}>
        {u.accounts.length === 0
          ? 'None'
          : u.accounts.map((a) => `${a.accountId} · ${a.accessLevel.toUpperCase()}`).join(', ')}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select className="inp" style={{ height: 30, fontSize: 12, width: 180 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="admin">Admin (full access)</option>
            <option value="operator">Operator (start/stop)</option>
            <option value="viewer">Viewer (read-only)</option>
            <option value="none">None (pending)</option>
          </select>
          <Button size="xs" variant="accent" onClick={() => void applyRole()} disabled={mut.isPending || selected === role}>Apply</Button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <select className="inp" style={{ height: 28, fontSize: 12, width: 180 }} value={grantAcct} onChange={(e) => setGrantAcct(e.target.value)}>
            <option value="">Grant account…</option>
            {accounts
              .filter((a) => !u.accounts.find((ua) => ua.accountId === a.accountId))
              .map((a) => <option key={a.accountId} value={a.accountId}>{a.accountName}</option>)}
          </select>
          <Button size="xs" variant="ghost" icon="Plus" onClick={() => void grantAccount()} disabled={!grantAcct || mut.isPending}>Grant</Button>
        </div>
        {u.accounts.map((ua) =>
          confirmRevoke === ua.accountId ? (
            <div key={ua.accountId} style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Revoke {ua.accountId}?</span>
              <Button size="xs" variant="danger" onClick={() => void revokeAccount(ua.accountId)} disabled={mut.isPending}>Yes</Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmRevoke('')}>No</Button>
            </div>
          ) : (
            <div key={ua.accountId} style={{ marginTop: 4 }}>
              <Button size="xs" variant="ghost" icon="Minus" onClick={() => setConfirmRevoke(ua.accountId)}>
                Revoke {ua.accountId}
              </Button>
            </div>
          )
        )}
        {mutError && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>{mutError}</div>
        )}
      </td>
    </tr>
  );
}

export default function UsersScreen() {
  const { data: userData, isLoading, error } = useUsers();
  const { data: acctData } = useAccounts();
  const users    = userData?.users ?? [];
  const accounts = (acctData?.accounts ?? []).map((a) => ({ accountId: a.accountId, accountName: a.accountName }));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        sub="Manage user roles and per-account access permissions."
      />

      {isLoading && <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading users…</div>}
      {error    && <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load users.</div>}

      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Account access</th>
              <th>Change role / Grant</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => <UserRow key={u.email} u={u} accounts={accounts} />)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
