// src/pages/app/LabSettingsScreen.tsx
import React, { useState, useEffect } from 'react';
import { Button, Card, PageHeader } from '@/components/ui';
import { getRole } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import {
  useLabPricingSettings,
  useLabPricingSettingsMutation,
  useLabTemplates,
  useLabTemplatesMutation,
} from '@/lib/queries/labSettings';
import type { LabPricingSettings, LabTemplate } from '@/types/api';

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  marginBottom: 10,
};

// ── Pricing Settings ─────────────────────────────────────────────────────────

function PricingSettingsPanel() {
  const { data, isLoading, error } = useLabPricingSettings();
  const mut = useLabPricingSettingsMutation();
  const [form, setForm] = useState<Partial<LabPricingSettings>>({});
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  const setField = (key: keyof LabPricingSettings, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMsg('');
    setSaveErr('');
  };

  const save = async () => {
    setSaveMsg('');
    setSaveErr('');
    try {
      await mut.mutateAsync(form as Record<string, unknown>);
      setSaveMsg('Settings saved.');
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  if (isLoading) return <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading settings…</p>;
  if (error) return <p style={{ color: 'var(--danger)', fontSize: 13 }}>Failed to load settings.</p>;

  const numField = (label: string, key: keyof LabPricingSettings, step = 0.01, max?: number) => (
    <div className="field" style={{ marginBottom: 14 }}>
      <label className="field-label">{label}</label>
      <input
        className="inp"
        type="number"
        step={step}
        min={0}
        max={max}
        value={(form[key] as number) ?? 0}
        onChange={(e) => setField(key, parseFloat(e.target.value) || 0)}
      />
    </div>
  );

  return (
    <Card>
      <div style={SECTION_LABEL}>Pricing Settings</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        {numField('WHT %',                        'whtPercent',              0.01, 100)}
        {numField('VAT %',                        'vatPercent',              0.01, 100)}
        {numField('Margin %',                     'marginPercent',           0.01, 200)}
        {numField('Discount %',                   'discountPercent',         0.01, 100)}
        {numField('Currency rate (USD→local)',    'currencyRate',            0.0001)}
        {numField('Data transfer / month (USD)',  'dataTransferMonthlyUsd',  0.01)}
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Currency code</label>
        <input
          className="inp"
          value={(form.currencyCode as string) ?? ''}
          onChange={(e) => setField('currencyCode', e.target.value)}
          maxLength={5}
          style={{ width: 120 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(form.includeBackup)}
            onChange={(e) => setField('includeBackup', e.target.checked)}
          />
          Include backup cost estimate
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(form.includeMonitoring)}
            onChange={(e) => setField('includeMonitoring', e.target.checked)}
          />
          Include detailed monitoring cost
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={mut.isPending}>
          {mut.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        {saveMsg && <span style={{ fontSize: 13, color: 'var(--green-2)' }}>{saveMsg}</span>}
        {saveErr && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{saveErr}</span>}
      </div>
    </Card>
  );
}

// ── Template Management ───────────────────────────────────────────────────────

const INSTANCE_GROUPS_FLAT = [
  { value: 't3.micro',  label: 't3.micro (2 vCPU · 1 GB)' },
  { value: 't3.small',  label: 't3.small (2 vCPU · 2 GB)' },
  { value: 't3.medium', label: 't3.medium (2 vCPU · 4 GB)' },
  { value: 't3.large',  label: 't3.large (2 vCPU · 8 GB)' },
  { value: 'm5.large',  label: 'm5.large (2 vCPU · 8 GB)' },
  { value: 'm5.xlarge', label: 'm5.xlarge (4 vCPU · 16 GB)' },
  { value: 'c5.large',  label: 'c5.large (2 vCPU · 4 GB)' },
  { value: 'c5.xlarge', label: 'c5.xlarge (4 vCPU · 8 GB)' },
  { value: 'r5.large',  label: 'r5.large (2 vCPU · 16 GB)' },
  { value: 'r5.xlarge', label: 'r5.xlarge (4 vCPU · 32 GB)' },
];

// EditableTemplate omits computed/display-only fields that the form doesn't edit
type EditableTemplate = Omit<LabTemplate, 'badgeClass' | 'icon' | 'badge'> & {
  badgeClass: string;
  icon: string;
};

function blankTemplate(): EditableTemplate {
  return {
    id: '',
    name: '',
    description: '',
    instanceType: 't3.micro',
    vcpu: 2,
    ram: '1 GB',
    storageGb: 20,
    platform: 'ubuntu',
    elasticIp: true,
    detailedMonitor: false,
    useCases: [],
    badgeClass: '',
    icon: '',
  };
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: EditableTemplate;
  onSave: (t: EditableTemplate) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [t, setT] = useState<EditableTemplate>(initial ?? blankTemplate());
  const set = (key: keyof EditableTemplate, value: unknown) =>
    setT((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        padding: 16,
        marginTop: 8,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <div className="field">
          <label className="field-label">Template name</label>
          <input
            className="inp"
            value={t.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Dev Sandbox"
          />
        </div>
        <div className="field">
          <label className="field-label">Platform</label>
          <select
            className="inp"
            value={t.platform}
            onChange={(e) => set('platform', e.target.value as 'ubuntu' | 'windows')}
          >
            <option value="ubuntu">Linux (Ubuntu)</option>
            <option value="windows">Windows</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Instance type</label>
          <select
            className="inp"
            value={t.instanceType}
            onChange={(e) => set('instanceType', e.target.value)}
          >
            {INSTANCE_GROUPS_FLAT.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Storage (GB)</label>
          <input
            className="inp"
            type="number"
            min={8}
            max={500}
            value={t.storageGb}
            onChange={(e) => set('storageGb', parseInt(e.target.value, 10) || 20)}
          />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Description</label>
          <input
            className="inp"
            value={t.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Personal websites and blogs"
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button size="xs" variant="primary" onClick={() => onSave(t)} disabled={isPending || !t.name}>
          {isPending ? 'Saving…' : 'Save template'}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TemplateManagementPanel() {
  const { data, isLoading, error } = useLabTemplates();
  const mut = useLabTemplatesMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mutError, setMutError] = useState('');

  const templates: EditableTemplate[] = (data?.templates ?? []).map((t) => ({
    ...t,
    badgeClass: t.badgeClass,
    icon: t.icon,
  }));

  const saveAll = async (updated: EditableTemplate[]) => {
    setMutError('');
    try {
      await mut.mutateAsync(updated as unknown as Record<string, unknown>[]);
      setEditingId(null);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const addTemplate = (t: EditableTemplate) => {
    const id = t.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    void saveAll([...templates, { ...t, id: id || `template-${Date.now()}` }]);
  };

  const updateTemplate = (updated: EditableTemplate) => {
    void saveAll(templates.map((t) => (t.id === updated.id ? updated : t)));
  };

  const deleteTemplate = (id: string) => {
    void saveAll(templates.filter((t) => t.id !== id));
  };

  if (isLoading) return <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading templates…</p>;
  if (error) return <p style={{ color: 'var(--danger)', fontSize: 13 }}>Failed to load templates.</p>;

  return (
    <div style={{ marginTop: 16 }}>
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div style={SECTION_LABEL}>Lab Templates</div>
          <Button size="xs" variant="ghost" icon="Plus" onClick={() => setEditingId('')}>
            Add template
          </Button>
        </div>

        {editingId === '' && (
          <TemplateForm
            onSave={addTemplate}
            onCancel={() => setEditingId(null)}
            isPending={mut.isPending}
          />
        )}

        {templates.length === 0 && editingId !== '' && (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>No templates yet. Add one above.</p>
        )}

        {templates.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Platform</th>
                <th>Instance Type</th>
                <th>Storage</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <React.Fragment key={tpl.id}>
                  <tr>
                    <td className="strong">{tpl.name}</td>
                    <td>{tpl.platform === 'ubuntu' ? 'Linux' : 'Windows'}</td>
                    <td style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>{tpl.instanceType}</td>
                    <td>{tpl.storageGb} GB</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button
                          size="xs"
                          variant="ghost"
                          icon="Pencil"
                          onClick={() => setEditingId(tpl.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="danger"
                          icon="Trash2"
                          onClick={() => void deleteTemplate(tpl.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {editingId === tpl.id && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <TemplateForm
                          initial={tpl}
                          onSave={updateTemplate}
                          onCancel={() => setEditingId(null)}
                          isPending={mut.isPending}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}

        {mutError && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{mutError}</div>
        )}
      </Card>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LabSettingsScreen() {
  const role = getRole();
  if (role !== 'admin') return <Navigate to="/app/instances" replace />;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administration"
        title="Lab Settings"
        sub="Configure pricing model and manage quick-start templates for lab provisioning."
      />
      <PricingSettingsPanel />
      <TemplateManagementPanel />
    </div>
  );
}
