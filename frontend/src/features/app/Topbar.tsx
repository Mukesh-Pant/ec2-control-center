import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, Clock, DollarSign, Menu, Search } from 'lucide-react';
import { PAGE_TITLES } from './nav';

interface Props {
  onOpenSidebar: () => void;
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function Topbar({ onOpenSidebar }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const page = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const title = PAGE_TITLES[page] ?? page;

  return (
    <header className="topbar">
      <button
        type="button"
        className="sb-burger"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      <div className="crumb">
        <button type="button" onClick={() => navigate('/')}>
          One Cloud Utopia
        </button>
        <span className="sep">/</span>
        <span className="cur">{title}</span>
      </div>

      <div className="tb-spacer" />

      <div className="tb-chip" aria-label="Estimated monthly cost">
        <DollarSign />
        <strong>$29.95</strong>
        <span style={{ color: 'var(--ink-4)' }}>/mo</span>
      </div>
      <div className="tb-chip" aria-label="Session timer">
        <Clock />
        Session
        <strong>45:46</strong>
      </div>

      <button className="tb-icon-btn" type="button" aria-label="Notifications">
        <Bell />
        <span className="dot" />
      </button>
      <button className="tb-icon-btn" type="button" aria-label="Search">
        <Search />
      </button>

      <div className="tb-chip" style={{ fontFamily: 'var(--f-mono)' }} aria-label="Current time">
        {formatTime(time)}
      </div>
    </header>
  );
}
