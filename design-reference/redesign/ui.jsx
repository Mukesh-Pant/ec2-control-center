/* global React, Lucide */
window.useState = React.useState;
window.useEffect = React.useEffect;
window.useCallback = React.useCallback;

// Safe icon — handles Lucide not-yet-loaded
function Icon({ name, size = 16, stroke = 1.5, ...rest }) {
  const L = window.Lucide;
  if (!L) return <span style={{display:'inline-block', width: size, height: size}} />;
  const C = L[name] || L.Circle;
  return <C size={size} strokeWidth={stroke} {...rest} />;
}

function Button({ variant = 'ghost', size, icon, iconRight, children, onClick, ...rest }) {
  const cls = ['btn', `btn-${variant}`, size ? `btn-${size}` : ''].filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onClick} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}

function Badge({ tone = 'muted', children, dot = false }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

function Card({ title, subtitle, action, children, pad = true, className = '' }) {
  return (
    <div className={`card ${className}`}>
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

function Stat({ label, icon, value, unit, meta, delta }) {
  return (
    <div className="stat">
      <div className="stat-label">{icon && <Icon name={icon} />}{label}</div>
      <div className="stat-val">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {meta && (
        <div className="stat-meta">
          {delta && <span className={`delta ${delta.startsWith('-') ? 'neg' : ''}`}>{delta}</span>}
          {meta}
        </div>
      )}
    </div>
  );
}

function PageHeader({ eyebrow, title, sub, actions }) {
  return (
    <div className="page-hd">
      <div className="page-hd-l">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-hd-r">{actions}</div>}
    </div>
  );
}

function StatusBadge({ state }) {
  if (state === 'running') return <Badge tone="ok" dot>Running</Badge>;
  if (state === 'stopped') return <Badge tone="err" dot>Stopped</Badge>;
  if (state === 'pending') return <Badge tone="warn" dot>Pending</Badge>;
  return <Badge tone="muted" dot>{state}</Badge>;
}

function Donut({ running, total, size = 148 }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const pct = total ? running / total : 0;
  const offset = c * (1 - pct);
  return (
    <svg className="donut" viewBox="0 0 148 148" width={size} height={size}>
      <circle cx="74" cy="74" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle cx="74" cy="74" r={r} fill="none" stroke="var(--accent)" strokeWidth="10"
              strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
              transform="rotate(-90 74 74)" style={{transition:'stroke-dashoffset .6s ease'}} />
      <text x="74" y="72" textAnchor="middle">{running}</text>
      <text x="74" y="92" textAnchor="middle" className="sub">Running</text>
    </svg>
  );
}

Object.assign(window, { Icon, Button, Badge, Card, Stat, PageHeader, StatusBadge, Donut });
