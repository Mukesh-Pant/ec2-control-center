import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'ghost' | 'accent' | 'danger' | 'ok';
export type ButtonSize = 'sm' | 'xs';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'ghost',
  size,
  icon,
  iconRight,
  children,
  className,
  type = 'button',
  ...rest
}: Props) {
  const cls = ['btn', `btn-${variant}`, size ? `btn-${size}` : '', className]
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'xs' ? 12 : 14;
  return (
    <button className={cls} type={type} {...rest}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}
