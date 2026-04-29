/* global React, Icon, DATA */


function Sidebar({ page, onNav, onHome, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sb-brand" style={{cursor:'pointer'}} onClick={onHome}>
        <div className="sb-mark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="7" rx="1.5" />
            <rect x="3" y="14" width="18" height="7" rx="1.5" />
          </svg>
        </div>
        <div>
          <div className="sb-name">One Cloud Utopia</div>
          <div className="sb-tag">Multi-Account Portal</div>
        </div>
      </div>

      {DATA.NAV.map(group => (
        <React.Fragment key={group.section}>
          <div className="sb-section">{group.section}</div>
          <nav className="sb-nav">
            {group.items.map(it => (
              <a key={it.id}
                 className={`nav-item ${page === it.id ? 'on' : ''}`}
                 onClick={() => onNav(it.id)}>
                <Icon name={it.icon} />
                <span>{it.label}</span>
                {it.count ? <span className="nav-count">{it.count}</span> : null}
              </a>
            ))}
          </nav>
        </React.Fragment>
      ))}

      <div className="sb-foot">
        <div className="sb-user">
          <div className="sb-avatar">P</div>
          <div className="sb-user-info">
            <div className="sb-user-name">pantm8877@gmail.com</div>
            <div className="sb-user-role">Admin</div>
          </div>
          <button className="sb-user-menu" title="Account menu"><Icon name="ChevronUp" size={14} /></button>
        </div>
        <button className="sb-logout" onClick={onLogout}>
          <Icon name="LogOut" size={15} />
          <span>Sign out</span>
          <span className="sb-logout-kbd">⌘⇧Q</span>
        </button>
      </div>
    </aside>
  );
}

function Topbar({ page, onHome }) {
  const titles = {
    dashboard: 'Dashboard', instances: 'Instances', servers: 'My Servers',
    backups: 'Backups', billing: 'Billing & Cost', analytics: 'Analytics',
    audit: 'Audit Log', vendors: 'Vendors', customers: 'Customers',
    alerts: 'Alerts', finsettings: 'Finance Settings', accounts: 'Accounts', users: 'Users'
  };
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  const hh = String(time.getHours()).padStart(2,'0');
  const mm = String(time.getMinutes()).padStart(2,'0');
  const ss = String(time.getSeconds()).padStart(2,'0');

  return (
    <div className="topbar">
      <div className="crumb">
        <span style={{cursor:'pointer'}} onClick={onHome}>One Cloud Utopia</span>
        <span className="sep">/</span>
        <span className="cur">{titles[page] || page}</span>
      </div>
      <div className="tb-spacer" />
      <div className="tb-chip"><Icon name="DollarSign" />$29.95<span style={{color:'var(--ink-4)'}}>/mo</span></div>
      <div className="tb-chip"><Icon name="Clock" />Session<strong>45:46</strong></div>
      <button className="tb-icon-btn"><Icon name="Bell" /><span className="dot" /></button>
      <button className="tb-icon-btn"><Icon name="Search" /></button>
      <div className="tb-chip" style={{fontFamily:'var(--f-mono)'}}>{hh}:{mm}:{ss}</div>
    </div>
  );
}

function TweaksPanel({ tweaks, setTweaks, view, setView, onClose }) {
  const set = (k, v) => setTweaks(t => ({ ...t, [k]: v }));
  const Seg = ({ k, opts, value, onChange }) => (
    <div className="seg">
      {opts.map(o => <button key={o} className={(value !== undefined ? value : tweaks[k])===o?'on':''} onClick={() => onChange ? onChange(o) : set(k, o)}>{o}</button>)}
    </div>
  );
  return (
    <div className="tweaks-panel">
      <div className="tweaks-hd">
        <div className="tweaks-ti">Tweaks</div>
        <button className="tb-icon-btn" style={{width:28, height:28}} onClick={onClose}><Icon name="X" size={14} /></button>
      </div>
      <div className="tweak-group">
        <label className="tweak-label">View</label>
        <Seg opts={['landing','login','app']} value={view} onChange={setView} />
      </div>
      <div className="tweak-group">
        <label className="tweak-label">Theme</label>
        <Seg k="theme" opts={['light','dark']} />
      </div>
      <div className="tweak-group">
        <label className="tweak-label">Density</label>
        <Seg k="density" opts={['airy','balanced','compact']} />
      </div>
      <div className="tweak-group">
        <label className="tweak-label">Sidebar</label>
        <Seg k="sidebarStyle" opts={['full','rail']} />
      </div>
      <div className="tweak-group">
        <label className="tweak-label">Font</label>
        <Seg k="font" opts={['inter','manrope','plex']} />
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, TweaksPanel });
