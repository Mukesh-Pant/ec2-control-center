import { Button, Card, PageHeader } from '@/components/ui';
import { ACCOUNTS } from '@/features/app/mockData';

export default function FinSettingsScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Configuration"
        title="Finance Settings"
        sub="Exchange rates, tax management, and finance alert defaults."
      />

      <Card title="Exchange rates" subtitle="Used across billing, vendors, and customers">
        <div className="grid-2" style={{ gap: 20 }}>
          <div className="field">
            <label className="field-label">USD → NPR rate</label>
            <input className="inp" defaultValue="135" />
            <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>1 USD ≈ NPR 140 (live)</div>
          </div>
          <div className="field">
            <label className="field-label">INR → NPR rate</label>
            <input className="inp" defaultValue="1.62" />
          </div>
        </div>
        <div style={{ height: 20 }} />
        <div className="grid-2" style={{ gap: 20 }}>
          <div className="field">
            <label className="field-label">Contract expiry warning (days)</label>
            <input className="inp" defaultValue="30" />
          </div>
          <div className="field">
            <label className="field-label">Payment due warning (days)</label>
            <input className="inp" defaultValue="7" />
          </div>
        </div>
        <div style={{ height: 20 }} />
        <div className="field" style={{ maxWidth: 320 }}>
          <label className="field-label">Default currency</label>
          <select className="inp" defaultValue="USD">
            <option value="USD">USD — US Dollar</option>
            <option value="NPR">NPR — Nepalese Rupee</option>
            <option value="INR">INR — Indian Rupee</option>
          </select>
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" size="sm" icon="Save">Save settings</Button>
        </div>
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
              <th className="num">WHT % (global 16.0%)</th>
              <th className="num">VAT % (global 13.0%)</th>
              <th className="num">Margin % (global 12.0%)</th>
              <th className="num">Rebate %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ACCOUNTS.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="strong" style={{ color: 'var(--ink)' }}>{a.id}</div>
                  <div className="mono" style={{ color: 'var(--ink-4)' }}>{a.name}</div>
                </td>
                <td className="num mono">Use global</td>
                <td className="num mono">Use global</td>
                <td className="num mono">Use global</td>
                <td className="num mono">0</td>
                <td style={{ textAlign: 'right' }}>
                  <Button variant="ghost" size="xs">Apply</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
