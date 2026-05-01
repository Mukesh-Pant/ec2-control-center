import { Card, EmptyState, PageHeader } from '@/components/ui';

export default function MyServersScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Labs"
        title="My Servers"
        sub="Self-service EC2 lab provisioning — coming in a future update."
      />
      <Card pad={false}>
        <EmptyState
          icon="Wrench"
          title="Labs coming soon"
          description="The self-service lab wizard (configure, price, pay, provision) is under active development. Check back in the next release."
        />
      </Card>
    </div>
  );
}
