// src/pages/app/MyServersScreen.tsx
import { useState } from 'react';
import { Button, PageHeader } from '@/components/ui';
import { getRole } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { LabWizard } from './labs/LabWizard';
import { LabList } from './labs/LabList';

export default function MyServersScreen() {
  const role = getRole();
  if (role === 'viewer' || role === 'none') return <Navigate to="/app/instances" replace />;

  const [showWizard, setShowWizard] = useState(false);

  const handleSubmitted = () => {
    // LabList auto-switches to pending bucket after a submit.
    // Wizard shows Step 4 confirmation; closing it returns to the list.
    setShowWizard(false);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Labs"
        title="My Servers"
        sub="Provision and manage your EC2 lab instances."
        actions={
          <Button
            icon={showWizard ? undefined : 'Plus'}
            variant={showWizard ? 'ghost' : 'primary'}
            size="sm"
            onClick={() => setShowWizard((v) => !v)}
          >
            {showWizard ? 'Cancel' : 'New Lab'}
          </Button>
        }
      />

      {showWizard && (
        <LabWizard
          onClose={() => setShowWizard(false)}
          onSubmitted={handleSubmitted}
        />
      )}

      <LabList />
    </div>
  );
}
