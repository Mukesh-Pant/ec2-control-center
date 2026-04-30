import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  label: string;
  icon?: string;
  value: ReactNode;
  unit?: ReactNode;
  meta?: ReactNode;
  delta?: string;
}

export function Stat({ label, icon, value, unit, meta, delta }: Props) {
  return (
    <div className="stat">
      <div className="stat-label">
        {icon && <Icon name={icon} />}
        {label}
      </div>
      <div className="stat-val">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {meta && (
        <div className="stat-meta">
          {delta && (
            <span className={`delta ${delta.startsWith('-') ? 'neg' : ''}`}>{delta}</span>
          )}
          {meta}
        </div>
      )}
    </div>
  );
}
