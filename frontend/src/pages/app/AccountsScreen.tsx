import { Badge, Button, Icon, PageHeader } from '@/components/ui';
import { ACCOUNTS } from '@/features/app/mockData';

export default function AccountsScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Administration"
        title="Accounts"
        sub="AWS accounts managed by this portal — each with a cross-account IAM role."
        actions={
          <>
            <Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>
            <Button icon="Plus" variant="primary" size="sm">Add account</Button>
          </>
        }
      />

      <div className="info-banner">
        <Icon name="ShieldCheck" />
        <div>
          <div className="info-banner-ti">Access control</div>
          <div className="info-banner-body">
            Admin users see this Accounts page and can add / remove linked AWS accounts. <strong>Admin</strong> · full
            control — link/remove accounts, start/stop any instance. <strong>Member</strong> · view and control
            instances, analytics, audit — cannot manage accounts.
          </div>
        </div>
      </div>

      <div className="grid-2">
        {ACCOUNTS.map((a) => (
          <div key={a.id} className="card acct-card">
            <div className="acct-hd">
              <div>
                <div className="acct-name">
                  {a.kind === 'central' && <Icon name="Star" />}
                  {a.name}
                </div>
                <div style={{ marginTop: 6 }}>
                  <Badge tone={a.kind === 'central' ? 'accent' : 'ok'}>
                    {a.kind === 'central' ? 'Central' : 'Enabled'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="acct-meta-list">
              <div className="acct-meta-row">
                <span className="acct-meta-k">Account ID</span>
                <span className="acct-meta-v">{a.id}</span>
              </div>
              <div className="acct-meta-row">
                <span className="acct-meta-k">Cross-account role</span>
                <span className="acct-meta-v">
                  {a.kind === 'central'
                    ? 'LOCAL (lambda credentials)'
                    : `arn:aws:iam::${a.id}:role/EC2ControlCrossAccountRole-production`}
                </span>
              </div>
              <div className="acct-meta-row">
                <span className="acct-meta-k">Region</span>
                <span className="acct-meta-v">{a.region}</span>
              </div>
            </div>
            <div className="acct-actions">
              <Button size="xs" variant="ghost" icon="Activity">Test</Button>
              {a.kind !== 'central' && (
                <>
                  <Button size="xs" variant="ghost" icon="PauseCircle">Disable</Button>
                  <Button size="xs" variant="danger" icon="Trash2">Remove</Button>
                  <Button size="xs" variant="accent" icon="ExternalLink">Console login</Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
