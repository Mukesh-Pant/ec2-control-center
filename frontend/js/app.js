/* ═══════════════════════════════════════════════
   App — Navigation, Dashboard, Session, Toast
   ═══════════════════════════════════════════════ */

const App = (function () {

  // ─── State ───
  var currentPage      = 'dashboard';
  var sessionEnd       = 0;
  var clockTick        = null;
  var isAdmin          = false;
  var _extensionPresent = false;

  var PAGE_TITLES = {
    dashboard: 'Dashboard',
    instances: 'Instances',
    billing:   'Billing & Cost',
    analytics: 'Analytics',
    audit:     'Audit Log',
    accounts:  'Accounts',
    users:     'Users',
    backup:    'Backups',
  };

  // ─── Navigation ────────────────────────────────────────────────────────────

  function go(page) {
    if (!PAGE_TITLES[page]) return;

    document.querySelectorAll('.nitem').forEach(function (el) {
      el.classList.toggle('on', el.id === 'nav-' + page);
    });
    document.querySelectorAll('.pv').forEach(function (el) {
      el.classList.toggle('on', el.id === 'pv-' + page);
    });

    var tb = document.getElementById('tb-page');
    if (tb) tb.textContent = PAGE_TITLES[page];

    currentPage = page;
    closeSidebar();

    if (page === 'audit')     Audit.onTabActivated();
    if (page === 'analytics') Analytics.onTabActivated();
    if (page === 'billing')   Billing.onTabActivated();
    if (page === 'accounts')  Accounts.onTabActivated();
    if (page === 'users')     Users.onTabActivated();
    if (page === 'backup')    Backup.onTabActivated();
  }

  // ─── Sidebar ───────────────────────────────────────────────────────────────

  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sb-backdrop').classList.add('open');
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sb-backdrop').classList.remove('open');
  }

  // ─── Activity Log ──────────────────────────────────────────────────────────

  function log(msg, type) {
    type = type || 'sys';
    var ul = document.getElementById('log-ul');
    if (!ul) return;
    var ts = new Date().toTimeString().slice(0, 8);
    var li = document.createElement('li');
    li.className = 'log-li';
    li.innerHTML =
      '<span class="log-t">' + ts + '</span>' +
      '<i class="log-d ' + esc(type) + '"></i>' +
      '<span class="log-m">' + esc(msg) + '</span>' +
      '<span class="lchip ' + esc(type) + '">' + type.toUpperCase() + '</span>';
    ul.insertBefore(li, ul.firstChild);
    while (ul.children.length > 100) ul.removeChild(ul.lastChild);
  }

  function clearLog() {
    var ul = document.getElementById('log-ul');
    if (ul) ul.innerHTML = '';
    log('Activity log cleared', 'sys');
  }

  // ─── Toast ─────────────────────────────────────────────────────────────────

  var _toastTimer = null;

  function showToast(msg, type) {
    type = type || 'info';
    var el  = document.getElementById('toast');
    var ico = document.getElementById('toast-ico');
    var txt = document.getElementById('toast-msg');
    if (!el) return;
    var icons = { ok: '✓', err: '✕', info: 'ℹ', warn: '⚠' };
    if (ico) ico.textContent = icons[type] || 'ℹ';
    if (txt) txt.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { el.className = ''; }, 3500);
  }

  // ─── Clock + Session timer ─────────────────────────────────────────────────

  function startClock() {
    if (clockTick) return;
    clockTick = setInterval(function () {
      var clk = document.getElementById('clock');
      if (clk) clk.textContent = new Date().toTimeString().slice(0, 8);

      var remaining = Math.max(0, sessionEnd - Date.now());
      var mins = Math.floor(remaining / 60000);
      var secs = Math.floor((remaining % 60000) / 1000);
      var sess = document.getElementById('sess-t');
      if (sess) sess.textContent = _pad(mins) + ':' + _pad(secs);

      if (remaining === 0 && sessionEnd > 0) {
        sessionEnd = 0;
        if (typeof Auth !== 'undefined') Auth.logout();
      }
    }, 1000);
  }

  function setSessionExpiry(expMs) { sessionEnd = expMs; }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function setWidth(id, pct) {
    var el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function _pad(n) { return n < 10 ? '0' + n : '' + n; }

  // ─── Dashboard stat update ─────────────────────────────────────────────────

  // Approximate on-demand Linux prices in ap-south-1 (USD/hr) for projections.
  var _PRICES = {
    't2.nano':0.0058,'t2.micro':0.0116,'t2.small':0.0230,'t2.medium':0.0464,'t2.large':0.0928,
    't3.nano':0.0052,'t3.micro':0.0104,'t3.small':0.0208,'t3.medium':0.0416,'t3.large':0.0832,
    't3a.nano':0.0047,'t3a.micro':0.0094,'t3a.small':0.0188,'t3a.medium':0.0376,
    't4g.nano':0.0042,'t4g.micro':0.0084,'t4g.small':0.0168,'t4g.medium':0.0336,
    'm5.large':0.096,'m5.xlarge':0.192,'m5.2xlarge':0.384,
    'm6i.large':0.0960,'m6i.xlarge':0.1920,
    'c5.large':0.085,'c5.xlarge':0.170,
    'c6i.large':0.085,'c6i.xlarge':0.170,
    'r5.large':0.126,'r5.xlarge':0.252,
  };

  function updateDashStats(instances) {
    var total   = instances.length;
    var running = instances.filter(function (i) { return i.state === 'running'; }).length;
    var stopped = instances.filter(function (i) { return i.state === 'stopped'; }).length;
    var accts   = new Set(instances.map(function (i) { return i.accountId; })).size;

    setText('st-total', total);
    setText('st-run',   running);
    setText('st-stp',   stopped);
    setText('st-accts', accts + ' account' + (accts !== 1 ? 's' : ''));
    setText('st-run-pct', total
      ? Math.round(running / total * 100) + ' % of fleet active'
      : '— % of fleet active');

    setWidth('sb-run', total ? running / total * 100 : 0);
    setWidth('sb-stp', total ? stopped / total * 100 : 0);

    setText('sb-fleet-txt', running + ' / ' + total + ' running');

    var badge = document.getElementById('n-inst');
    if (badge) { badge.textContent = total; badge.style.display = total ? '' : 'none'; }

    var hourlyRunning = instances
      .filter(function (i) { return i.state === 'running'; })
      .reduce(function (s, i) { return s + (_PRICES[i.instanceType] || 0.05); }, 0);
    var monthly = hourlyRunning * 24 * 30;
    setText('st-cost', monthly > 0 ? '$' + monthly.toFixed(2) : '—');

    var pill    = document.getElementById('tb-cost');
    var pillVal = document.getElementById('tb-cost-val');
    if (pill && pillVal) {
      if (monthly > 0) { pillVal.textContent = '$' + monthly.toFixed(2); pill.style.display = ''; }
      else             { pill.style.display = 'none'; }
    }

    // Also populate inst-hint in Dashboard card header
    var accumulated = hourlyRunning > 0 ? '$' + hourlyRunning.toFixed(4) : '$0.0000';
    setText('inst-hint', total + ' instance' + (total !== 1 ? 's' : '') + ' · ' + running + ' running · ' + accumulated + ' accumulated');
  }

  // ─── Admin / user info ─────────────────────────────────────────────────────

  function setAdmin(flag) {
    isAdmin = flag;
    var admSec  = document.getElementById('adm-sec');
    var navAcc  = document.getElementById('nav-accounts');
    var navUsr  = document.getElementById('nav-users');
    if (admSec) admSec.style.display = flag ? '' : 'none';
    if (navAcc) navAcc.style.display = flag ? '' : 'none';
    if (navUsr) navUsr.style.display = flag ? '' : 'none';
  }

  function setUserInfo(email, role) {
    var name = email ? email.split('@')[0] : '?';
    setText('sb-name', email || 'Unknown');
    var av = document.getElementById('sb-av');
    if (av) av.textContent = (name[0] || '?').toUpperCase();

    // Role badge in sidebar
    var badge    = document.getElementById('rbac-badge');
    var badgeTxt = document.getElementById('rbac-role-txt');
    var LABELS   = { admin: 'ADMIN', operator: 'OPERATOR', viewer: 'VIEWER' };
    if (badge && badgeTxt) {
      if (role && LABELS[role]) {
        badgeTxt.textContent = LABELS[role];
        badge.className = 'rbac-badge rbac-' + role;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  // ─── Extension Detection ───────────────────────────────────────────────────

  function _initExtensionDetection() {
    // content.js sets this flag synchronously at document_start
    _extensionPresent = !!window.EC2CTRL_EXTENSION;

    // Also listen in case the content script fires after this runs
    window.addEventListener('EC2CTRL_EXTENSION_READY', function () {
      _extensionPresent = true;
      var banner = document.getElementById('ext-install-banner');
      if (banner) banner.classList.add('hidden');
    });

    // Show banner after a short delay if extension is still absent — Firefox only
    // (Non-Firefox users cannot install a Firefox extension, so the banner is irrelevant)
    var isFirefox = /Firefox\//.test(navigator.userAgent);
    setTimeout(function () {
      if (!_extensionPresent && isFirefox) {
        var banner = document.getElementById('ext-install-banner');
        if (banner) banner.classList.remove('hidden');
      }
    }, 800);
  }

  function isExtensionPresent() { return _extensionPresent; }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    _initExtensionDetection();
    Audit.init();
    Billing.init();
    Accounts.init();
    Users.init();
    Backup.init();
    startClock();
    go('dashboard');
    log('Portal ready', 'sys');
    Instances.refresh();
  }

  // ─── Public ────────────────────────────────────────────────────────────────

  return {
    go:               go,
    openSidebar:      openSidebar,
    closeSidebar:     closeSidebar,
    log:              log,
    clearLog:         clearLog,
    showToast:        showToast,
    setText:          setText,
    setWidth:         setWidth,
    esc:              esc,
    updateDashStats:  updateDashStats,
    setAdmin:           setAdmin,
    setUserInfo:        setUserInfo,
    setSessionExpiry:   setSessionExpiry,
    isExtensionPresent: isExtensionPresent,
    init:               init,
    prices:             _PRICES,
  };

})();
