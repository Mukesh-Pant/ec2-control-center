import React, { useState } from 'react';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { useInstances } from '@/lib/queries/ec2';
import { useBackupList, useBackupMutation } from '@/lib/queries/backup';
import { getRole } from '@/lib/auth';
import type { Instance, RecoveryPoint, BackupPlan } from '@/types/api';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  const gb = bytes / 1_073_741_824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`;
}

function friendlyCron(expr: string): string {
  const m = expr.match(/cron\((\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\)/);
  if (!m) return expr;
  const min  = m[1] ?? '0';
  const hour = m[2] ?? '0';
  const dom  = m[3] ?? '*';
  const dow  = m[5] ?? '?';
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
  if (dom === '1') return `Monthly (1st) at ${time}`;
  if (dow !== '?' && dow !== '*') return `Weekly (Sun) at ${time}`;
  return `Daily at ${time}`;
}

function buildCron(preset: string, hour: string, minute: string): string {
  if (preset === 'weekly')  return `cron(${minute} ${hour} ? * SUN *)`;
  if (preset === 'monthly') return `cron(${minute} ${hour} 1 * ? *)`;
  return `cron(${minute} ${hour} * * ? *)`;
}

interface RestoreFormProps {
  arn: string;
  instanceType: string;
  onConfirm: (arn: string, instanceType: string) => void;
  onCancel: () => void;
  isPending: boolean;
}
function RestoreForm({ arn, instanceType, onConfirm, onCancel, isPending }: RestoreFormProps) {
  const [type, setType] = useState(instanceType);
  return (
    <div style={{ padding: 16, background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Restore to new instance</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Instance type</label>
          <input className="inp" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. t3.micro" />
        </div>
        <Button variant="accent" size="sm" onClick={() => onConfirm(arn, type)} disabled={isPending || !type}>
          {isPending ? 'Restoring…' : 'Restore'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>
        A new EC2 instance will be created. The original instance is not affected.
      </div>
    </div>
  );
}

interface ScheduleFormProps {
  plan?: BackupPlan;
  onSave: (data: { preset: string; hour: string; minute: string; planId?: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}
function parseCron(expr: string): { preset: string; hour: string; minute: string } {
  const m = expr.match(/cron\((\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)/);
  if (!m) return { preset: 'daily', hour: '02', minute: '00' };
  const dom = m[3] ?? '*';
  const dow = m[5] ?? '?';
  const preset = dom === '1' ? 'monthly' : (dow !== '?' && dow !== '*') ? 'weekly' : 'daily';
  return {
    preset,
    hour:   (m[2] ?? '2').padStart(2, '0'),
    minute: (m[1] ?? '0').padStart(2, '0'),
  };
}

function ScheduleForm({ plan, onSave, onCancel, isPending }: ScheduleFormProps) {
  const init = plan ? parseCron(plan.scheduleExpression) : { preset: 'daily', hour: '02', minute: '00' };
  const [preset, setPreset] = useState(init.preset);
  const [hour, setHour]     = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  return (
    <div style={{ padding: 16, background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{plan ? 'Edit schedule' : 'Create backup schedule'}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field">
          <label className="field-label">Frequency</label>
          <select className="inp" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (Sunday)</option>
            <option value="monthly">Monthly (1st)</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Hour (UTC)</label>
          <select className="inp" value={hour} onChange={(e) => setHour(e.target.value)}>
            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Minute</label>
          <select className="inp" value={minute} onChange={(e) => setMinute(e.target.value)}>
            {['00', '15', '30', '45'].map((mm) => <option key={mm}>{mm}</option>)}
          </select>
        </div>
        <Button variant="accent" size="sm" onClick={() => onSave({ preset, hour, minute, planId: plan?.planId })} disabled={isPending}>
          {isPending ? 'Saving…' : plan ? 'Update' : 'Create'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function BackupsScreen() {
  const canWrite = getRole() !== 'viewer';
  const { data: instData, isLoading: instLoading } = useInstances();
  const instances = instData?.instances ?? [];

  const [selectedId, setSelectedId] = useState('');
  const selected: Instance | undefined = instances.find((i) => i.instanceId === selectedId);

  const { data, isLoading: backupLoading, error } = useBackupList(
    selected?.instanceId ?? '',
    selected?.accountId  ?? '',
    selected?.region     ?? '',
  );
  const mut = useBackupMutation(
    selected?.instanceId ?? '',
    selected?.accountId  ?? '',
    selected?.region     ?? '',
  );

  const rps   = data?.recoveryPoints ?? [];
  const plans = data?.backupPlans    ?? [];

  const [restoreArn, setRestoreArn]           = useState('');
  const [showSchedForm, setShowSchedForm]     = useState(false);
  const [editPlan, setEditPlan]               = useState<BackupPlan | undefined>(undefined);
  const [confirmDeleteArn, setConfirmDeleteArn]   = useState('');
  const [confirmDeletePlan, setConfirmDeletePlan] = useState('');
  const [mutError, setMutError]               = useState('');

  const doBackupNow = async () => {
    if (!selected) return;
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'createbackup', instanceId: selected.instanceId, accountId: selected.accountId, region: selected.region });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Backup failed.');
    }
  };

  const doRestore = async (arn: string, instanceType: string) => {
    if (!selected) return;
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'restore', recoveryPointArn: arn, instanceType, accountId: selected.accountId, region: selected.region });
      setRestoreArn('');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Restore failed.');
    }
  };

  const doSaveSchedule = async ({ preset, hour, minute, planId }: { preset: string; hour: string; minute: string; planId?: string }) => {
    if (!selected) return;
    setMutError('');
    try {
      const scheduleExpression = buildCron(preset, hour, minute);
      const action = planId ? 'updateschedule' : 'createschedule';
      await mut.mutateAsync({ action, planId, instanceId: selected.instanceId, accountId: selected.accountId, region: selected.region, scheduleExpression });
      setShowSchedForm(false);
      setEditPlan(undefined);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to save schedule.');
    }
  };

  const doDeleteRecovery = async (arn: string) => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'deleterecovery', recoveryPointArn: arn, accountId: selected?.accountId ?? '', region: selected?.region ?? '' });
      setConfirmDeleteArn('');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to delete recovery point.');
    }
  };

  const doDeleteSchedule = async (planId: string) => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'deleteschedule', planId, accountId: selected?.accountId ?? '', region: selected?.region ?? '' });
      setConfirmDeletePlan('');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to delete schedule.');
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Protection"
        title="Backups"
        sub="Snapshots and restores across your fleet. Select an instance to manage its backups."
        actions={
          canWrite && selected ? (
            <Button icon="Plus" variant="primary" size="sm" onClick={() => void doBackupNow()} disabled={mut.isPending}>
              {mut.isPending ? 'Working…' : 'Backup now'}
            </Button>
          ) : undefined
        }
      />

      {/* Instance selector */}
      <div style={{ marginBottom: 'var(--gap)' }}>
        <div className="field" style={{ maxWidth: 360 }}>
          <label className="field-label">Select instance</label>
          <select className="inp" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setRestoreArn(''); setShowSchedForm(false); setMutError(''); }}>
            <option value="">— choose an instance —</option>
            {instLoading && <option disabled>Loading…</option>}
            {instances.map((i) => (
              <option key={i.instanceId} value={i.instanceId}>{i.name} ({i.accountName} · {i.region})</option>
            ))}
          </select>
        </div>
      </div>

      {mutError && (
        <div style={{ marginBottom: 'var(--gap)', padding: '10px var(--pad)', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', color: 'var(--danger)', fontSize: 13 }}>
          {mutError}
        </div>
      )}

      {!selected && (
        <Card pad={false}>
          <EmptyState icon="HardDriveUpload" title="No instance selected" description="Choose an instance above to view its recovery points and backup schedules." />
        </Card>
      )}

      {selected && (
        <>
          {/* Recovery Points */}
          <div style={{ marginBottom: 'var(--gap)' }}>
            <Card title="Recovery Points" subtitle={`Snapshots for ${selected.name}`} pad={false}>
              {backupLoading && <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>}
              {error && <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load backup data.</div>}
              {!backupLoading && !error && rps.length === 0 && (
                <EmptyState icon="HardDriveUpload" title="No recovery points" description="Create your first manual snapshot or enable a backup schedule." />
              )}
              {rps.length > 0 && (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>ARN</th>
                      <th>Created</th>
                      <th>Status</th>
                      <th>Size</th>
                      {canWrite && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rps.map((rp: RecoveryPoint) => (
                      <React.Fragment key={rp.arn}>
                        <tr>
                          <td className="mono" style={{ fontSize: 11, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rp.arn}</td>
                          <td className="mono">{new Date(rp.creationDate).toLocaleString()}</td>
                          <td><span className="action-chip">{rp.status}</span></td>
                          <td className="mono">{formatBytes(rp.backupSizeBytes)}</td>
                          {canWrite && (
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <Button size="xs" variant="ghost" icon="RefreshCw" onClick={() => setRestoreArn(restoreArn === rp.arn ? '' : rp.arn)}>Restore</Button>
                                {confirmDeleteArn === rp.arn ? (
                                  <>
                                    <Button size="xs" variant="danger" onClick={() => void doDeleteRecovery(rp.arn)} disabled={mut.isPending}>Confirm</Button>
                                    <Button size="xs" variant="ghost" onClick={() => setConfirmDeleteArn('')}>Cancel</Button>
                                  </>
                                ) : (
                                  <Button size="xs" variant="danger" icon="Trash2" onClick={() => setConfirmDeleteArn(rp.arn)}>Delete</Button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                        {restoreArn === rp.arn && (
                          <tr>
                            <td colSpan={canWrite ? 5 : 4} style={{ padding: 0 }}>
                              <RestoreForm arn={rp.arn} instanceType={selected.instanceType} onConfirm={(a, t) => void doRestore(a, t)} onCancel={() => setRestoreArn('')} isPending={mut.isPending} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          {/* Backup Schedules */}
          <Card
            title="Backup Schedules"
            subtitle="Automated snapshot policies"
            pad={false}
            action={canWrite && !showSchedForm ? (
              <Button size="sm" variant="ghost" icon="Plus" onClick={() => { setShowSchedForm(true); setEditPlan(undefined); }}>New schedule</Button>
            ) : undefined}
          >
            {showSchedForm && !editPlan && (
              <ScheduleForm onSave={(d) => void doSaveSchedule(d)} onCancel={() => setShowSchedForm(false)} isPending={mut.isPending} />
            )}
            {!backupLoading && !error && plans.length === 0 && !showSchedForm && (
              <EmptyState icon="CalendarClock" title="No backup schedules" description="Create an automated backup policy to protect this instance." />
            )}
            {plans.length > 0 && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Schedule</th>
                    <th>Plan ID</th>
                    {canWrite && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p: BackupPlan) => (
                    <React.Fragment key={p.planId}>
                      <tr>
                        <td>{friendlyCron(p.scheduleExpression)}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{p.planId}</td>
                        {canWrite && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Button size="xs" variant="ghost" icon="Pencil" onClick={() => { setEditPlan(p); setShowSchedForm(true); }}>Edit</Button>
                              {confirmDeletePlan === p.planId ? (
                                <>
                                  <Button size="xs" variant="danger" onClick={() => void doDeleteSchedule(p.planId)} disabled={mut.isPending}>Confirm</Button>
                                  <Button size="xs" variant="ghost" onClick={() => setConfirmDeletePlan('')}>Cancel</Button>
                                </>
                              ) : (
                                <Button size="xs" variant="danger" icon="Trash2" onClick={() => setConfirmDeletePlan(p.planId)}>Delete</Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {editPlan?.planId === p.planId && showSchedForm && (
                        <tr>
                          <td colSpan={canWrite ? 3 : 2} style={{ padding: 0 }}>
                            <ScheduleForm plan={p} onSave={(d) => void doSaveSchedule(d)} onCancel={() => { setShowSchedForm(false); setEditPlan(undefined); }} isPending={mut.isPending} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
