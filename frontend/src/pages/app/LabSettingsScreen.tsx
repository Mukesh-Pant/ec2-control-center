import { PageHeader } from '@/components/ui';
import { getRole } from '@/lib/auth';
import { Navigate } from 'react-router-dom';

export default function LabSettingsScreen() {
  const role = getRole();
  if (role !== 'admin') return <Navigate to="/app/instances" replace />;
  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="Lab Settings" sub="Pricing configuration and template management." />
      <p style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</p>
    </div>
  );
}
