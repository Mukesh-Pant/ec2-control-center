import React, { useState, useMemo } from 'react';
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Stat } from '@/components/ui';
import { getRole } from '@/lib/auth';
import { useVendors, useVendorMutation } from '@/lib/queries/finance';
import type { Vendor } from '@/types/api';

// ── Form blank / helpers ──────────────────────────────────────────────────────

type VendorForm = Omit<Vendor, 'entityId' | 'createdAt' | 'updatedAt'>;

function blankForm(): VendorForm {
  return {
    name: '',
    category: '',
    billingType: 'recurring',
    currency: 'USD',
    amount: 0,
    agreementEnd: '',
    manualStatus: 'active',
    notes: '',
  };
}

function formFromVendor(v: Vendor): VendorForm {
  return {
    name: v.name,
    category: v.category,
    billingType: v.billingType,
    currency: v.currency,
    amount: v.amount,
    agreementEnd: v.agreementEnd ?? '',
    manualStatus: v.manualStatus,
    notes: v.notes ?? '',
  };
}

function billingLabel(t: Vendor['billingType']) {
  if (t === 'recurring') return 'Recurring';
  if (t === 'one-time') return 'One-time';
  return 'Variable';
}

function statusTone(s: Vendor['manualStatus']): 'ok' | 'muted' {
  return s === 'active' ? 'ok' : 'muted';
}

// ── Inline vendor form ────────────────────────────────────────────────────────

interface VendorFormPanelProps {
  initial: VendorForm;
  isPending: boolean;
  onSave: (f: VendorForm) => void;
  onCancel: () => void;
}

function VendorFormPanel({ initial, isPending, onSave, onCancel }: VendorFormPanelProps) {
  const [form, setForm] = useState<VendorForm>(initial);
  const set = <K extends keyof VendorForm>(key: K, value: VendorForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSave = form.name.trim() !== '' && form.category.trim() !== '' && form.amount >= 0;

  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <div className="field">
          <label className="field-label">Name</label>
          <input
            className="inp"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="AWS, GitHub, Slack…"
          />
        </div>
        <div className="field">
          <label className="field-label">Category</label>
          <input
            className="inp"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Cloud, SaaS, Contractor…"
          />
        </div>
        <div className="field">
          <label className="field-label">Billing type</label>
          <select
            className="inp"
            value={form.billingType}
            onChange={(e) => set('billingType', e.target.value as Vendor['billingType'])}
          >
            <option value="recurring">Recurring</option>
            <option value="one-time">One-time</option>
            <option value="variable">Variable</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Currency</label>
          <select
            className="inp"
            value={form.currency}
            onChange={(e) => set('currency', e.target.value as Vendor['currency'])}
          >
            <option value="USD">USD</option>
            <option value="NPR">NPR</option>
            <option value="INR">INR</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Amount</label>
          <input
            className="inp"
            type="number"
            min={0}
            step={0.01}
            value={form.amount}
            onChange={(e) => set('amount', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="field">
          <label className="field-label">Agreement end (optional)</label>
          <input
            className="inp"
            type="date"
            value={form.agreementEnd ?? ''}
            onChange={(e) => set('agreementEnd', e.target.value || '')}
          />
        </div>
        <div className="field">
          <label className="field-label">Status</label>
          <select
            className="inp"
            value={form.manualStatus}
            onChange={(e) => set('manualStatus', e.target.value as Vendor['manualStatus'])}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Notes (optional)</label>
          <textarea
            className="inp"
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            style={{ resize: 'vertical' }}
            placeholder="Payment method, account number, contact…"
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button
          size="xs"
          variant="primary"
          onClick={() => onSave(form)}
          disabled={isPending || !canSave}
        >
          {isPending ? 'Saving…' : 'Save vendor'}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VendorsScreen() {
  // All hooks before any conditional returns (Rules of Hooks)
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [mutError, setMutError] = useState('');

  const role = getRole();
  const isAdmin = role === 'admin';

  const { data, isLoading, error } = useVendors();
  const mut = useVendorMutation();

  const vendors: Vendor[] = data?.items ?? [];

  // Derived stats — computed from full list (before filters)
  const totalCount = vendors.length;
  const activeCount = vendors.filter((v) => v.manualStatus === 'active').length;
  const monthlySpend = vendors
    .filter((v) => v.manualStatus === 'active' && v.billingType === 'recurring')
    .reduce((sum, v) => sum + v.amount, 0);

  // Unique categories for filter dropdown
  const categories = useMemo(() => {
    const set = new Set(vendors.map((v) => v.category).filter(Boolean));
    return Array.from(set).sort();
  }, [vendors]);

  // Filtered vendor list
  const filtered = useMemo(() => {
    return vendors.filter((v) => {
      if (statusFilter !== 'all' && v.manualStatus !== statusFilter) return false;
      if (categoryFilter && v.category !== categoryFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!v.name.toLowerCase().includes(q) && !v.category.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [vendors, statusFilter, categoryFilter, searchText]);

  // ── Mutation helpers ────────────────────────────────────────────────────────

  const handleAdd = async (form: VendorForm) => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'add', ...form });
      setShowAdd(false);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to add vendor.');
    }
  };

  const handleUpdate = async (entityId: string, form: VendorForm) => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'update', entityId, ...form });
      setEditingId(null);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to update vendor.');
    }
  };

  const handleDelete = async (entityId: string) => {
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'delete', entityId });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to delete vendor.');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Vendors"
        sub="Services and tools OCU pays for."
        actions={
          isAdmin ? (
            showAdd ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            ) : (
              <Button
                icon="Plus"
                variant="primary"
                size="sm"
                onClick={() => { setShowAdd(true); setEditingId(null); }}
              >
                Add vendor
              </Button>
            )
          ) : undefined
        }
      />

      {/* Stats row */}
      <div className="stats">
        <Stat
          label="Total vendors"
          icon="Building2"
          value={String(totalCount)}
          meta="all tracked vendors"
        />
        <Stat
          label="Active vendors"
          icon="CheckCircle2"
          value={String(activeCount)}
          meta="currently active"
        />
        <Stat
          label="Monthly spend"
          icon="DollarSign"
          value={monthlySpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          meta="active recurring vendors"
        />
      </div>

      {/* Add vendor form */}
      {showAdd && isAdmin && (
        <VendorFormPanel
          initial={blankForm()}
          isPending={mut.isPending}
          onSave={(form) => void handleAdd(form)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Vendor table card */}
      <Card pad={false}>
        {/* Filter bar */}
        <div className="filter-bar">
          <div className="field">
            <label className="field-label">Search</label>
            <div className="inp-group">
              <span className="inp-ico"><Icon name="Search" size={14} /></span>
              <input
                className="inp"
                placeholder="Name or category…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Status</label>
            <select
              className="inp"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Category</label>
            <select
              className="inp"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading / error */}
        {isLoading && (
          <div style={{ padding: '24px 20px', color: 'var(--ink-3)', fontSize: 13 }}>
            Loading vendors…
          </div>
        )}
        {error && (
          <div style={{ padding: '24px 20px', color: 'var(--danger)', fontSize: 13 }}>
            Failed to load vendors. Please try again.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState
            icon="PackageOpen"
            title={vendors.length === 0 ? 'No vendors yet' : 'No vendors match these filters'}
            description={
              vendors.length === 0
                ? 'Track the services and tools your company pays for. Add your first vendor to see monthly payables here.'
                : 'Try adjusting the search or filter options.'
            }
            actions={
              vendors.length === 0 && isAdmin ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon="Plus"
                  onClick={() => setShowAdd(true)}
                >
                  Add your first vendor
                </Button>
              ) : undefined
            }
          />
        )}

        {/* Table */}
        {!isLoading && !error && filtered.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name / Category</th>
                <th>Billing type</th>
                <th>Currency</th>
                <th className="num">Amount</th>
                <th>Agreement end</th>
                <th>Status</th>
                {isAdmin && <th style={{ width: 140 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <React.Fragment key={v.entityId}>
                  <tr>
                    <td>
                      <div className="strong">{v.name}</div>
                      {v.category && (
                        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                          {v.category}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge tone={v.billingType === 'recurring' ? 'accent' : 'muted'}>
                        {billingLabel(v.billingType)}
                      </Badge>
                    </td>
                    <td className="mono">{v.currency}</td>
                    <td className="num">
                      {v.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td>
                      {v.agreementEnd ? (
                        <span style={{ fontSize: 13 }}>{v.agreementEnd}</span>
                      ) : (
                        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={statusTone(v.manualStatus)} dot>
                        {v.manualStatus === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button
                            size="xs"
                            variant="ghost"
                            icon="Pencil"
                            onClick={() => {
                              setEditingId(editingId === v.entityId ? null : v.entityId);
                              setShowAdd(false);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            icon="Trash2"
                            onClick={() => void handleDelete(v.entityId)}
                            disabled={mut.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isAdmin && editingId === v.entityId && (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} style={{ padding: 0 }}>
                        <div style={{ padding: '8px 12px' }}>
                          <VendorFormPanel
                            initial={formFromVendor(v)}
                            isPending={mut.isPending}
                            onSave={(form) => void handleUpdate(v.entityId, form)}
                            onCancel={() => setEditingId(null)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}

        {mutError && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--danger)' }}>
            {mutError}
          </div>
        )}
      </Card>
    </div>
  );
}
