import { useState } from 'react';
import { Badge, Button, Icon, PageHeader } from '@/components/ui';
import { useAccounts, useAccountMutation } from '@/lib/queries/accounts';
import type { Account } from '@/types/api';

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const mut = useAccountMutation();
  const [accountId, setAccountId]     = useState('');
  const [accountName, setAccountName] = useState('');
  const [roleArn, setRoleArn]         = useState('');
  const [consoleArn, setConsoleArn]   = useState('');
  const [error, setError]             = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await mut.mutateAsync({ action: 'add', accountId, accountName, roleArn, consoleRoleArn: consoleArn });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add account.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 28, width: 480, maxWidth: '92vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Add AWS Account</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)' }}>
            <Icon name="X" size={16} />
          </button>
        </div>
        <form onSubmit={(e) => { void submit(e); }}>
          {[
            { id: 'acct-id',   label: 'Account ID',             val: accountId,   set: setAccountId,   ph: '123456789012' },
            { id: 'acct-name', label: 'Account name',           val: accountName, set: setAccountName, ph: 'My Team Account' },
            { id: 'role-arn',  label: 'Cross-account role ARN', val: roleArn,     set: setRoleArn,     ph: 'arn:aws:iam::123456789012:role/EC2Control…' },
            { id: 'cons-arn',  label: 'Console role ARN',       val: consoleArn,  set: setConsoleArn,  ph: 'arn:aws:iam::123456789012:role/EC2Control…' },
          ].map(({ id, label, val, set, ph }) => (
            <div key={id} className="field" style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor={id}>{label}</label>
              <input id={id} className="inp" value={val} onChange={(e) => set(e.target.value)} placeholder={ph} required />
            </div>
          ))}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" icon="Plus" disabled={mut.isPending}>
              {mut.isPending ? 'Adding…' : 'Add account'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AccountCard({ a }: { a: Account }) {
  const mut = useAccountMutation();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testResult, setTestResult]       = useState('');
  const [mutError, setMutError]           = useState('');

  const doTest = async () => {
    setTestResult('Testing…');
    try {
      const res = await mut.mutateAsync({ action: 'test', accountId: a.accountId });
      setTestResult(res.latencyMs != null ? `OK · ${res.latencyMs}ms` : 'OK');
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Failed');
    }
    setTimeout(() => setTestResult(''), 4000);
  };

  const doToggle = async () => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: a.enabled ? 'disable' : 'enable', accountId: a.accountId });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const doRemove = async () => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'remove', accountId: a.accountId });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to remove account.');
    }
  };

  return (
    <div className="card acct-card">
      <div className="acct-hd">
        <div>
          <div className="acct-name">
            {a.isCentral && <Icon name="Star" size={14} />}
            {a.accountName}
          </div>
          <div style={{ marginTop: 6 }}>
            <Badge tone={a.isCentral ? 'accent' : a.enabled ? 'ok' : 'muted'}>
              {a.isCentral ? 'Central' : a.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </div>
      </div>
      <div className="acct-meta-list">
        <div className="acct-meta-row">
          <span className="acct-meta-k">Account ID</span>
          <span className="acct-meta-v">{a.accountId}</span>
        </div>
        <div className="acct-meta-row">
          <span className="acct-meta-k">Cross-account role</span>
          <span className="acct-meta-v">{a.isCentral ? 'LOCAL (lambda credentials)' : a.roleArn}</span>
        </div>
      </div>
      {testResult && (
        <div style={{ padding: '6px var(--pad)', fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--f-mono)' }}>
          {testResult}
        </div>
      )}
      {mutError && (
        <div style={{ padding: '6px var(--pad)', fontSize: 12, color: 'var(--danger)' }}>
          {mutError}
        </div>
      )}
      {confirmRemove && (
        <div style={{ padding: '12px var(--pad)', background: 'var(--surface-2)', borderTop: '1px solid var(--line)', fontSize: 13 }}>
          <div style={{ marginBottom: 10, color: 'var(--ink-2)' }}>Remove this account? This cannot be undone.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="danger" size="xs" onClick={() => void doRemove()} disabled={mut.isPending}>Confirm remove</Button>
            <Button variant="ghost" size="xs" onClick={() => setConfirmRemove(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="acct-actions">
        <Button size="xs" variant="ghost" icon="Activity" onClick={() => void doTest()} disabled={mut.isPending}>Test</Button>
        {!a.isCentral && (
          <>
            <Button size="xs" variant="ghost" icon={a.enabled ? 'PauseCircle' : 'PlayCircle'} onClick={() => void doToggle()} disabled={mut.isPending}>
              {a.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button size="xs" variant="danger" icon="Trash2" onClick={() => setConfirmRemove(true)}>Remove</Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AccountsScreen() {
  const { data, isLoading, error } = useAccounts();
  const [showAdd, setShowAdd] = useState(false);
  const accounts = data?.accounts ?? [];

  return (
    <div className="page">
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}

      <PageHeader
        eyebrow="Administration"
        title="Accounts"
        sub="AWS accounts managed by this portal — each with a cross-account IAM role."
        actions={
          <Button icon="Plus" variant="primary" size="sm" onClick={() => setShowAdd(true)}>Add account</Button>
        }
      />

      <div className="info-banner">
        <Icon name="ShieldCheck" size={20} />
        <div>
          <div className="info-banner-ti">Access control</div>
          <div className="info-banner-body">
            <strong>Admin</strong> · full control — link/remove accounts, start/stop any instance.{' '}
            <strong>Operator</strong> · view and control assigned instances.{' '}
            <strong>Viewer</strong> · read-only.
          </div>
        </div>
      </div>

      {isLoading && <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading accounts…</div>}
      {error    && <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load accounts.</div>}

      <div className="grid-2">
        {accounts.map((a) => <AccountCard key={a.accountId} a={a} />)}
      </div>
    </div>
  );
}
