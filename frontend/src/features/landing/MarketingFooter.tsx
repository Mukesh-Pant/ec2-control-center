import { Twitter, Github, Linkedin } from 'lucide-react';
import { BrandMark } from '@/components/BrandMark';

const COLS = [
  {
    h: 'Product',
    items: ['Dashboard', 'Instances', 'Billing', 'Audit Log', 'Templates'],
  },
  { h: 'Company', items: ['About', 'Customers', 'Careers', 'Press'] },
  { h: 'Resources', items: ['Docs', 'API', 'Changelog', 'Status'] },
  { h: 'Legal', items: ['Privacy', 'Terms', 'Security', 'SLA'] },
];

export function MarketingFooter() {
  return (
    <footer className="mfooter">
      <div className="mfooter-grid">
        <div className="mfooter-brand">
          <div className="mnav-brand" style={{ cursor: 'default' }}>
            <span className="mnav-mark">
              <BrandMark size={14} />
            </span>
            One Cloud Utopia
          </div>
          <p className="mfooter-tag">
            The dimensional control plane for multi-account AWS teams. Built in Kathmandu, deployed
            worldwide.
          </p>
        </div>

        {COLS.map((col) => (
          <div className="mfooter-col" key={col.h}>
            <h4>{col.h}</h4>
            {col.items.map((item) => (
              <a key={item} href="#">
                {item}
              </a>
            ))}
          </div>
        ))}
      </div>

      <div className="mfooter-bottom">
        <span>© {new Date().getFullYear()} One Cloud Utopia · All rights reserved</span>
        <span style={{ display: 'inline-flex', gap: 14 }}>
          <a href="#" aria-label="Twitter">
            <Twitter size={14} />
          </a>
          <a href="#" aria-label="GitHub">
            <Github size={14} />
          </a>
          <a href="#" aria-label="LinkedIn">
            <Linkedin size={14} />
          </a>
        </span>
      </div>
    </footer>
  );
}
