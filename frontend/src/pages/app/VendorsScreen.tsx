import { Button, Card, EmptyState, Icon, PageHeader, Stat } from '@/components/ui';

export default function VendorsScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Vendors"
        sub="Services and tools we pay for."
        actions={<Button icon="Plus" variant="primary" size="sm">Add vendor</Button>}
      />

      <div className="stats">
        <Stat label="Monthly payables" icon="DollarSign" value="NPR 0" meta="recurring vendors only" />
        <Stat label="Active vendors" icon="CheckCircle2" value="0" meta="including expiring soon" />
        <Stat label="Expiring / expired" icon="AlertCircle" value="0" meta="needs attention" />
        <Stat label="Irregular vendors" icon="Activity" value="0" meta="variable / unscheduled" />
      </div>

      <Card pad={false}>
        <div className="filter-bar">
          <div className="field">
            <label className="field-label">Search</label>
            <div className="inp-group">
              <span className="inp-ico"><Icon name="Search" size={14} /></span>
              <input className="inp" placeholder="Name or category…" />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Status</label>
            <select className="inp" defaultValue="all">
              <option value="all">All statuses</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Billing</label>
            <select className="inp" defaultValue="all">
              <option value="all">All types</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Currency</label>
            <select className="inp" defaultValue="all">
              <option value="all">All currencies</option>
            </select>
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }} />
        </div>
        <EmptyState
          icon="PackageOpen"
          title="No vendors yet"
          description="Track the services and tools your company pays for. Add your first vendor to see monthly payables and renewal alerts here."
          actions={<Button variant="primary" size="sm" icon="Plus">Add your first vendor</Button>}
        />
      </Card>
    </div>
  );
}
