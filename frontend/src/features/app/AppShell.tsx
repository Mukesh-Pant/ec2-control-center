import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { useTweaks } from '@/stores/tweaks';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TweaksPanel } from './TweaksPanel';
import './app.css';
import '@/components/ui/ui.css';

/**
 * Layout for /app/*. Renders Sidebar + Topbar + the active screen via
 * <Outlet/>. Sidebar.style ('full' | 'rail') is read from the tweaks
 * store and applied via the [data-sidebar] attribute. The mobile
 * sidebar is a slide-in panel toggled by the Topbar burger.
 *
 * Also wires the ⌘⇧Q (Ctrl+Shift+Q on Windows) shortcut to sign out.
 */
export function AppShell() {
  const sidebarStyle = useTweaks((s) => s.sidebarStyle);
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.shiftKey && (e.key === 'Q' || e.key === 'q')) {
        e.preventDefault();
        signOut();
        navigate('/login', { replace: true });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [signOut, navigate]);

  return (
    <div className="app" data-sidebar={sidebarStyle}>
      <button
        type="button"
        className={`sb-backdrop${mobileOpen ? ' open' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
      />
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="main">
        <Topbar onOpenSidebar={() => setMobileOpen(true)} />
        <Outlet />
      </main>
      <TweaksPanel />
    </div>
  );
}
