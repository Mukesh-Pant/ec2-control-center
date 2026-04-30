import { Card, EmptyState, PageHeader } from '@/components/ui';

export default function AlertsScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Alerts & Notifications"
        sub="Contract expirations, payment reminders, and cost anomalies."
      />
      <Card pad={false}>
        <EmptyState
          icon="BellOff"
          title="Nothing needs your attention"
          description="Alerts appear here when contracts are about to expire, payments are overdue, or cost anomalies are detected."
        />
      </Card>
    </div>
  );
}
