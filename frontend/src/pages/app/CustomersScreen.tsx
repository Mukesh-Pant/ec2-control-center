import { Button, Card, EmptyState, PageHeader, Stat } from '@/components/ui';

export default function CustomersScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Customers"
        sub="Clients, contracts, and billing relationships."
        actions={<Button icon="Plus" variant="primary" size="sm">Add customer</Button>}
      />

      <div className="stats">
        <Stat label="Active customers" icon="Users" value="0" meta="signed & billable" />
        <Stat label="Contract value" icon="FileText" value="NPR 0" meta="total booked" />
        <Stat label="Outstanding" icon="Clock" value="NPR 0" meta="invoices pending" />
        <Stat label="Expiring · 30d" icon="AlertCircle" value="0" meta="needs renewal" />
      </div>

      <Card pad={false}>
        <EmptyState
          icon="Users"
          title="No customers yet"
          description="Track clients and contracts here. Contract value, payment milestones, and renewal alerts appear once you add your first customer."
          actions={<Button variant="primary" size="sm" icon="Plus">Add your first customer</Button>}
        />
      </Card>
    </div>
  );
}
