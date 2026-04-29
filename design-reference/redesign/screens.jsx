/* global React, Icon, Button, Badge, Card, Stat, PageHeader, StatusBadge, Donut, DATA */

// ═══ Dashboard ═══
function DashboardScreen() {
  const inst = DATA.INSTANCES;
  const running = inst.filter(i => i.state === 'running').length;
  const stopped = inst.filter(i => i.state === 'stopped').length;
  const cost = inst.reduce((s,i)=>s+i.cost, 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fleet overview"
        title="Dashboard"
        sub="Real-time fleet overview across every linked AWS account. Updated continuously."
        actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>}
      />

      <div className="stats">
        <Stat label="Total instances" icon="Server" value={inst.length} meta="across 2 accounts" />
        <Stat label="Running now"     icon="Play"   value={running} meta={`${Math.round(running/inst.length*100)}% of fleet active`} delta="+1" />
        <Stat label="Stopped"         icon="Square" value={stopped} meta="idle · no cost accruing" />
        <Stat label="Est. monthly cost" icon="DollarSign" value={`$${cost.toFixed(2)}`} unit="USD" meta="running fleet projection" />
      </div>

      <div className="grid-2">
        <Card
          title="Fleet · Quick Control"
          subtitle={`${inst.length} instances · ${running} running · $${(cost/inst.length/30).toFixed(4)} /hr accumulated`}
          pad={false}
          action={<Button variant="ghost" size="sm" iconRight="ArrowUpRight">View all</Button>}
        >
          {inst.map(i => (
            <div className="fleet-row" key={i.id}>
              <div>
                <div className="fleet-name">{i.name}</div>
                <div className="fleet-meta">{i.account} · {i.region} · {i.type}</div>
              </div>
              <StatusBadge state={i.state} />
              <div className="fleet-actions">
                <Button variant="ok" size="xs" icon="Play">Start</Button>
                <Button variant="danger" size="xs" icon="Square">Stop</Button>
              </div>
              <Button variant="ghost" size="xs" icon="ChevronRight" />
            </div>
          ))}
        </Card>

        <Card title="Quick actions" subtitle="Jump to the most-used workflows" pad={false}>
          <div className="qa-grid">
            {[
              {id:'instances', icon:'Server',          tone:'blue',   ti:'Instances',  sub:'Start, stop & inspect'},
              {id:'servers',   icon:'Monitor',         tone:'teal',   ti:'My Servers', sub:'Provision lab servers'},
              {id:'billing',   icon:'Receipt',         tone:'amber',  ti:'Billing',    sub:'Cost & usage estimates'},
              {id:'backups',   icon:'HardDriveUpload', tone:'forest', ti:'Backups',    sub:'Snapshots & restores'},
              {id:'audit',     icon:'ScrollText',      tone:'violet', ti:'Audit Log',  sub:'Full action history'},
              {id:'analytics', icon:'Activity',        tone:'rose',   ti:'Analytics',  sub:'Usage & fleet health'},
            ].map(qa => (
              <button key={qa.id} className="qa" data-tone={qa.tone}>
                <span className="qa-glow" />
                <div className="qa-ico"><Icon name={qa.icon} size={20} /></div>
                <div className="qa-ti">{qa.ti}</div>
                <div className="qa-sub">{qa.sub}</div>
                <span className="qa-arrow"><Icon name="ArrowUpRight" size={14} /></span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ═══ Instances ═══
function InstancesScreen() {
  const grouped = DATA.INSTANCES.reduce((a, i) => {
    (a[i.account] = a[i.account] || []).push(i); return a;
  }, {});
  return (
    <div className="page">
      <PageHeader
        eyebrow="Fleet"
        title="Instances"
        sub="Servers grouped by account — click any row to inspect and control."
        actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh all</Button>}
      />
      {Object.entries(grouped).map(([acct, rows]) => (
        <Card
          key={acct}
          title={acct}
          subtitle={DATA.ACCOUNTS.find(a=>a.name===acct)?.id}
          action={<Button variant="ghost" size="sm" icon="ExternalLink">Console</Button>}
          pad={false}
          className="mb-gap"
        >
          <table className="tbl">
            <thead><tr>
              <th>Name</th><th>Instance ID</th><th>Type</th><th>State</th><th>Region</th><th>Public IP</th>
            </tr></thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id}>
                  <td className="strong">{i.name}</td>
                  <td className="mono">{i.id}</td>
                  <td className="mono">{i.type}</td>
                  <td><StatusBadge state={i.state} /></td>
                  <td className="mono">{i.region}</td>
                  <td className="mono">{i.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

// ═══ My Servers ═══
function MyServersScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Provisioning"
        title="My Servers"
        sub="Provision and manage dedicated cloud servers — ready when you are."
        actions={<>
          <Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>
          <Button icon="Plus" variant="primary" size="sm">Create server</Button>
        </>}
      />

      <div className="hero-banner">
        <div>
          <div className="hero-eyebrow">My servers · ap-south-1</div>
          <h2 className="hero-title">Cloud servers, instantly.</h2>
          <p className="hero-sub">Production-grade servers on AWS — billed transparently, managed centrally. Choose a ready-made stack or configure manually with clear pricing and secure setup.</p>
          <div style={{marginTop:24, display:'flex', gap:10, position:'relative'}}>
            <Button variant="accent" icon="Plus" size="sm">Create your server</Button>
            <Button variant="ghost" icon="LayoutTemplate" size="sm">Browse templates</Button>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="hero-stat-val">0</div><div className="hero-stat-lbl">Running</div></div>
          <div className="hero-stat"><div className="hero-stat-val">—</div><div className="hero-stat-lbl">Monthly spend</div></div>
          <div className="hero-stat"><div className="hero-stat-val">99.9%</div><div className="hero-stat-lbl">Uptime SLA</div></div>
        </div>
      </div>

      <div className="section-hd">
        <div>
          <div className="section-ti">Quick launch</div>
          <div className="section-sub">Pre-configured templates with real AWS ap-south-1 pricing.</div>
        </div>
        <Button variant="ghost" size="sm" iconRight="ArrowUpRight">All templates</Button>
      </div>

      <div className="grid-3">
        {DATA.TEMPLATES.map(t => (
          <div className="tpl-card" key={t.id}>
            <div className="tpl-head">
              <div className="tpl-ico"><Icon name={t.icon} /></div>
              <div className="tpl-tag">{t.tag}</div>
            </div>
            <div>
              <div className="tpl-name">{t.name}</div>
              <div className="tpl-desc" style={{marginTop:8}}>{t.desc}</div>
            </div>
            <div className="tpl-specs">
              <span className="tpl-spec"><Icon name="Cpu" />{t.cpu} vCPU</span>
              <span className="tpl-spec"><Icon name="MemoryStick" />{t.ram}</span>
              <span className="tpl-spec"><Icon name="HardDrive" />{t.disk}</span>
              {t.stack.slice(0,3).map(s => <span className="tpl-spec" key={s}>{s}</span>)}
            </div>
            <div className="tpl-price">
              <div>
                <div className="tpl-price-amt">NPR {t.price.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                <div className="tpl-price-hint">Monthly estimate · taxes & services apply</div>
              </div>
              <div style={{marginLeft:'auto'}}>
                <Button variant="ghost" size="sm" icon="ArrowRight">Launch</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ Analytics ═══
function AnalyticsScreen() {
  const inst = DATA.INSTANCES;
  const running = inst.filter(i => i.state === 'running').length;
  const stopped = inst.filter(i => i.state === 'stopped').length;
  return (
    <div className="page">
      <PageHeader eyebrow="Intelligence" title="Analytics" sub="Usage patterns, fleet health, and activity intelligence." actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>} />

      <div className="stats">
        <Stat label="Total actions · 30d" icon="Activity" value="90" meta="all logged events" />
        <Stat label="Server starts" icon="Play" value="25" meta="power-on events" />
        <Stat label="Server stops" icon="Square" value="40" meta="shutdown events" />
        <Stat label="Monthly projection" icon="DollarSign" value="$29.95" unit="USD" meta="running fleet estimate" />
      </div>

      <div className="grid-2" style={{marginBottom:'var(--gap)'}}>
        <Card title="Fleet health" subtitle={`${running} / ${inst.length} running`} pad={false}>
          <div className="chart-row">
            <Donut running={running} total={inst.length} />
            <div className="legend" style={{flex:1}}>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{background:'var(--accent)'}} /> Running</div>
                <div className="legend-n">{running}</div>
              </div>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{background:'var(--line-2)'}} /> Stopped</div>
                <div className="legend-n">{stopped}</div>
              </div>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{background:'var(--ink-5)'}} /> Other</div>
                <div className="legend-n">0</div>
              </div>
            </div>
          </div>
        </Card>
        <Card title="Cost by account" subtitle="Current month · estimated" pad={false}>
          <div style={{padding:'var(--pad)'}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:10}}>
              <span style={{fontSize:13, color:'var(--ink-2)'}}>Central Account</span>
              <span style={{fontFamily:'var(--f-mono)', fontSize:13, color:'var(--ink)', fontVariantNumeric:'tabular-nums'}}>$29.95</span>
            </div>
            <div style={{height:6, background:'var(--surface-2)', borderRadius:3, overflow:'hidden'}}>
              <div style={{height:'100%', width:'100%', background:'var(--accent)', borderRadius:3}} />
            </div>
            <div style={{marginTop:24, display:'flex', justifyContent:'space-between', marginBottom:10}}>
              <span style={{fontSize:13, color:'var(--ink-2)'}}>Mukesh-Testing</span>
              <span style={{fontFamily:'var(--f-mono)', fontSize:13, color:'var(--ink)', fontVariantNumeric:'tabular-nums'}}>$0.00</span>
            </div>
            <div style={{height:6, background:'var(--surface-2)', borderRadius:3, overflow:'hidden'}}>
              <div style={{height:'100%', width:'0%', background:'var(--accent)', borderRadius:3}} />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Instance type breakdown" subtitle="3 types observed" pad={false}>
        <div style={{padding:'var(--pad)', display:'flex', gap:10, flexWrap:'wrap'}}>
          {['t2.micro','m6i.xlarge','t3.medium'].map(t => (
            <div key={t} style={{padding:'14px 18px', border:'1px solid var(--line)', borderRadius:'var(--r)', background:'var(--bg)'}}>
              <div style={{fontFamily:'var(--f-mono)', fontSize:12.5, color:'var(--ink)'}}>{t}</div>
              <div style={{fontSize:10, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--ink-3)', marginTop:4}}>1 instance</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ═══ Audit Log ═══
function AuditScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="History" title="Audit Log" sub="Complete history — every action, every user, every server. Filterable by any dimension." actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>} />

      <Card pad={false}>
        <div className="filter-bar">
          <div className="field"><label className="field-label">Search</label>
            <div className="inp-group"><span className="inp-ico"><Icon name="Search" size={14} /></span><input className="inp" placeholder="Instance ID or name…" /></div>
          </div>
          <div className="field"><label className="field-label">User</label><input className="inp" placeholder="User email" /></div>
          <div className="field"><label className="field-label">Action</label><select className="inp"><option>All actions</option><option>Start</option><option>Stop</option></select></div>
          <div className="field"><label className="field-label">Account</label><select className="inp"><option>All accounts</option></select></div>
          <div className="field" style={{justifyContent:'flex-end'}}><Button variant="ghost" size="sm" icon="X">Clear</Button></div>
        </div>
        <table className="tbl">
          <thead><tr>
            <th>Timestamp</th><th>Action</th><th>Instance</th><th>Type</th><th>Account</th><th>Region</th><th>User</th>
          </tr></thead>
          <tbody>
            {DATA.AUDIT.map((r,i) => (
              <tr key={i}>
                <td className="mono">{r.ts}</td>
                <td><span className={`action-chip ${r.action}`}>{r.action}</span></td>
                <td><div className="strong" style={{color:'var(--ink)'}}>{r.instance}</div><div className="mono" style={{color:'var(--ink-4)'}}>{r.iid}</div></td>
                <td className="mono">{r.type}</td>
                <td className="mono">{r.account}</td>
                <td className="mono">{r.region}</td>
                <td style={{fontSize:12.5, color:'var(--ink-2)'}}>{r.user}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{padding:'16px var(--pad)', display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'1px solid var(--line)', fontSize:12, color:'var(--ink-3)'}}>
          <span>Page 1 of 5 · 50 loaded</span>
          <div style={{display:'flex', gap:8}}>
            <Button variant="ghost" size="xs" icon="ChevronLeft">Prev</Button>
            <Button variant="ghost" size="xs" iconRight="ChevronRight">Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ═══ Vendors ═══
function VendorsScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="Finance" title="Vendors" sub="Services and tools we pay for." actions={<Button icon="Plus" variant="primary" size="sm">Add vendor</Button>} />
      <div className="stats">
        <Stat label="Monthly payables" icon="DollarSign" value="NPR 0" meta="recurring vendors only" />
        <Stat label="Active vendors" icon="CheckCircle2" value="0" meta="including expiring soon" />
        <Stat label="Expiring / expired" icon="AlertCircle" value="0" meta="needs attention" />
        <Stat label="Irregular vendors" icon="Activity" value="0" meta="variable / unscheduled" />
      </div>
      <Card pad={false}>
        <div className="filter-bar">
          <div className="field"><label className="field-label">Search</label><div className="inp-group"><span className="inp-ico"><Icon name="Search" size={14} /></span><input className="inp" placeholder="Name or category…" /></div></div>
          <div className="field"><label className="field-label">Status</label><select className="inp"><option>All statuses</option></select></div>
          <div className="field"><label className="field-label">Billing</label><select className="inp"><option>All types</option></select></div>
          <div className="field"><label className="field-label">Currency</label><select className="inp"><option>All currencies</option></select></div>
          <div className="field" style={{justifyContent:'flex-end'}}></div>
        </div>
        <div className="empty">
          <div className="empty-ico"><Icon name="PackageOpen" size={22} /></div>
          <div className="empty-ti">No vendors yet</div>
          <div className="empty-sub">Track the services and tools your company pays for. Add your first vendor to see monthly payables and renewal alerts here.</div>
          <Button variant="primary" size="sm" icon="Plus">Add your first vendor</Button>
        </div>
      </Card>
    </div>
  );
}

// ═══ Finance settings ═══
function FinSettingsScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="Configuration" title="Finance Settings" sub="Exchange rates, tax management, and finance alert defaults." />
      <Card title="Exchange rates" subtitle="Used across billing, vendors, and customers">
        <div className="grid-2" style={{gap:20}}>
          <div className="field"><label className="field-label">USD → NPR rate</label><input className="inp" defaultValue="135" /><div style={{fontSize:11, color:'var(--ink-4)'}}>1 USD ≈ NPR 140 (live)</div></div>
          <div className="field"><label className="field-label">INR → NPR rate</label><input className="inp" defaultValue="1.62" /></div>
        </div>
        <div style={{height:20}} />
        <div className="grid-2" style={{gap:20}}>
          <div className="field"><label className="field-label">Contract expiry warning (days)</label><input className="inp" defaultValue="30" /></div>
          <div className="field"><label className="field-label">Payment due warning (days)</label><input className="inp" defaultValue="7" /></div>
        </div>
        <div style={{height:20}} />
        <div className="field" style={{maxWidth:320}}><label className="field-label">Default currency</label><select className="inp"><option>USD — US Dollar</option></select></div>
        <div style={{marginTop:24, display:'flex', justifyContent:'flex-end'}}><Button variant="primary" size="sm" icon="Save">Save settings</Button></div>
      </Card>
      <div style={{height:24}} />
      <Card title="Tax management · per account" subtitle="Override global rates per customer account. Rebate is applied to the final price and shown as a discount line item." pad={false}>
        <table className="tbl">
          <thead><tr><th>Account</th><th className="num">WHT % (global 16.0%)</th><th className="num">VAT % (global 13.0%)</th><th className="num">Margin % (global 12.0%)</th><th className="num">Rebate %</th><th></th></tr></thead>
          <tbody>
            {DATA.ACCOUNTS.map(a => (
              <tr key={a.id}>
                <td><div className="strong" style={{color:'var(--ink)'}}>{a.id}</div><div className="mono" style={{color:'var(--ink-4)'}}>{a.name}</div></td>
                <td className="num mono">Use global</td>
                <td className="num mono">Use global</td>
                <td className="num mono">Use global</td>
                <td className="num mono">0</td>
                <td style={{textAlign:'right'}}><Button variant="ghost" size="xs">Apply</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ═══ Accounts ═══
function AccountsScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="Accounts" sub="AWS accounts managed by this portal — each with a cross-account IAM role." actions={<>
        <Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>
        <Button icon="Plus" variant="primary" size="sm">Add account</Button>
      </>} />

      <div className="info-banner">
        <Icon name="ShieldCheck" />
        <div>
          <div className="info-banner-ti">Access control</div>
          <div className="info-banner-body">
            Admin users see this Accounts page and can add / remove linked AWS accounts. <strong>Admin</strong> · full control — link/remove accounts, start/stop any instance. <strong>Member</strong> · view and control instances, analytics, audit — cannot manage accounts.
          </div>
        </div>
      </div>

      <div className="grid-2">
        {DATA.ACCOUNTS.map(a => (
          <div key={a.id} className="card acct-card">
            <div className="acct-hd">
              <div>
                <div className="acct-name">{a.kind === 'central' && <Icon name="Star" />}{a.name}</div>
                <div style={{marginTop:6}}><Badge tone={a.kind==='central'?'accent':'ok'}>{a.kind === 'central' ? 'Central' : 'Enabled'}</Badge></div>
              </div>
            </div>
            <div className="acct-meta-list">
              <div className="acct-meta-row"><span className="acct-meta-k">Account ID</span><span className="acct-meta-v">{a.id}</span></div>
              <div className="acct-meta-row"><span className="acct-meta-k">Cross-account role</span><span className="acct-meta-v">{a.kind === 'central' ? 'LOCAL (lambda credentials)' : `arn:aws:iam::${a.id}:role/EC2ControlCrossAccountRole-production`}</span></div>
              <div className="acct-meta-row"><span className="acct-meta-k">Region</span><span className="acct-meta-v">{a.region}</span></div>
            </div>
            <div className="acct-actions">
              <Button size="xs" variant="ghost" icon="Activity">Test</Button>
              {a.kind !== 'central' && <>
                <Button size="xs" variant="ghost" icon="PauseCircle">Disable</Button>
                <Button size="xs" variant="danger" icon="Trash2">Remove</Button>
                <Button size="xs" variant="accent" icon="ExternalLink">Console login</Button>
              </>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ Users ═══
function UsersScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="Users" sub="Manage user roles and per-account access permissions." actions={<Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>} />
      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Account access</th><th>Change role</th></tr></thead>
          <tbody>
            {DATA.USERS.map(u => (
              <tr key={u.email}>
                <td className="strong">{u.email}</td>
                <td><Badge tone={u.role === 'admin' ? 'accent' : 'muted'}>{u.role}</Badge></td>
                <td><Badge tone="ok" dot>{u.status}</Badge></td>
                <td style={{fontSize:12, color:'var(--ink-2)', fontFamily:'var(--f-mono)'}}>{u.access}</td>
                <td>
                  <div style={{display:'flex', gap:6, alignItems:'center'}}>
                    <select className="inp" style={{height:30, fontSize:12, width:180}}>
                      <option>{u.role === 'admin' ? 'Admin (full access)' : 'Operator (start/stop)'}</option>
                    </select>
                    <Button size="xs" variant="accent">Apply</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ═══ Billing ═══
function BillingScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="Intelligence" title="Billing & Cost" sub="Transparent, per-account cost accounting with monthly projections." actions={<Button icon="Download" variant="ghost" size="sm">Export CSV</Button>} />
      <div className="stats">
        <Stat label="Month to date" icon="DollarSign" value="$29.95" unit="USD" meta="projected end-of-month" />
        <Stat label="Running rate" icon="Activity" value="$0.0416" unit="/hr" meta="1 running instance" />
        <Stat label="Last month" icon="Calendar" value="$42.18" unit="USD" meta="delta" delta="-29%" />
        <Stat label="Forecast · 30d" icon="TrendingUp" value="$31.00" unit="est." meta="based on last 7 days" />
      </div>
      <Card title="Cost by instance" subtitle="Current month" pad={false}>
        <table className="tbl">
          <thead><tr><th>Instance</th><th>Account</th><th>Type</th><th className="num">Hours</th><th className="num">Rate</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {DATA.INSTANCES.map(i => (
              <tr key={i.id}>
                <td className="strong">{i.name}</td>
                <td style={{fontSize:12.5, color:'var(--ink-2)'}}>{i.account}</td>
                <td className="mono">{i.type}</td>
                <td className="num mono">{i.state==='running' ? '720' : '0'}</td>
                <td className="num mono">${(i.cost/720).toFixed(4)}</td>
                <td className="num strong">${i.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ═══ Backups ═══
function BackupsScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="Protection" title="Backups" sub="Snapshots and restores across your fleet." actions={<Button icon="Plus" variant="primary" size="sm">Create snapshot</Button>} />
      <Card pad={false}>
        <div className="empty">
          <div className="empty-ico"><Icon name="HardDriveUpload" size={22} /></div>
          <div className="empty-ti">No snapshots yet</div>
          <div className="empty-sub">Automated snapshots protect your instances against data loss. Enable a policy or create your first manual snapshot.</div>
          <div style={{display:'flex', gap:10}}>
            <Button variant="primary" size="sm" icon="Plus">Create snapshot</Button>
            <Button variant="ghost" size="sm" icon="Settings">Configure policy</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ═══ Customers ═══
function CustomersScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="Finance" title="Customers" sub="Clients, contracts, and billing relationships." actions={<Button icon="Plus" variant="primary" size="sm">Add customer</Button>} />
      <div className="stats">
        <Stat label="Active customers" icon="Users" value="0" meta="signed & billable" />
        <Stat label="Contract value" icon="FileText" value="NPR 0" meta="total booked" />
        <Stat label="Outstanding" icon="Clock" value="NPR 0" meta="invoices pending" />
        <Stat label="Expiring · 30d" icon="AlertCircle" value="0" meta="needs renewal" />
      </div>
      <Card pad={false}>
        <div className="empty">
          <div className="empty-ico"><Icon name="Users" size={22} /></div>
          <div className="empty-ti">No customers yet</div>
          <div className="empty-sub">Track clients and contracts here. Contract value, payment milestones, and renewal alerts appear once you add your first customer.</div>
          <Button variant="primary" size="sm" icon="Plus">Add your first customer</Button>
        </div>
      </Card>
    </div>
  );
}

// ═══ Alerts ═══
function AlertsScreen() {
  return (
    <div className="page">
      <PageHeader eyebrow="Finance" title="Alerts & Notifications" sub="Contract expirations, payment reminders, and cost anomalies." />
      <Card pad={false}>
        <div className="empty">
          <div className="empty-ico"><Icon name="BellOff" size={22} /></div>
          <div className="empty-ti">Nothing needs your attention</div>
          <div className="empty-sub">Alerts appear here when contracts are about to expire, payments are overdue, or cost anomalies are detected.</div>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, {
  DashboardScreen, InstancesScreen, MyServersScreen, AnalyticsScreen, AuditScreen,
  VendorsScreen, FinSettingsScreen, AccountsScreen, UsersScreen, BillingScreen,
  BackupsScreen, CustomersScreen, AlertsScreen
});
