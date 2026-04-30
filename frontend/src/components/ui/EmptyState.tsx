import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  icon?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function EmptyState({ icon = 'PackageOpen', title, description, actions }: Props) {
  return (
    <div className="empty">
      <div className="empty-ico">
        <Icon name={icon} size={22} />
      </div>
      <div className="empty-ti">{title}</div>
      {description && <div className="empty-sub">{description}</div>}
      {actions && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
