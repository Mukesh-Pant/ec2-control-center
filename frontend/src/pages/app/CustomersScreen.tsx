import React, { useState, useMemo } from 'react';
import { Badge, Button, Card, EmptyState, PageHeader, Stat } from '@/components/ui';
import { getRole } from '@/lib/auth';
import { useCustomers, useCustomerMutation } from '@/lib/queries/finance';
import type { Customer } from '@/types/api';

type CustomerForm = Omit<Customer, 'entityId' | 'createdAt' | 'updatedAt'>;

function blankForm(): CustomerForm {
  return {
    name: '',
    type: 'Business',
    currency: 'USD',
    contractValue: 0,
    outstandingAmount: 0,
    nextDueDate: '',
    agreementEnd: '',
    notes: '',
  };
}

function formFromCustomer(c: Customer): CustomerForm {
  return {
    name: c.name,
    type: c.type,
    currency: c.currency,
    contractValue: c.contractValue,
    outstandingAmount: c.outstandingAmount,
    nextDueDate: c.nextDueDate ?? '',
    agreementEnd: c.agreementEnd ?? '',
    notes: c.notes ?? '',
  };
}

function typeTone(t: Customer['type']): 'accent' | 'muted' {
  return t === 'Business' ? 'accent' : 'muted';
}

interface CustomerFormPanelProps {
  initial: CustomerForm;
  isPending: boolean;
  onSave: (f: CustomerForm) => void;
  onCancel: () => void;
}

function CustomerFormPanel({ initial, isPending, onSave, onCancel }: CustomerFormPanelProps) {
  const [form, setForm] = useState<CustomerForm>(initial);
  const set = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSave = form.name.trim() !== '' && form.contractValue >= 0 && form.outstandingAmount >= 0;

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
            placeholder="Acme Corp, John Doe…"
          />
        </div>
        <div className="field">
          <label className="field-label">Type</label>
          <select
            className="inp"
            value={form.type}
            onChange={(e) => set('type', e.target.value as Customer['type'])}
          >
            <option value="Business">Business</option>
            <option value="Individual">Individual</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Currency</label>
          <select
            className="inp"
            value={form.currency}
            onChange={(e) => set('currency', e.target.value as Customer['currency'])}
          >
            <option value="USD">USD</option>
            <option value="NPR">NPR</option>
            <option value="INR">INR</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Contract value</label>
          <input
            className="inp"
            type="number"
            min={0}
            step={0.01}
            value={form.contractValue}
            onChange={(e) => set('contractValue', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="field">
          <label className="field-label">Outstanding amount</label>
          <input
            className="inp"
            type="number"
            min={0}
            step={0.01}
            value={form.outstandingAmount}
            onChange={(e) => set('outstandingAmount', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="field">
          <label className="field-label">Next due date (optional)</label>
          <input
            className="inp"
            type="date"
            value={form.nextDueDate}
            onChange={(e) => set('nextDueDate', e.target.value || '')}
          />
        </div>
        <div className="field">
          <label className="field-label">Agreement end (optional)</label>
          <input
            className="inp"
            type="date"
            value={form.agreementEnd}
            onChange={(e) => set('agreementEnd', e.target.value || '')}
          />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Notes (optional)</label>
          <textarea
            className="inp"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            style={{ resize: 'vertical' }}
            placeholder="Contact person, payment terms, relationship notes…"
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
          {isPending ? 'Saving…' : 'Save customer'}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function CustomersScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'Business' | 'Individual'>('all');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [mutError, setMutError] = useState('');

  const role = getRole();
  const isAdmin = role === 'admin';

  const { data, isLoading, error } = useCustomers();
  const mut = useCustomerMutation();

  const customers: Customer[] = data?.items ?? [];

  const totalCount = customers.length;
  const totalContractUsd = customers
    .filter((c) => c.currency === 'USD')
    .reduce((sum, c) => sum + c.contractValue, 0);
  const totalOutstandingUsd = customers
    .filter((c) => c.currency === 'USD')
    .reduce((sum, c) => sum + c.outstandingAmount, 0);

  const currencies = useMemo(() => {
    const set = new Set(customers.map((c) => c.currency).filter(Boolean));
    return Array.from(set).sort();
  }, [customers]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (currencyFilter && c.currency !== currencyFilter) return false;
      return true;
    });
  }, [customers, typeFilter, currencyFilter]);

  const handleAdd = async (form: CustomerForm) => {
    if (!isAdmin) return;
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'add', ...form });
      setShowAdd(false);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to add customer.');
    }
  };

  const handleUpdate = async (entityId: string, form: CustomerForm) => {
    if (!isAdmin) return;
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'update', entityId, ...form });
      setEditingId(null);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to update customer.');
    }
  };

  const handleDelete = async (entityId: string) => {
    if (!isAdmin) return;
    setMutError('');
    try {
      await mut.mutateAsync({ action: 'delete', entityId });
      setDeletingId(null);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to delete customer.');
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Customers"
        sub="Clients, contracts, and billing relationships."
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
                Add customer
              </Button>
            )
          ) : undefined
        }
      />

      <div className="stats">
        <Stat
          label="Total customers"
          icon="Users"
          value={String(totalCount)}
          meta="all tracked customers"
        />
        <Stat
          label="Contract Value (USD)"
          icon="FileText"
          value={totalContractUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          meta="USD contracts"
        />
        <Stat
          label="Outstanding (USD)"
          icon="Clock"
          value={totalOutstandingUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          meta="USD invoices pending"
        />
      </div>

      {showAdd && isAdmin && (
        <CustomerFormPanel
          initial={blankForm()}
          isPending={mut.isPending}
          onSave={(form) => void handleAdd(form)}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <Card pad={false}>
        <div className="filter-bar">
          <div className="field">
            <label className="field-label">Type</label>
            <select
              className="inp"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            >
              <option value="all">All types</option>
              <option value="Business">Business</option>
              <option value="Individual">Individual</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Currency</label>
            <select
              className="inp"
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
            >
              <option value="">All currencies</option>
              {currencies.map((cur) => (
                <option key={cur} value={cur}>{cur}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading && (
          <div style={{ padding: '24px 20px', color: 'var(--ink-3)', fontSize: 13 }}>
            Loading customers…
          </div>
        )}
        {error && (
          <div style={{ padding: '24px 20px', color: 'var(--danger)', fontSize: 13 }}>
            Failed to load customers. Please try again.
          </div>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState
            icon="Users"
            title={customers.length === 0 ? 'No customers yet' : 'No customers match these filters'}
            description={
              customers.length === 0
                ? 'Track clients and contracts here. Contract value, payment milestones, and renewal alerts appear once you add your first customer.'
                : 'Try adjusting the type or currency filters.'
            }
            actions={
              customers.length === 0 && isAdmin ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon="Plus"
                  onClick={() => setShowAdd(true)}
                >
                  Add your first customer
                </Button>
              ) : undefined
            }
          />
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name / Type</th>
                <th>Currency</th>
                <th className="num">Contract Value</th>
                <th className="num">Outstanding Amount</th>
                <th>Next Due Date</th>
                <th>Agreement End</th>
                {isAdmin && <th style={{ width: 140 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <React.Fragment key={c.entityId}>
                  <tr>
                    <td>
                      <div className="strong">{c.name}</div>
                      <div style={{ marginTop: 2 }}>
                        <Badge tone={typeTone(c.type)}>{c.type}</Badge>
                      </div>
                    </td>
                    <td className="mono">{c.currency}</td>
                    <td className="num">
                      {c.contractValue.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="num">
                      <span style={{ color: c.outstandingAmount > 0 ? 'var(--warn)' : undefined }}>
                        {c.outstandingAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                    <td>
                      {c.nextDueDate ? (
                        <span style={{ fontSize: 13 }}>{c.nextDueDate}</span>
                      ) : (
                        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      {c.agreementEnd ? (
                        <span style={{ fontSize: 13 }}>{c.agreementEnd}</span>
                      ) : (
                        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        {deletingId === c.entityId ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                              Are you sure?
                            </span>
                            <Button
                              size="xs"
                              variant="danger"
                              onClick={() => void handleDelete(c.entityId)}
                              disabled={mut.isPending}
                            >
                              Confirm
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => { setDeletingId(null); setMutError(''); }}
                              disabled={mut.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Button
                              size="xs"
                              variant="ghost"
                              icon="Pencil"
                              onClick={() => {
                                setEditingId(editingId === c.entityId ? null : c.entityId);
                                setShowAdd(false);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="danger"
                              icon="Trash2"
                              onClick={() => setDeletingId(c.entityId)}
                              disabled={mut.isPending}
                            >
                              Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  {editingId === c.entityId && (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} style={{ padding: 0 }}>
                        <div style={{ padding: '8px 12px' }}>
                          <CustomerFormPanel
                            key={c.entityId}
                            initial={formFromCustomer(c)}
                            isPending={mut.isPending}
                            onSave={(form) => void handleUpdate(c.entityId, form)}
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
