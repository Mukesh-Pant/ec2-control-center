import * as Lucide from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

type LucideIconProps = SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number };

/**
 * Lookup-by-name wrapper around lucide-react. NAV config and screen
 * data files store icon names as strings (e.g. "Server", "LayoutGrid")
 * so they survive serialization. This component resolves the name at
 * render time. Falls back to Lucide.Circle if the name is unknown.
 */
export function Icon({
  name,
  size = 16,
  strokeWidth = 1.5,
  ...rest
}: { name: string; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  const lib = Lucide as unknown as Record<string, ComponentType<LucideIconProps>>;
  const Component = (lib[name] ?? lib.Circle) as ComponentType<LucideIconProps>;
  return <Component size={size} strokeWidth={strokeWidth} {...rest} />;
}
