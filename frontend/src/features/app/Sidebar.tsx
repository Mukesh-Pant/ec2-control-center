import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronUp, LogOut } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { BrandMark } from '@/components/BrandMark';
import { useAuth } from '@/stores/auth';
import { NAV, ADMIN_ONLY_PAGES } from './nav';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, role, signOut } = useAuth();

  const currentPage = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const isAdmin = role === 'admin';
  const initial = (email || 'U').slice(0, 1).toUpperCase();

  const onNav = (id: string) => {
    navigate(`/app/${id}`);
    onClose();
  };
  const onHome = () => {
    navigate('/');
  };
  const onSignOut = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Primary navigation">
      <button className="sb-brand" onClick={onHome} type="button" aria-label="Back to landing">
        <span className="sb-mark">
          <BrandMark size={14} />
        </span>
        <div>
          <div className="sb-name">One Cloud Utopia</div>
          <div className="sb-tag">Multi-Account Portal</div>
        </div>
      </button>

      {NAV.map((group) => {
        const items = group.items.filter((it) => !(ADMIN_ONLY_PAGES.has(it.id) && !isAdmin));
        if (items.length === 0) return null;
        return (
          <div key={group.section}>
            <div className="sb-section">{group.section}</div>
            <nav className="sb-nav">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`nav-item${currentPage === it.id ? ' on' : ''}`}
                  onClick={() => onNav(it.id)}
                  aria-current={currentPage === it.id ? 'page' : undefined}
                >
                  <Icon name={it.icon} />
                  <span>{it.label}</span>
                  {it.count ? <span className="nav-count">{it.count}</span> : null}
                </button>
              ))}
            </nav>
          </div>
        );
      })}

      <div className="sb-foot">
        <div className="sb-user">
          <div className="sb-avatar">{initial}</div>
          <div className="sb-user-info">
            <div className="sb-user-name">{email || 'Loading…'}</div>
            <div className="sb-user-role">
              {role === 'admin' && <span className="rbac-badge rbac-admin">Admin</span>}
              {role === 'operator' && <span className="rbac-badge rbac-operator">Operator</span>}
              {role === 'viewer' && <span className="rbac-badge rbac-viewer">Viewer</span>}
              {role === 'none' && <span className="rbac-badge rbac-viewer">Pending</span>}
            </div>
          </div>
          <button className="sb-user-menu" title="Account menu" aria-label="Account menu">
            <ChevronUp size={14} />
          </button>
        </div>

        <button className="sb-logout" onClick={onSignOut} type="button">
          <LogOut size={15} />
          <span>Sign out</span>
          <span className="sb-logout-kbd">⌘⇧Q</span>
        </button>
      </div>
    </aside>
  );
}
