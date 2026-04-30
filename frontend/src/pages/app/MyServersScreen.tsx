import { Button, Icon, PageHeader } from '@/components/ui';
import { TEMPLATES } from '@/features/app/mockData';

export default function MyServersScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Provisioning"
        title="My Servers"
        sub="Provision and manage dedicated cloud servers — ready when you are."
        actions={
          <>
            <Button icon="RotateCw" variant="ghost" size="sm">Refresh</Button>
            <Button icon="Plus" variant="primary" size="sm">Create server</Button>
          </>
        }
      />

      <div className="hero-banner">
        <div>
          <div className="hero-eyebrow">My servers · ap-south-1</div>
          <h2 className="hero-title">Cloud servers, instantly.</h2>
          <p className="hero-sub">
            Production-grade servers on AWS — billed transparently, managed centrally. Choose a ready-made stack or
            configure manually with clear pricing and secure setup.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 10, position: 'relative' }}>
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
        {TEMPLATES.map((t) => (
          <div className="tpl-card" key={t.id}>
            <div className="tpl-head">
              <div className="tpl-ico"><Icon name={t.icon} /></div>
              <div className="tpl-tag">{t.tag}</div>
            </div>
            <div>
              <div className="tpl-name">{t.name}</div>
              <div className="tpl-desc" style={{ marginTop: 8 }}>{t.desc}</div>
            </div>
            <div className="tpl-specs">
              <span className="tpl-spec"><Icon name="Cpu" />{t.cpu} vCPU</span>
              <span className="tpl-spec"><Icon name="MemoryStick" />{t.ram}</span>
              <span className="tpl-spec"><Icon name="HardDrive" />{t.disk}</span>
              {t.stack.slice(0, 3).map((s) => <span className="tpl-spec" key={s}>{s}</span>)}
            </div>
            <div className="tpl-price">
              <div>
                <div className="tpl-price-amt">
                  NPR {t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="tpl-price-hint">Monthly estimate · taxes & services apply</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Button variant="ghost" size="sm" icon="ArrowRight">Launch</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
