/* global React, Icon */

function MarketingNav({ onLaunch }) {
  return (
    <nav className="mnav">
      <div className="mnav-brand">
        <div className="mnav-mark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6">
            <rect x="3" y="3" width="18" height="7" rx="1.5" />
            <rect x="3" y="14" width="18" height="7" rx="1.5" />
          </svg>
        </div>
        One Cloud Utopia
      </div>
      <div className="mnav-links">
        <a href="#product">Product</a>
        <a href="#features">Features</a>
        <a href="#preview">Preview</a>
        <a href="#pricing">Pricing</a>
        <a href="#docs">Docs</a>
      </div>
      <div className="mnav-spacer" />
      <a className="mnav-cta ghost" onClick={onLaunch}>Sign in</a>
      <a className="mnav-cta solid" onClick={onLaunch}>Open dashboard <Icon name="ArrowRight" size={14} /></a>
    </nav>
  );
}

function HeroPreviewCard() {
  return (
    <div className="hero-stage">
      <div className="hero-orb" />
      <div className="hero-orb b" />
      <div className="hero-card main">
        <div className="hc-bar">
          <span className="hc-dot live" /><span className="hc-dot" /><span className="hc-dot" />
          <span className="hc-title">Fleet · live</span>
        </div>
        <div className="hc-stat-grid">
          <div className="hc-stat"><div className="hc-stat-l">Running</div><div className="hc-stat-v">12</div><div className="hc-stat-d">+2 today</div></div>
          <div className="hc-stat"><div className="hc-stat-l">MTD spend</div><div className="hc-stat-v">$1,847</div><div className="hc-stat-d">-29% MoM</div></div>
        </div>
        <div className="hc-row">
          <div><div className="name">api-gateway-prod</div><div className="meta">i-076355d8 · t3.medium</div></div>
          <span className="hc-pill run"><span style={{width:5,height:5,borderRadius:'50%',background:'currentColor'}} />live</span>
        </div>
        <div className="hc-row">
          <div><div className="name">analytics-worker-01</div><div className="meta">i-3ebdbd9c · m6i.xlarge</div></div>
          <span className="hc-pill run"><span style={{width:5,height:5,borderRadius:'50%',background:'currentColor'}} />live</span>
        </div>
        <div className="hc-row">
          <div><div className="name">batch-render-eu</div><div className="meta">i-0875bff1 · c6i.large</div></div>
          <span className="hc-pill stop">stopped</span>
        </div>
        <div className="hc-spark">
          {[40,55,42,68,75,58,72,85,68,90,78,95].map((h,i) => <span key={i} style={{height:h+'%'}} />)}
        </div>
      </div>
      <div className="hero-card float-1">
        <div className="hc-bar"><span className="hc-dot live" /><span className="hc-title">Cost · last 30d</span></div>
        <div style={{fontFamily:'var(--f-display)', fontSize:32, fontWeight:700, color:'#fff', letterSpacing:'-.02em'}}>$1,847</div>
        <div style={{fontSize:11, color:'rgba(232,238,255,.55)', marginTop:4}}>vs $2,612 last month</div>
        <div style={{display:'flex', gap:2, marginTop:8, height:18}}>
          {[35,42,28,55,48,60,52,38,65,72,58,80].map((h,i) => <div key={i} style={{flex:1, height:h+'%', background:'rgba(110,163,255,.4)', alignSelf:'flex-end', borderRadius:1}} />)}
        </div>
      </div>
      <div className="hero-card float-2">
        <div className="hc-bar"><span className="hc-dot" style={{background:'#10b981'}} /><span className="hc-title">Audit · just now</span></div>
        <div style={{fontSize:11.5, color:'rgba(232,238,255,.85)', lineHeight:1.5}}>
          <strong style={{color:'#fff'}}>kandelmahesh39</strong> started <span style={{fontFamily:'var(--f-mono)', color:'#6ea3ff'}}>Navigator_Web</span>
        </div>
        <div style={{fontSize:10, color:'rgba(232,238,255,.45)', marginTop:6, fontFamily:'var(--f-mono)'}}>14:15:35 · ap-south-1</div>
      </div>
    </div>
  );
}

function LandingPage({ onLaunch }) {
  // Pointer parallax for bento cells
  React.useEffect(() => {
    const cells = document.querySelectorAll('.bento-cell');
    const handler = (e) => {
      cells.forEach(c => {
        const r = c.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * 100;
        const my = ((e.clientY - r.top) / r.height) * 100;
        c.style.setProperty('--mx', mx + '%');
        c.style.setProperty('--my', my + '%');
      });
    };
    window.addEventListener('mousemove', handler);
    // Reveal on scroll
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => en.isIntersecting && en.target.classList.add('in'));
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    return () => { window.removeEventListener('mousemove', handler); io.disconnect(); };
  }, []);

  return (
    <div className="landing">
      <MarketingNav onLaunch={onLaunch} />

      {/* HERO */}
      <section className="hero" id="product">
        <div>
          <div className="hero-eyebrow"><span className="pulse" />Now in production · v2.4</div>
          <h1>
            <span className="grad">Your cloud,</span><br />
            <span className="grad">unified.</span><br />
            <span className="accent">Simplified.</span>
          </h1>
          <p className="hero-lead">
            Start, stop, and monitor every EC2 instance across every AWS account from a single, dimensional control plane. Built for teams who refuse to console-hop.
          </p>
          <div className="hero-cta-row">
            <a className="hero-cta primary" onClick={onLaunch}>Open dashboard <Icon name="ArrowRight" size={16} /></a>
            <a className="hero-cta ghost"><Icon name="PlayCircle" size={16} />Watch the tour</a>
          </div>
          <div className="hero-trust">
            <div className="dots"><span /><span /><span /><span /></div>
            <span>Trusted by teams managing <strong style={{color:'#fff'}}>14,000+</strong> instances across 6 regions</span>
          </div>
        </div>
        <HeroPreviewCard />
      </section>

      {/* LOGOS */}
      <section className="logos-strip">
        <div className="logos-label">Powering cloud teams from</div>
        <div className="logos-row">
          <div className="logo-mark"><span className="ico" />Cloudmandap</div>
          <div className="logo-mark"><span className="ico" />Navigator</div>
          <div className="logo-mark"><span className="ico" />Aaveg</div>
          <div className="logo-mark"><span className="ico" />Pathway</div>
          <div className="logo-mark"><span className="ico" />Ostara</div>
          <div className="logo-mark"><span className="ico" />Oracle Lab</div>
        </div>
      </section>

      {/* BENTO FEATURES */}
      <section className="section reveal" id="features">
        <div className="section-eyebrow">Built for the long haul</div>
        <h2><span className="grad">A control plane that respects</span> your time, your fleet, and your wallet.</h2>
        <p className="section-lead">Six capabilities, one canvas. Every screen designed to surface signal — and bury the noise that AWS leaves behind.</p>

        <div className="bento">
          <div className="bento-cell span-3 row-2">
            <div className="bento-ico"><Icon name="Server" /></div>
            <div className="bento-ti">Multi-account fleet control</div>
            <div className="bento-desc">Start, stop, and inspect instances across every linked AWS account from one screen. Cross-account IAM roles handle the auth — you handle the strategy.</div>
            <div className="bento-visual">
              <div style={{display:'grid', gap:8}}>
                {['Central Account · 976792586566','Mukesh-Testing · 196750375951','Production-EU · 482910385771'].map(a => (
                  <div key={a} style={{padding:'12px 14px', background:'rgba(110,163,255,.05)', border:'1px solid rgba(110,163,255,.12)', borderRadius:8, fontSize:11.5, fontFamily:'var(--f-mono)', color:'rgba(232,238,255,.7)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span>{a}</span>
                    <span style={{display:'inline-flex', alignItems:'center', gap:5, color:'#10b981', fontSize:10, fontWeight:600, letterSpacing:'.05em'}}>
                      <span style={{width:5, height:5, borderRadius:'50%', background:'#10b981', boxShadow:'0 0 8px #10b981'}} />ENABLED
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bento-cell span-3">
            <div className="bento-ico"><Icon name="DollarSign" /></div>
            <div className="bento-ti">Real-time cost intelligence</div>
            <div className="bento-desc">Per-account, per-instance, per-hour. NPR / USD / multi-currency with live FX and forecast.</div>
            <div className="bento-visual">
              <div style={{display:'flex', alignItems:'flex-end', gap:4, height:60}}>
                {[40,55,42,68,75,58,72,85,68,90,78,95,82,88,72].map((h,i) => (
                  <div key={i} style={{flex:1, height:h+'%', background:`linear-gradient(180deg, rgba(59,127,255,${.4 + h/200}), rgba(59,127,255,.1))`, borderRadius:'2px 2px 0 0'}} />
                ))}
              </div>
            </div>
          </div>

          <div className="bento-cell span-3">
            <div className="bento-ico"><Icon name="ScrollText" /></div>
            <div className="bento-ti">Tamper-proof audit trail</div>
            <div className="bento-desc">Every action — every user, every account, every server. Filter by any dimension. Export anywhere.</div>
            <div className="bento-visual">
              <div style={{fontFamily:'var(--f-mono)', fontSize:10.5, color:'rgba(232,238,255,.6)', lineHeight:1.7}}>
                <div><span style={{color:'#10b981'}}>start</span> · Navigator_Web · 14:15</div>
                <div><span style={{color:'#ef4444'}}>stop</span>  · api-prod-eu · 13:48</div>
                <div><span style={{color:'#10b981'}}>start</span> · batch-render · 12:03</div>
                <div style={{color:'rgba(232,238,255,.3)'}}>· · ·  90 events / 30d</div>
              </div>
            </div>
          </div>

          <div className="bento-cell span-2">
            <div className="bento-ico"><Icon name="Sparkles" /></div>
            <div className="bento-ti">Instant provisioning</div>
            <div className="bento-desc">Templates with real ap-south-1 pricing.</div>
          </div>

          <div className="bento-cell span-2">
            <div className="bento-ico"><Icon name="ShieldCheck" /></div>
            <div className="bento-ti">Granular RBAC</div>
            <div className="bento-desc">Admin / operator / viewer per account.</div>
          </div>

          <div className="bento-cell span-2">
            <div className="bento-ico"><Icon name="Briefcase" /></div>
            <div className="bento-ti">Vendor & customer ledger</div>
            <div className="bento-desc">Renewals, payables, and contract value in one view.</div>
          </div>
        </div>
      </section>

      {/* PREVIEW SECTION */}
      <section className="preview-section reveal" id="preview">
        <div className="section-eyebrow" style={{display:'block'}}>The dashboard, up close</div>
        <h2 style={{margin:'0 auto', maxWidth:780}}><span className="grad">Designed like a Bugatti dashboard.</span> Engineered like a flight deck.</h2>

        <div className="preview-frame">
          <div className="preview-glow" />
          <div className="preview-card">
            <div className="preview-bar">
              <div className="tlights"><span /><span /><span /></div>
              <div className="url">app.onecloudutopia.com / dashboard</div>
            </div>
            <div className="preview-body">
              <div className="preview-sb">
                <div className="preview-sb-item on"><span className="pi-ico"><Icon name="LayoutGrid" size={14} /></span>Dashboard</div>
                <div className="preview-sb-item"><span className="pi-ico"><Icon name="Server" size={14} /></span>Instances</div>
                <div className="preview-sb-item"><span className="pi-ico"><Icon name="HardDriveUpload" size={14} /></span>Backups</div>
                <div className="preview-sb-item"><span className="pi-ico"><Icon name="Receipt" size={14} /></span>Billing</div>
                <div className="preview-sb-item"><span className="pi-ico"><Icon name="Activity" size={14} /></span>Analytics</div>
                <div className="preview-sb-item"><span className="pi-ico"><Icon name="ScrollText" size={14} /></span>Audit Log</div>
                <div className="preview-sb-item"><span className="pi-ico"><Icon name="Briefcase" size={14} /></span>Vendors</div>
                <div className="preview-sb-item"><span className="pi-ico"><Icon name="Building2" size={14} /></span>Accounts</div>
              </div>
              <div className="preview-main">
                <div className="preview-h">Dashboard</div>
                <div className="preview-sub">Real-time fleet overview · 2 accounts · updated continuously</div>
                <div className="preview-stats">
                  <div className="preview-stat"><div className="preview-stat-l">Total</div><div className="preview-stat-v">12</div><div className="preview-stat-d">+2 today</div></div>
                  <div className="preview-stat"><div className="preview-stat-l">Running</div><div className="preview-stat-v">9</div><div className="preview-stat-d">75% active</div></div>
                  <div className="preview-stat"><div className="preview-stat-l">Stopped</div><div className="preview-stat-v">3</div><div className="preview-stat-d" style={{color:'rgba(232,238,255,.4)'}}>idle</div></div>
                  <div className="preview-stat"><div className="preview-stat-l">MTD</div><div className="preview-stat-v">$1,847</div><div className="preview-stat-d">-29% MoM</div></div>
                </div>
                <div style={{height:240, borderRadius:10, background:'linear-gradient(180deg, rgba(59,127,255,.08), rgba(59,127,255,.02))', border:'1px solid rgba(110,163,255,.12)', position:'relative', overflow:'hidden'}}>
                  <svg viewBox="0 0 600 240" preserveAspectRatio="none" style={{width:'100%', height:'100%'}}>
                    <defs>
                      <linearGradient id="lgPv" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#3b7fff" stopOpacity=".4" />
                        <stop offset="100%" stopColor="#3b7fff" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,180 C60,160 100,120 150,130 C200,140 240,100 290,90 C340,80 380,110 430,100 C480,90 520,60 600,50 L600,240 L0,240 Z" fill="url(#lgPv)" />
                    <path d="M0,180 C60,160 100,120 150,130 C200,140 240,100 290,90 C340,80 380,110 430,100 C480,90 520,60 600,50" fill="none" stroke="#3b7fff" strokeWidth="2" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAND */}
      <section className="stats-band reveal">
        <div className="stat-band-cell">
          <div className="stat-band-v">14,000<span className="unit">+</span></div>
          <div className="stat-band-l">EC2 instances under management</div>
        </div>
        <div className="stat-band-cell">
          <div className="stat-band-v">99.97<span className="unit">%</span></div>
          <div className="stat-band-l">Control-plane uptime · last 12 months</div>
        </div>
        <div className="stat-band-cell">
          <div className="stat-band-v">$2.4<span className="unit">M</span></div>
          <div className="stat-band-l">Cloud spend optimized for our customers</div>
        </div>
        <div className="stat-band-cell">
          <div className="stat-band-v">6</div>
          <div className="stat-band-l">AWS regions · expanding to 14 in Q3</div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-banner reveal" id="pricing">
        <h2>Ready to <span className="accent">unify</span> your cloud?</h2>
        <p>Open the dashboard, link an AWS account, and ship before lunch. No card. No demo gating. Just the cleanest control plane your team has ever used.</p>
        <div className="cta-row">
          <a className="hero-cta primary" onClick={onLaunch}>Open dashboard <Icon name="ArrowRight" size={16} /></a>
          <a className="hero-cta ghost"><Icon name="MessageCircle" size={16} />Talk to sales</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mfooter">
        <div className="mfooter-grid">
          <div className="mfooter-brand">
            <div className="mnav-brand">
              <div className="mnav-mark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6">
                  <rect x="3" y="3" width="18" height="7" rx="1.5" />
                  <rect x="3" y="14" width="18" height="7" rx="1.5" />
                </svg>
              </div>
              One Cloud Utopia
            </div>
            <p className="mfooter-tag">The dimensional control plane for multi-account AWS teams. Built in Kathmandu, deployed worldwide.</p>
          </div>
          <div className="mfooter-col">
            <h4>Product</h4>
            <a>Dashboard</a><a>Instances</a><a>Billing</a><a>Audit Log</a><a>Templates</a>
          </div>
          <div className="mfooter-col">
            <h4>Company</h4>
            <a>About</a><a>Customers</a><a>Careers</a><a>Press</a>
          </div>
          <div className="mfooter-col">
            <h4>Resources</h4>
            <a>Docs</a><a>API</a><a>Changelog</a><a>Status</a>
          </div>
          <div className="mfooter-col">
            <h4>Legal</h4>
            <a>Privacy</a><a>Terms</a><a>Security</a><a>SLA</a>
          </div>
        </div>
        <div className="mfooter-bottom">
          <span>© 2026 One Cloud Utopia · All rights reserved</span>
          <span style={{display:'inline-flex', gap:14}}>
            <a><Icon name="Twitter" size={14} /></a>
            <a><Icon name="Github" size={14} /></a>
            <a><Icon name="Linkedin" size={14} /></a>
          </span>
        </div>
      </footer>
    </div>
  );
}

Object.assign(window, { LandingPage });
