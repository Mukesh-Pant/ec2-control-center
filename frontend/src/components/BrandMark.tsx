/**
 * The two-stacked-rectangles "OCU" logo glyph.
 * Reused by MarketingNav, MarketingFooter, Sidebar, and the Login page.
 */
export function BrandMark({
  size = 14,
  stroke = '#fff',
  strokeWidth = 1.6,
}: {
  size?: number;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="7" rx="1.5" />
      <rect x="3" y="14" width="18" height="7" rx="1.5" />
    </svg>
  );
}
