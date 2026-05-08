import { useState, useEffect } from 'react';
import { Button, Card, PageHeader } from '@/components/ui';
import { useAccounts } from '@/lib/queries/accounts';
import { useFinanceSettings, useFinanceSettingsMutation } from '@/lib/queries/finance';
import type { FinanceSettings } from '@/types/api';

type TaxRow = { wht: string; vat: string; margin: string; rebate: string };

export default function FinSettingsScreen() {
  const { data: settingsData, isLoading: settingsLoading } = useFinanceSettings();
  const { data: accountsData, isLoading: accountsLoading } = useAccounts();
  const mut = useFinanceSettingsMutation();

  const [form, setForm] = useState<Partial<FinanceSettings>>({});
  const [taxEdits, setTaxEdits] = useState<Record<string, TaxRow>>({});
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (settingsData) {
      setForm(settingsData);
      const edits: Record<string, TaxRow> = {};
      const accts = settingsData.taxAccounts ?? {};
      for (const [id, v] of Object.entries(accts)) {
        edits[id] = {
          wht:    v.wht    != null ? String(v.wht)    : '',
          vat:    v.vat    != null ? String(v.vat)    : '',
          margin: v.margin != null ? String(v.margin) : '',
          rebate: v.rebate != null ? String(v.rebate) : '',
        };
      }
      setTaxEdits(edits);
    }
  }, [settingsData]);

  const setField = (key: keyof FinanceSettings, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMsg('');
    setSaveErr('');
  };

  const buildSaveBody = (overrideTax?: Record<string, TaxRow>): Record<string, unknown> => {
    const tax = overrideTax ?? taxEdits;
    const taxAccounts: Record<string, { wht?: number; vat?: number; margin?: number; rebate?: number }> = {};
    for (const [id, row] of Object.entries(tax)) {
      taxAccounts[id] = {
        wht:    row.wht    !== '' ? parseFloat(row.wht)    : undefined,
        vat:    row.vat    !== '' ? parseFloat(row.vat)    : undefined,
        margin: row.margin !== '' ? parseFloat(row.margin) : undefined,
        rebate: row.rebate !== '' ? parseFloat(row.rebate) : undefined,
      };
    }
    return {
      ...form,
      taxAccounts,
    };
  };

  const saveGlobal = async () => {
    setSaveMsg('');
    setSaveErr('');
    try {
      await mut.mutateAsync(buildSaveBody());
      setSaveMsg('Settings saved.');
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const applyAccountTax = async (_accountId: string) => {
    setSaveMsg('');
    setSaveErr('');
    try {
      await mut.mutateAsync(buildSaveBody());
      setSaveMsg('Settings saved.');
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const accounts = accountsData?.accounts ?? [];
  const whtGlobal = form.wht_rate != null ? (form.wht_rate * 100).toFixed(1) : '18.0';
  const vatGlobal = form.vat_rate != null ? (form.vat_rate * 100).toFixed(1) : '13.0';
  const marginGlobal = form.margin_rate != null ? (form.margin_rate * 100).toFixed(1) : '12.0';

  return (
    <div className="page">
      <PageHeader
        eyebrow="Configuration"
        title="Finance Settings"
        sub="Exchange rates, tax management, and finance alert defaults."
      />

      <Card title="Exchange rates" subtitle="Used across billing, vendors, and customers">
        {settingsLoading ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading settings…</p>
        ) : (
          <>
            <div className="grid-2" style={{ gap: 20 }}>
              <div className="field">
                <label className="field-label">USD → NPR rate</label>
                <input
                  className="inp"
                  type="number"
                  step={0.01}
                  min={0}
                  value={(form.usdToNpr as number) ?? 135}
                  onChange={(e) => setField('usdToNpr', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="field">
                <label className="field-label">INR → NPR rate</label>
                <input
                  className="inp"
                  type="number"
                  step={0.0001}
                  min={0}
                  value={(form.inrToNpr as number) ?? 1.62}
                  onChange={(e) => setField('inrToNpr', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div style={{ height: 20 }} />
            <div className="grid-2" style={{ gap: 20 }}>
              <div className="field">
                <label className="field-label">Contract expiry warning (days)</label>
                <input
                  className="inp"
                  type="number"
                  step={1}
                  min={1}
                  value={(form.expiryWarningDays as number) ?? 30}
                  onChange={(e) => setField('expiryWarningDays', parseInt(e.target.value, 10) || 30)}
                />
              </div>
              <div className="field">
                <label className="field-label">Payment due warning (days)</label>
                <input
                  className="inp"
                  type="number"
                  step={1}
                  min={1}
                  value={(form.paymentWarningDays as number) ?? 7}
                  onChange={(e) => setField('paymentWarningDays', parseInt(e.target.value, 10) || 7)}
                />
              </div>
            </div>
            <div style={{ height: 20 }} />
            <div className="field" style={{ maxWidth: 320 }}>
              <label className="field-label">Default currency</label>
              <select
                className="inp"
                value={(form.defaultCurrency as string) ?? 'USD'}
                onChange={(e) => setField('defaultCurrency', e.target.value as FinanceSettings['defaultCurrency'])}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="NPR">NPR — Nepalese Rupee</option>
                <option value="INR">INR — Indian Rupee</option>
              </select>
            </div>
            <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
              {saveMsg && <span style={{ fontSize: 13, color: 'var(--green-2)' }}>{saveMsg}</span>}
              {saveErr && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{saveErr}</span>}
              <Button variant="primary" size="sm" icon="Save" onClick={() => void saveGlobal()} disabled={mut.isPending}>
                {mut.isPending ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </>
        )}
      </Card>

      <div style={{ height: 24 }} />

      <Card
        title="Tax management · per account"
        subtitle="Override global rates per customer account. Rebate is applied to the final price and shown as a discount line item."
        pad={false}
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">WHT % (global {whtGlobal}%)</th>
              <th className="num">VAT % (global {vatGlobal}%)</th>
              <th className="num">Margin % (global {marginGlobal}%)</th>
              <th className="num">Rebate %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const row: TaxRow = taxEdits[a.accountId] ?? { wht: '', vat: '', margin: '', rebate: '' };
              const setTax = (field: keyof TaxRow, val: string) =>
                setTaxEdits((prev) => ({
                  ...prev,
                  [a.accountId]: { ...(prev[a.accountId] ?? { wht: '', vat: '', margin: '', rebate: '' }), [field]: val },
                }));
              return (
                <tr key={a.accountId}>
                  <td>
                    <div className="strong" style={{ color: 'var(--ink)' }}>{a.accountId}</div>
                    <div className="mono" style={{ color: 'var(--ink-4)' }}>{a.accountName}</div>
                  </td>
                  <td className="num">
                    <input
                      className="inp"
                      style={{ width: 80, textAlign: 'right' }}
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="Use global"
                      value={row.wht}
                      onChange={(e) => setTax('wht', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="inp"
                      style={{ width: 80, textAlign: 'right' }}
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="Use global"
                      value={row.vat}
                      onChange={(e) => setTax('vat', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="inp"
                      style={{ width: 80, textAlign: 'right' }}
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="Use global"
                      value={row.margin}
                      onChange={(e) => setTax('margin', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="inp"
                      style={{ width: 80, textAlign: 'right' }}
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="0"
                      value={row.rebate}
                      onChange={(e) => setTax('rebate', e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => void applyAccountTax(a.accountId)}
                      disabled={mut.isPending}
                    >
                      Apply
                    </Button>
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && !accountsLoading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 13, padding: 20 }}>
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {(saveMsg || saveErr) && (
          <div style={{ padding: '8px 16px', fontSize: 12 }}>
            {saveMsg && <span style={{ color: 'var(--green-2)' }}>{saveMsg}</span>}
            {saveErr && <span style={{ color: 'var(--danger)' }}>{saveErr}</span>}
          </div>
        )}
      </Card>
    </div>
  );
}
