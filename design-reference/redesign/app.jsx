/* global React, ReactDOM, Sidebar, Topbar, TweaksPanel, LandingPage, LoginPage,
   DashboardScreen, InstancesScreen, MyServersScreen, AnalyticsScreen, AuditScreen,
   VendorsScreen, FinSettingsScreen, AccountsScreen, UsersScreen, BillingScreen,
   BackupsScreen, CustomersScreen, AlertsScreen, Icon */

const DEFAULT_TWEAKS = {
  theme: 'dark',
  density: 'balanced',
  sidebarStyle: 'full',
  view: 'landing',
  font: 'inter',
};

function App() {
  const [view, setView] = useState(() => localStorage.getItem('ocu.view') || 'landing');
  const [page, setPage] = useState(() => localStorage.getItem('ocu.page') || 'dashboard');
  const [tweaks, setTweaks] = useState(() => {
    try { return { ...DEFAULT_TWEAKS, ...JSON.parse(localStorage.getItem('ocu.tweaks')||'{}') }; }
    catch { return DEFAULT_TWEAKS; }
  });
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => { localStorage.setItem('ocu.view', view); }, [view]);
  useEffect(() => { localStorage.setItem('ocu.page', page); }, [page]);
  useEffect(() => {
    localStorage.setItem('ocu.tweaks', JSON.stringify(tweaks));
    const root = document.documentElement;
    root.setAttribute('data-theme', tweaks.theme);
    root.setAttribute('data-density', tweaks.density);
    root.setAttribute('data-font', tweaks.font || 'inter');
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: tweaks }, '*'); } catch {}
  }, [tweaks]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setEditMode(true);
      if (e.data.type === '__deactivate_edit_mode') setEditMode(false);
    };
    window.addEventListener('message', handler);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch {}
    return () => window.removeEventListener('message', handler);
  }, []);

  const SCREENS = {
    dashboard:   <DashboardScreen />,
    instances:   <InstancesScreen />,
    servers:     <MyServersScreen />,
    backups:     <BackupsScreen />,
    billing:     <BillingScreen />,
    analytics:   <AnalyticsScreen />,
    audit:       <AuditScreen />,
    vendors:     <VendorsScreen />,
    customers:   <CustomersScreen />,
    alerts:      <AlertsScreen />,
    finsettings: <FinSettingsScreen />,
    accounts:    <AccountsScreen />,
    users:       <UsersScreen />,
  };

  if (view === 'landing') {
    return (
      <>
        <LandingPage onLaunch={() => setView('login')} />
        {editMode && (
          <>
            <button className="tweaks-toggle" onClick={() => setTweaksOpen(o => !o)} aria-label="Tweaks">
              <Icon name={tweaksOpen ? 'X' : 'Sliders'} />
            </button>
            {tweaksOpen && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} view={view} setView={setView} onClose={() => setTweaksOpen(false)} />}
          </>
        )}
      </>
    );
  }

  if (view === 'login') {
    return (
      <>
        <LoginPage onLogin={() => setView('app')} onBack={() => setView('landing')} />
        {editMode && (
          <>
            <button className="tweaks-toggle" onClick={() => setTweaksOpen(o => !o)} aria-label="Tweaks">
              <Icon name={tweaksOpen ? 'X' : 'Sliders'} />
            </button>
            {tweaksOpen && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} view={view} setView={setView} onClose={() => setTweaksOpen(false)} />}
          </>
        )}
      </>
    );
  }

  return (
    <div className="app" data-sidebar={tweaks.sidebarStyle} data-screen-label={page}>
      <Sidebar page={page} onNav={setPage} onHome={() => setView('landing')} onLogout={() => setView('login')} />
      <main className="main">
        <Topbar page={page} onHome={() => setView('landing')} />
        {SCREENS[page] || SCREENS.dashboard}
      </main>

      {editMode && (
        <>
          <button className="tweaks-toggle" onClick={() => setTweaksOpen(o => !o)} aria-label="Tweaks">
            <Icon name={tweaksOpen ? 'X' : 'Sliders'} />
          </button>
          {tweaksOpen && <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} view={view} setView={setView} onClose={() => setTweaksOpen(false)} />}
        </>
      )}
    </div>
  );
}

function boot() {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
}
if (window.Lucide) boot();
else window.addEventListener('lucide-ready', boot, { once: true });
