import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  /** When true (default), wraps children in card-body padding. */
  pad?: boolean;
  className?: string;
}

export function Card({ title, subtitle, action, children, pad = true, className = '' }: Props) {
  return (
    <div className={`card ${className}`.trim()}>
      {(title || action) && (
        <div className="card-hd">
          <div>
            {title && <div className="card-ti">{title}</div>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </div>
  );
}
