// src/pages/app/labs/LabRow.tsx
import React, { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { ChevronRight } from 'lucide-react';
import type { Lab } from '@/types/api';
import { getRole } from '@/lib/auth';
import {
  useLabMutation,
  useDeleteLab,
  useLabPaymentView,
  useLabKeypair,
  useLabWindowsPassword,
} from '@/lib/queries/labs';

interface Props {
  lab: Lab;
  isExpanded: boolean;
  onToggle: (labId: string) => void;
  accountName?: string;
}

function statusBadge(status: Lab['status']) {
  switch (status) {
    case 'pending_approval': return <Badge tone="warn" dot>Pending Approval</Badge>;
    case 'provisioning':     return <Badge tone="accent" dot>Provisioning</Badge>;
    case 'running':          return <Badge tone="ok" dot>Running</Badge>;
    case 'stopped':          return <Badge tone="muted" dot>Stopped</Badge>;
    case 'terminated':       return <Badge tone="muted">Terminated</Badge>;
    case 'rejected':         return <Badge tone="err">Rejected</Badge>;
  }
}

function formatExpiry(expiresAt?: string) {
  if (!expiresAt) return <span style={{ color: 'var(--ink-4)' }}>—</span>;
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  const label = days < 0 ? 'Expired' : days === 0 ? 'Today' : `${days}d`;
  const color = ms < 0 ? 'var(--red-2)' : days <= 7 ? 'var(--amber-2)' : 'var(--green-2)';
  return <span style={{ color, fontWeight: 600 }}>{label}</span>;
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

function downloadBlob(filename: string, content: string, mimeType = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ExpandPanel({ lab }: { lab: Lab }) {
  const role = getRole();
  const isAdmin = role === 'admin';
  const labMut = useLabMutation();
  const deleteMut = useDeleteLab();
  const paymentViewMut = useLabPaymentView();
  const keypairMut = useLabKeypair();
  const winPassMut = useLabWindowsPassword();
  const [winPassword, setWinPassword] = useState('');
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [mutError, setMutError] = useState('');
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null);

  const viewPayment = async () => {
    setMutError('');
    try {
      const res = await paymentViewMut.mutateAsync(lab.labId);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to load payment.');
    }
  };

  const approveLab = async () => {
    setMutError('');
    setPendingAction('approve');
    try {
      await labMut.mutateAsync({ action: 'approve', labId: lab.labId });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const rejectLab = async () => {
    setMutError('');
    setPendingAction('reject');
    try {
      await labMut.mutateAsync({ action: 'reject', labId: lab.labId });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const downloadKeypair = async () => {
    setMutError('');
    try {
      const res = await keypairMut.mutateAsync(lab.labId);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to download keypair.');
    }
  };

  const getWindowsPassword = async () => {
    setMutError('');
    try {
      const res = await winPassMut.mutateAsync(lab.labId);
      setWinPassword(res.password ?? '');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to get password.');
    }
  };

  const terminateLab = async () => {
    setMutError('');
    try {
      await deleteMut.mutateAsync(lab.labId);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Termination failed.');
      setConfirmTerminate(false);
    }
  };

  const downloadRdp = () => {
    const rdp = [
      'full address:s:' + (lab.publicIp ?? ''),
      'username:s:Administrator',
      'authentication level:i:0',
    ].join('\r\n');
    downloadBlob(`${lab.labName}.rdp`, rdp, 'application/x-rdp');
  };

  const infoRows: [string, React.ReactNode][] = [
    ['Lab ID',        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>{lab.labId}</span>],
    ['Instance ID',   lab.instanceId || '—'],
    ['Public IP',     lab.publicIp   || '—'],
    ['Elastic IP',    lab.allocationId ? `${lab.publicIp ?? '—'} (${lab.allocationId})` : '—'],
    ['Platform',      lab.platform === 'ubuntu' ? 'Linux (Ubuntu)' : 'Windows'],
    ['Instance Type', lab.instanceType],
    ['Storage',       `${lab.storageGb} GB`],
    ['Est. Cost',     lab.estimatedCost != null ? `$${lab.estimatedCost.toFixed(2)}` : '—'],
    ['Expires',       formatExpiry(lab.expiresAt)],
    ...(isAdmin ? [['Submitted By', lab.userEmail] as [string, React.ReactNode]] : []),
  ];

  return (
    <div style={{ padding: '16px var(--pad)', background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
      {/* Lab info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 13, marginBottom: 16 }}>
        {infoRows.map(([k, v]) => (
          <React.Fragment key={k}>
            <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{k}</span>
            <span>{v}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Status-dependent zone */}
      {lab.status === 'running' && (
        <div>
          {lab.platform === 'ubuntu' ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>SSH command</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--surface)', padding: '6px 10px', borderRadius: 'var(--r)', border: '1px solid var(--line)', flex: 1 }}>
                  {`ssh -i keypair.pem ubuntu@${lab.publicIp ?? '<ip>'}`}
                </code>
                <Button size="xs" variant="ghost" onClick={() => copyToClipboard(`ssh -i keypair.pem ubuntu@${lab.publicIp ?? ''}`)}>Copy</Button>
              </div>
              <div style={{ marginTop: 8 }}>
                <Button size="xs" variant="ghost" icon="Download" onClick={() => void downloadKeypair()} disabled={keypairMut.isPending}>
                  {keypairMut.isPending ? 'Loading…' : 'Download keypair (.pem)'}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>Connect via RDP to {lab.publicIp ?? '—'} as Administrator</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="xs" variant="ghost" icon="Download" onClick={downloadRdp}>Download .rdp file</Button>
                <Button size="xs" variant="ghost" onClick={() => void getWindowsPassword()} disabled={winPassMut.isPending}>
                  {winPassMut.isPending ? 'Fetching…' : 'Get Windows password'}
                </Button>
              </div>
              {winPassword && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--surface)', padding: '6px 10px', borderRadius: 'var(--r)', border: '1px solid var(--line)' }}>
                    {winPassword}
                  </code>
                  <Button size="xs" variant="ghost" onClick={() => copyToClipboard(winPassword)}>Copy</Button>
                </div>
              )}
            </div>
          )}
          {isAdmin && !confirmTerminate && (
            <Button size="xs" variant="danger" onClick={() => setConfirmTerminate(true)}>Terminate lab</Button>
          )}
          {isAdmin && confirmTerminate && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Terminate this lab?</span>
              <Button size="xs" variant="danger" onClick={() => void terminateLab()} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? 'Terminating…' : 'Yes, terminate'}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmTerminate(false)}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      {lab.status === 'provisioning' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            ⚙ Provisioning your lab — auto-refreshing every 15 s…
          </div>
          {isAdmin && (
            <div style={{ marginTop: 10 }}>
              {!confirmTerminate
                ? <Button size="xs" variant="danger" onClick={() => setConfirmTerminate(true)}>Terminate</Button>
                : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Button size="xs" variant="danger" onClick={() => void terminateLab()} disabled={deleteMut.isPending}>
                      {deleteMut.isPending ? 'Terminating…' : 'Yes, terminate'}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setConfirmTerminate(false)}>Cancel</Button>
                  </div>
                )
              }
            </div>
          )}
        </div>
      )}

      {lab.status === 'pending_approval' && (
        <div>
          {isAdmin ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button size="xs" variant="ghost" onClick={() => void viewPayment()} disabled={paymentViewMut.isPending}>
                {paymentViewMut.isPending ? 'Loading…' : 'View payment screenshot'}
              </Button>
              <Button size="xs" variant="accent" onClick={() => void approveLab()} disabled={pendingAction !== null}>
                {pendingAction === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              <Button size="xs" variant="danger" onClick={() => void rejectLab()} disabled={pendingAction !== null}>
                {pendingAction === 'reject' ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Awaiting admin approval — you'll be notified when it's ready.</div>
          )}
        </div>
      )}

      {mutError && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{mutError}</div>
      )}
    </div>
  );
}

const SHORT_ID_LEN = 8;

export function LabRow({ lab, isExpanded, onToggle, accountName }: Props) {
  return (
    <>
      <tr
        onClick={() => onToggle(lab.labId)}
        style={{ cursor: 'pointer' }}
        className={isExpanded ? 'tbl-row-active' : ''}
      >
        <td style={{ width: 32, paddingRight: 0 }}>
          <ChevronRight
            size={14}
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s',
              color: 'var(--ink-3)',
            }}
          />
        </td>
        <td style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>{lab.labId.slice(0, SHORT_ID_LEN)}</td>
        <td>{lab.platform === 'ubuntu' ? 'Linux' : 'Windows'}</td>
        <td style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>{lab.instanceType}</td>
        <td>{statusBadge(lab.status)}</td>
        <td style={{ fontSize: 12, color: 'var(--ink-2)' }}>{accountName ?? lab.accountId}</td>
        <td>{formatExpiry(lab.expiresAt)}</td>
        <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{lab.userEmail}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--line)' }}>
            <ExpandPanel lab={lab} />
          </td>
        </tr>
      )}
    </>
  );
}
