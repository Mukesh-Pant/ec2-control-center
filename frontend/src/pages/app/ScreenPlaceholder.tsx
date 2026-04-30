import type { ReactNode } from 'react';
import { Card, EmptyState, PageHeader } from '@/components/ui';

interface Props {
  eyebrow: string;
  title: string;
  sub: string;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDesc?: string;
  actions?: ReactNode;
}

/**
 * Placeholder used by every Phase 4 screen file. Shows the real page
 * header so the routing/sidebar/topbar all light up correctly. The
 * card body is replaced by a concrete implementation in Phase 5.
 */
export function ScreenPlaceholder({
  eyebrow,
  title,
  sub,
  emptyIcon = 'Wrench',
  emptyTitle = 'Coming in Phase 5',
  emptyDesc = 'This screen is wired into routing and the shell. The real implementation arrives in the next phase.',
  actions,
}: Props) {
  return (
    <div className="page">
      <PageHeader eyebrow={eyebrow} title={title} sub={sub} actions={actions} />
      <Card pad={false}>
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDesc} />
      </Card>
    </div>
  );
}
