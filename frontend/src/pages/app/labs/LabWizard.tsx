// src/pages/app/labs/LabWizard.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { useAccounts } from '@/lib/queries/accounts';
import {
  useLabMutation,
  useLabPricing,
  useLabNetworkOptions,
  useLabPaymentUpload,
  type LabPricingParams,
} from '@/lib/queries/labs';
import { useLabTemplates } from '@/lib/queries/labSettings';

const REGION = 'ap-south-1';

const INSTANCE_GROUPS = [
  {
    label: 'Burstable',
    options: [
      { value: 't3.micro',  label: 't3.micro — 2 vCPU · 1 GB RAM · Burstable' },
      { value: 't3.small',  label: 't3.small — 2 vCPU · 2 GB RAM · Burstable' },
      { value: 't3.medium', label: 't3.medium — 2 vCPU · 4 GB RAM · Burstable' },
      { value: 't3.large',  label: 't3.large — 2 vCPU · 8 GB RAM · Burstable' },
    ],
  },
  {
    label: 'General Purpose',
    options: [
      { value: 'm5.large',  label: 'm5.large — 2 vCPU · 8 GB RAM · General Purpose' },
      { value: 'm5.xlarge', label: 'm5.xlarge — 4 vCPU · 16 GB RAM · General Purpose' },
    ],
  },
  {
    label: 'Compute Optimized',
    options: [
      { value: 'c5.large',  label: 'c5.large — 2 vCPU · 4 GB RAM · Compute Optimized' },
      { value: 'c5.xlarge', label: 'c5.xlarge — 4 vCPU · 8 GB RAM · Compute Optimized' },
    ],
  },
  {
    label: 'Memory Optimized',
    options: [
      { value: 'r5.large',  label: 'r5.large — 2 vCPU · 16 GB RAM · Memory Optimized' },
      { value: 'r5.xlarge', label: 'r5.xlarge — 4 vCPU · 32 GB RAM · Memory Optimized' },
    ],
  },
];


interface Props {
  onClose: () => void;
  onSubmitted: () => void;
}

export function LabWizard({ onClose, onSubmitted }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 state
  const [platform, setPlatform]         = useState<'ubuntu' | 'windows'>('ubuntu');
  const [instanceType, setInstanceType] = useState('t3.micro');
  const [storageGb, setStorageGb]       = useState(20);
  const [hoursPerDay, setHoursPerDay]   = useState(8);
  const [months, setMonths]             = useState(1);
  const [accountId, setAccountId]       = useState('');
  const [elasticIp, setElasticIp]       = useState(true);
  const [labName, setLabName]           = useState('');

  // Step 3 state
  const [paymentKey, setPaymentKey]           = useState('');
  const [uploadingPayment, setUploadingPayment] = useState(false);
  const [uploadError, setUploadError]         = useState('');
  const [submitError, setSubmitError]         = useState('');

  const { data: acctData } = useAccounts();
  const accounts = (acctData?.accounts ?? []).filter((a) => a.enabled && !a.isCentral);
  const { data: templatesData } = useLabTemplates();
  const templates = templatesData?.templates ?? [];

  const networkQuery = useLabNetworkOptions(accountId, REGION);
  const networkOpts  = networkQuery.data;

  const subnetId = networkOpts?.subnets[0]?.subnetId ?? '';
  const defaultSg = networkOpts?.securityGroups.find((sg) => sg.groupName === 'default')
    ?? networkOpts?.securityGroups[0];
  const securityGroupIds = defaultSg ? [defaultSg.groupId] : [];

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0]?.accountId ?? '');
    }
  }, [accounts, accountId]);

  useEffect(() => {
    if (platform === 'windows') setStorageGb((s) => Math.max(s, 35));
  }, [platform]);

  const totalDays = months * 30;
  const durationHours = hoursPerDay * totalDays;

  const pricingParams: LabPricingParams | null = step === 2 ? {
    instanceType,
    region: REGION,
    os: platform,
    storageGb,
    elasticIp,
    hoursPerDay,
    totalDays,
  } : null;

  const pricingQuery = useLabPricing(pricingParams);
  const breakdown    = pricingQuery.data?.breakdown;

  const paymentUploadMut = useLabPaymentUpload();
  const labMut           = useLabMutation();

  const readFileAsBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Failed to read file'));
          return;
        }
        const result = reader.result;
        const commaIdx = result.indexOf(',');
        const header = result.slice(0, commaIdx);
        const base64 = result.slice(commaIdx + 1);
        const mimeType = header.replace('data:', '').replace(';base64', '');
        resolve({ base64, mimeType });
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPaymentKey('');
    setUploadError('');
    setUploadingPayment(true);
    try {
      const { base64, mimeType } = await readFileAsBase64(file);
      const res = await paymentUploadMut.mutateAsync({ fileData: base64, mimeType });
      setPaymentKey(res.paymentKey);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploadingPayment(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitError('');
    try {
      await labMut.mutateAsync({
        action: 'submit',
        accountId,
        region: REGION,
        platform,
        instanceType,
        storageGb,
        elasticIp,
        subnetId,
        securityGroupIds,
        durationHours,
        paymentKey,
        ...(labName ? { labName } : {}),
        ...(breakdown ? { estimatedCost: breakdown.finalTotalUsd } : {}),
      });
      setStep(4);
      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed.');
    }
  };

  const resetWizard = () => {
    setStep(1);
    setPlatform('ubuntu');
    setInstanceType('t3.micro');
    setStorageGb(20);
    setHoursPerDay(8);
    setMonths(1);
    setElasticIp(true);
    setLabName('');
    setPaymentKey('');
    setUploadError('');
    setSubmitError('');
  };

  const resetAndClose = () => {
    resetWizard();
    onClose();
  };

  const CARD_STYLE: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r)',
    padding: 24,
    marginBottom: 16,
  };

  const STEP_LABEL_STYLE: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    marginBottom: 4,
  };

  // ── Step 1: Configure ────────────────────────────────────────────
  if (step === 1) return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New Lab — Step 1 of 4: Configure</div>
        <Button size="xs" variant="ghost" onClick={resetAndClose}>Cancel</Button>
      </div>

      {/* Template gallery */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={STEP_LABEL_STYLE}>Quick-start templates</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setPlatform(tpl.platform);
                  setInstanceType(tpl.instanceType);
                  setStorageGb(tpl.storageGb);
                  setElasticIp(tpl.elasticIp);
                }}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{tpl.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tpl.instanceType} · {tpl.ram}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Platform */}
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Platform</label>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['ubuntu', 'windows'] as const).map((p) => (
            <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="platform" value={p} checked={platform === p} onChange={() => setPlatform(p)} />
              {p === 'ubuntu' ? 'Linux (Ubuntu)' : 'Windows'}
            </label>
          ))}
        </div>
      </div>

      {/* Instance type */}
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Instance type</label>
        <select className="inp" value={instanceType} onChange={(e) => setInstanceType(e.target.value)}>
          {INSTANCE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Storage / Hours / Duration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div className="field">
          <label className="field-label">Storage (GB)</label>
          <input className="inp" type="number" min={platform === 'windows' ? 35 : 8} max={500} value={storageGb}
            onChange={(e) => setStorageGb(parseInt(e.target.value, 10) || 20)} />
        </div>
        <div className="field">
          <label className="field-label">Hours / day</label>
          <input className="inp" type="number" min={1} max={24} value={hoursPerDay}
            onChange={(e) => setHoursPerDay(parseInt(e.target.value, 10) || 8)} />
        </div>
        <div className="field">
          <label className="field-label">Duration (months)</label>
          <input className="inp" type="number" min={1} max={36} value={months}
            onChange={(e) => setMonths(parseInt(e.target.value, 10) || 1)} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>
        {hoursPerDay} hrs/day × {months} month{months !== 1 ? 's' : ''} = {durationHours} hours total
      </div>

      {/* Account */}
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">AWS account</label>
        <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.accountId} value={a.accountId}>{a.accountName} ({a.accountId})</option>
          ))}
        </select>
      </div>

      {/* Lab name */}
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Lab name (optional)</label>
        <input className="inp" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="My Dev Lab" maxLength={100} />
      </div>

      {/* Elastic IP */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={elasticIp} onChange={(e) => setElasticIp(e.target.checked)} />
          Allocate Elastic IP (fixed public IP; stops IP changing on restart)
        </label>
      </div>

      {/* Network info */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>
        Network: Default VPC / Default Subnet (auto-selected)
        {networkQuery.isLoading && ' — loading…'}
        {networkQuery.error && ' — could not load network options'}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={() => setStep(2)} disabled={!accountId || !subnetId}>
          Next: Review pricing →
        </Button>
      </div>
    </div>
  );

  // ── Step 2: Pricing ────────────────────────────────────────────────
  if (step === 2) return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New Lab — Step 2 of 4: Pricing</div>
        <Button size="xs" variant="ghost" onClick={resetAndClose}>Cancel</Button>
      </div>

      {pricingQuery.isLoading && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 16 }}>Loading pricing…</div>
      )}
      {pricingQuery.error && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>
          Could not load pricing — check your connection.{' '}
          <button type="button" onClick={() => void pricingQuery.refetch()} style={{ color: 'var(--accent)', background: 'none', border: 0, cursor: 'pointer', textDecoration: 'underline' }}>
            Retry
          </button>
        </div>
      )}

      {breakdown && (
        <table className="tbl" style={{ marginBottom: 16 }}>
          <tbody>
            <tr><td>Compute ({pricingQuery.data?.runningHours?.toFixed(0)} hrs)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.ec2Cost.toFixed(2)}</td></tr>
            <tr><td>Storage ({storageGb} GB × {months} mo)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.ebsCost.toFixed(2)}</td></tr>
            {breakdown.eipCost > 0 && <tr><td>Elastic IP</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.eipCost.toFixed(2)}</td></tr>}
            <tr><td>Data transfer</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.dataTransferCost.toFixed(2)}</td></tr>
            <tr><td style={{ color: 'var(--ink-3)' }}>Subtotal</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', color: 'var(--ink-3)' }}>${breakdown.subtotalUsd.toFixed(2)}</td></tr>
            {breakdown.whtAmount > 0 && <tr><td>WHT ({breakdown.whtPercent}%)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.whtAmount.toFixed(2)}</td></tr>}
            {breakdown.discountAmount > 0 && <tr><td>Discount ({breakdown.discountPercent}%)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', color: 'var(--green-2)' }}>−${breakdown.discountAmount.toFixed(2)}</td></tr>}
            {breakdown.vatAmount > 0 && <tr><td>VAT ({breakdown.vatPercent}%)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.vatAmount.toFixed(2)}</td></tr>}
            <tr style={{ fontWeight: 700 }}>
              <td>Total</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 16 }}>
                {breakdown.currencyCode} {(breakdown.finalTotalUsd * breakdown.currencyRate).toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
        <Button variant="primary" onClick={() => setStep(3)} disabled={pricingQuery.isLoading || !!pricingQuery.error}>
          Next: Payment →
        </Button>
      </div>
    </div>
  );

  // ── Step 3: Payment ───────────────────────────────────────────────
  if (step === 3) return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New Lab — Step 3 of 4: Payment</div>
        <Button size="xs" variant="ghost" onClick={resetAndClose}>Cancel</Button>
      </div>

      {/* Summary */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px' }}>
          <span style={{ color: 'var(--ink-3)' }}>Platform</span><span>{platform === 'ubuntu' ? 'Linux (Ubuntu)' : 'Windows'}</span>
          <span style={{ color: 'var(--ink-3)' }}>Type</span><span>{instanceType}</span>
          <span style={{ color: 'var(--ink-3)' }}>Storage</span><span>{storageGb} GB</span>
          <span style={{ color: 'var(--ink-3)' }}>Duration</span><span>{durationHours} hrs ({months} mo × {hoursPerDay} hrs/day)</span>
          {breakdown && (
            <>
              <span style={{ color: 'var(--ink-3)' }}>Total</span>
              <span style={{ fontWeight: 700 }}>{breakdown.currencyCode} {(breakdown.finalTotalUsd * breakdown.currencyRate).toFixed(2)}</span>
            </>
          )}
        </div>
      </div>

      {/* Payment upload */}
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Payment screenshot</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => void handleFileChange(e)}
          style={{ fontSize: 13 }}
        />
        {uploadingPayment && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Uploading…</div>}
        {paymentKey && !uploadingPayment && <div style={{ fontSize: 12, color: 'var(--green-2)', marginTop: 4 }}>✓ Payment uploaded</div>}
        {uploadError && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{uploadError}</div>}
      </div>

      {submitError && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{submitError}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="ghost" onClick={() => setStep(2)}>← Back</Button>
        <Button variant="primary" onClick={() => void handleSubmit()} disabled={!paymentKey || uploadingPayment || labMut.isPending || !subnetId}>
          {labMut.isPending ? 'Submitting…' : 'Submit request'}
        </Button>
      </div>
    </div>
  );

  // ── Step 4: Submitted ─────────────────────────────────────────────
  return (
    <div style={{ ...CARD_STYLE, textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Request submitted!</div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
        An admin will review your payment and provision your lab. It'll appear in the list below once approved.
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Button variant="primary" onClick={resetAndClose}>View my labs</Button>
        <Button variant="ghost" onClick={resetWizard}>Submit another</Button>
      </div>
    </div>
  );
}
