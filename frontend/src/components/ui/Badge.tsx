import type { ReactNode } from 'react';

export type BadgeTone = 'ok' | 'err' | 'warn' | 'muted' | 'accent';

interface Props {
  tone?: BadgeTone;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Badge({ tone = 'muted', dot = false, children, className }: Props) {
  return (
    <span className={`badge badge-${tone} ${className ?? ''}`.trim()}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  state: 'running' | 'stopped' | 'pending' | string;
}

export function StatusBadge({ state }: StatusBadgeProps) {
  if (state === 'running') return <Badge tone="ok" dot>Running</Badge>;
  if (state === 'stopped') return <Badge tone="err" dot>Stopped</Badge>;
  if (state === 'pending') return <Badge tone="warn" dot>Pending</Badge>;
  return <Badge tone="muted" dot>{state}</Badge>;
}
