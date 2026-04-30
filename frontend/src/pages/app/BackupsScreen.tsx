import { Button, Card, EmptyState, PageHeader } from '@/components/ui';

export default function BackupsScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Protection"
        title="Backups"
        sub="Snapshots and restores across your fleet."
        actions={<Button icon="Plus" variant="primary" size="sm">Create snapshot</Button>}
      />
      <Card pad={false}>
        <EmptyState
          icon="HardDriveUpload"
          title="No snapshots yet"
          description="Automated snapshots protect your instances against data loss. Enable a policy or create your first manual snapshot."
          actions={
            <>
              <Button variant="primary" size="sm" icon="Plus">Create snapshot</Button>
              <Button variant="ghost" size="sm" icon="Settings">Configure policy</Button>
            </>
          }
        />
      </Card>
    </div>
  );
}
