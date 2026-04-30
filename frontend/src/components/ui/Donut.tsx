interface Props {
  running: number;
  total: number;
  size?: number;
}

export function Donut({ running, total, size = 148 }: Props) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const pct = total ? running / total : 0;
  const offset = c * (1 - pct);
  return (
    <svg className="donut" viewBox="0 0 148 148" width={size} height={size} aria-hidden="true">
      <circle cx="74" cy="74" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle
        cx="74"
        cy="74"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="10"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 74 74)"
        style={{ transition: 'stroke-dashoffset .6s ease' }}
      />
      <text x="74" y="72" textAnchor="middle">
        {running}
      </text>
      <text x="74" y="92" textAnchor="middle" className="sub">
        Running
      </text>
    </svg>
  );
}
