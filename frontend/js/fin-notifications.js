'use strict';

/* ═══════════════════════════════════════════════════
   Finance Notifications - vendor/customer alert engine
   IIFE → FinNotifications global
   ═══════════════════════════════════════════════════ */

const FinNotifications = (function () {

  var _notifs = [];
  var _readIds = new Set();

  // ─── Engine ───────────────────────────────────────────────────────────

  async function refresh() {
    try {
      var res = await API.getFinanceAlerts();
      var data = await res.json();
      var fresh = data.alerts || [];

      // Preserve in-session read state by matching on entityId + type
      fresh.forEach(function (n) {
        if (_readIds.has(n.type + '|' + n.entityId)) n.read = true;
      });

      _notifs = fresh;
    } catch (e) {
      console.error('Failed to load alerts', e);
      _notifs = [];
    }
    _updateBadge();
    _renderDropdownIfOpen();
  }

  // ─── Badge ────────────────────────────────────────────────────────────

  function _updateBadge() {
    var unread   = _notifs.filter(function (n) { return !n.read; });
    var critical = unread.filter(function (n) { return n.severity === 'critical'; });
    var count    = unread.length;
    // Topbar bell badge
    var badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count ? '' : 'none';
      badge.className = 'notif-badge' + (critical.length ? ' critical' : '');
    }
    // Sidebar nav badge
    var nb = document.getElementById('n-notif');
    if (nb) {
      nb.textContent = count;
      nb.style.display = count ? '' : 'none';
    }
  }

  // ─── Dropdown ─────────────────────────────────────────────────────────

  function toggleDropdown() {
    var dd = document.getElementById('notif-dropdown');
    if (!dd) return;
    var open = dd.classList.toggle('open');
    if (open) _renderDropdown();
  }

  function _renderDropdownIfOpen() {
    var dd = document.getElementById('notif-dropdown');
    if (dd && dd.classList.contains('open')) _renderDropdown();
  }

  function _renderDropdown() {
    var wrap = document.getElementById('notif-list-wrap');
    if (!wrap) return;
    var list = _notifs.slice(0, 15);
    if (!list.length) { wrap.innerHTML = '<div class="notif-empty">All clear \u2014 no alerts</div>'; return; }

    wrap.innerHTML = list.map(function (n) {
      var ico = n.severity === 'critical' ? '\u26a0\ufe0f' : n.severity === 'warning' ? '\u26a1' : '\u2139\ufe0f';
      var ts  = new Date(n.timestamp).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<div class="notif-item' + (n.read ? ' read' : '') + '" data-id="' + _esc(n.id) + '" data-link="' + _esc(n.link) + '">' +
        '<span class="notif-ico notif-ico--' + n.severity + '">' + ico + '</span>' +
        '<div class="notif-item-body">' +
          '<div class="notif-item-name">' + _esc(n.entityName) + '</div>' +
          '<div class="notif-item-msg">'  + _esc(n.message)    + '</div>' +
          '<div class="notif-item-time">' + ts                 + '</div>' +
        '</div>' +
        '<div class="notif-item-btns" onclick="event.stopPropagation()">' +
          (!n.read ? '<button class="notif-check" title="Mark read" onclick="FinNotifications.markRead(\'' + _esc(n.id) + '\')">\u2713</button>' : '') +
          '<button class="notif-dismiss" title="Dismiss" onclick="FinNotifications.dismiss(\'' + _esc(n.id) + '\')">&times;</button>' +
        '</div>' +
      '</div>';
    }).join('');

    wrap.querySelectorAll('.notif-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var id   = el.dataset.id;
        var link = el.dataset.link;
        markRead(id);
        toggleDropdown();
        if (link) App.go(link);
      });
    });
  }

  // ─── Mark read ────────────────────────────────────────────────────────

  function markRead(id) {
    var n = _notifs.find(function (x) { return x.id === id; });
    if (n && !n.read) {
      n.read = true;
      _readIds.add(n.type + '|' + n.entityId);
      _updateBadge(); _renderDropdownIfOpen(); _renderPageIfOpen();
    }
  }

  function markAllRead() {
    _notifs.forEach(function (n) {
      n.read = true;
      _readIds.add(n.type + '|' + n.entityId);
    });
    _updateBadge(); _renderDropdown(); _renderPageIfOpen();
  }

  function dismiss(id) {
    _notifs = _notifs.filter(function (n) { return n.id !== id; });
    _updateBadge(); _renderDropdownIfOpen(); _renderPageIfOpen();
  }

  function dismissAll() {
    _notifs = [];
    _updateBadge(); _renderDropdown(); _renderPageIfOpen();
  }

  // ─── Full page ────────────────────────────────────────────────────────

  function onTabActivated() { _renderPage(); }

  function _renderPageIfOpen() {
    var pv = document.getElementById('pv-notifications');
    if (pv && pv.classList.contains('on')) _renderPage();
  }

  function _renderPage() {
    var wrap = document.getElementById('notif-page-list');
    if (!wrap) return;

    var sevF  = _getVal('notif-filter-sev')  || 'all';
    var typeF = _getVal('notif-filter-type') || 'all';

    var list = _notifs.filter(function (n) {
      if (sevF  !== 'all' && n.severity   !== sevF)  return false;
      if (typeF !== 'all' && n.entityType !== typeF) return false;
      return true;
    });

    if (!list.length) {
      wrap.innerHTML = '<div class="notif-empty-page"><div class="empty-ico">\uD83D\uDD14</div><p class="empty-t">No notifications matching your filters</p></div>';
      return;
    }

    var SEV_CLS = { critical: 'notif-row--critical', warning: 'notif-row--warning', info: 'notif-row--info' };
    wrap.innerHTML = list.map(function (n) {
      var ts = new Date(n.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<div class="notif-row ' + (SEV_CLS[n.severity] || '') + (n.read ? ' read' : '') + '">' +
        '<div class="notif-row-sev notif-ico--' + n.severity + '">' + (n.severity === 'critical' ? '\u26a0\ufe0f' : '\u26a1') + '</div>' +
        '<div class="notif-row-body">' +
          '<div class="notif-row-name">' + _esc(n.entityName) + ' <span class="fm-tag">' + n.entityType + '</span></div>' +
          '<div class="notif-row-msg">'  + _esc(n.message)    + '</div>' +
          '<div class="notif-row-time">' + ts                 + '</div>' +
        '</div>' +
        '<div class="notif-row-actions">' +
          (!n.read ? '<button class="btn btn-xs btn-out" onclick="FinNotifications.markRead(\'' + _esc(n.id) + '\')">Mark read</button>' : '<span class="notif-read-lbl">Read</span>') + ' ' +
          '<button class="btn btn-xs btn-out" onclick="App.go(\'' + _esc(n.link) + '\')">View</button>' +
          '<button class="btn btn-xs btn-out fm-btn-del" onclick="FinNotifications.dismiss(\'' + _esc(n.id) + '\')">Dismiss</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function onPageFilterChange() { _renderPage(); }

  // ─── Helpers ──────────────────────────────────────────────────────────

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function _getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  // ─── Init ─────────────────────────────────────────────────────────────

  function init() {
    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#notif-bell-wrap')) {
        var dd = document.getElementById('notif-dropdown');
        if (dd) dd.classList.remove('open');
      }
    });
  }

  // ─── Public ───────────────────────────────────────────────────────────

  return {
    init:              init,
    refresh:           refresh,
    markRead:          markRead,
    markAllRead:       markAllRead,
    dismiss:           dismiss,
    dismissAll:        dismissAll,
    toggleDropdown:    toggleDropdown,
    onTabActivated:    onTabActivated,
    onPageFilterChange:onPageFilterChange,
  };

})();
