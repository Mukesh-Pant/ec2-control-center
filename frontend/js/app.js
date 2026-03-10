/* ═══════════════════════════════════════════════
   App Module — Init, tab routing, toast, log
   ═══════════════════════════════════════════════ */

var App = (function () {

  var toastTimer;

  // ─── Toast ───

  function showToast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'show ' + (type || 'info');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 3500);
  }

  // ─── Activity Log ───

  var TAGS = {
    ok:   '<span class="log-tag tag-ok">OK</span>',
    err:  '<span class="log-tag tag-err">ERR</span>',
    info: '<span class="log-tag tag-info">INFO</span>',
    sys:  '<span class="log-tag tag-sys">SYS</span>',
  };

  function addLog(msg, type) {
    var list = document.getElementById('log-list');
    if (!list) return;
    var time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    var li = document.createElement('li');
    li.className = 'log-entry';
    li.innerHTML =
      '<span class="log-time">' + time + '</span>' +
      '<span class="log-msg" title="' + msg.replace(/"/g, '&quot;') + '">' + msg + '</span>' +
      (TAGS[type] || TAGS.info);
    list.prepend(li);
    while (list.children.length > 30) list.removeChild(list.lastChild);
  }

  function clearLog() {
    document.getElementById('log-list').innerHTML = '';
    addLog('Log cleared.', 'sys');
  }

  // ─── Theme Toggle ───

  function initThemeToggle() {
    var btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('theme');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
      }
    });
  }

  // ─── Session Countdown ───

  function updateCountdown() {
    var expiry    = Auth.getExpiry();
    var remaining = expiry - Date.now();
    var el        = document.getElementById('session-timer');
    if (remaining <= 0) {
      Auth.logout();
      return;
    }
    var m = Math.floor(remaining / 60000);
    var s = Math.floor((remaining % 60000) / 1000);
    el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    el.className = 'session-timer' + (m < 5 ? ' warning' : '');
  }

  // ─── Tab Routing ───

  function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.panel').forEach(function (panel) {
      panel.style.display = panel.id === 'panel-' + tabName ? 'block' : 'none';
    });
  }

  // ─── Clock ───

  function updateClock() {
    var el = document.getElementById('clock');
    if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
  }

  // ─── Init ───

  async function init() {
    var ok = await Auth.init();
    if (!ok) return;

    document.getElementById('user-email').textContent = Auth.getEmail();

    // Wire up event listeners
    document.getElementById('btn-logout').addEventListener('click', Auth.logout);
    document.getElementById('btn-refresh').addEventListener('click', Instances.loadInstances);
    document.getElementById('btn-clear-log').addEventListener('click', clearLog);
    document.getElementById('btn-start').addEventListener('click', function () { Instances.controlServer('start'); });
    document.getElementById('btn-stop').addEventListener('click',  function () { Instances.controlServer('stop'); });

    // Tab buttons
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = this.getAttribute('data-tab');
        switchTab(name);
        if (name === 'audit')    Audit.onTabActivated();
        if (name === 'accounts') Accounts.onTabActivated();
      });
    });

    // Init modules
    Audit.init();
    Accounts.init();
    Instances.initDrawerControls();
    initThemeToggle();

    // Start timers
    updateCountdown();
    setInterval(updateCountdown, 1000);
    updateClock();
    setInterval(updateClock, 1000);

    addLog('Portal initialized. Loading instances...', 'sys');

    Instances.loadInstances();
  }

  // ─── Public API ───

  return {
    init:       init,
    showToast:  showToast,
    addLog:     addLog,
    clearLog:   clearLog,
    switchTab:  switchTab,
  };

})();

// Boot
App.init();
