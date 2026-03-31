'use strict';

/* ═══════════════════════════════════════════════════
   Finance Notifications — vendor/customer alert engine
   IIFE → FinNotifications global
   ═══════════════════════════════════════════════════ */

const FinNotifications = (function () {

  var STORAGE_KEY = 'ec2ctrl_fin_notifs';
  var _notifs = [];
  var _loaded = false;

  // ─── Persistence ──────────────────────────────────────────────────────

  function _load() {
    if (_loaded) return;
    try { _notifs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { _notifs = []; }
    _loaded = true;
  }

  function _persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(_notifs)); }

  function _uuid() { return 'n-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8); }

  function _days(dateStr) { return Math.ceil((new Date(dateStr) - new Date()) / 86400000); }

  // ─── Engine ───────────────────────────────────────────────────────────

  function refresh() {
    _load();
    var s   = FinSettings.get();
    var exp = s.expiryWarningDays;
    var pay = s.paymentWarningDays;
    var fresh = [];

    // ── Vendor alerts ──
    Vendors.getAll().forEach(function (v) {
      if (!v.agreementEnd) return;
      var d = _days(v.agreementEnd);
      if (d < 0) {
        fresh.push(_make('vendor_expired',   'critical', 'vendor', v.id, v.name, 'Contract expired ' + Math.abs(d) + 'd ago', 'vendors'));
      } else if (d <= exp) {
        fresh.push(_make('vendor_expiring',  d <= 7 ? 'critical' : 'warning', 'vendor', v.id, v.name, 'Contract expires in ' + d + 'd', 'vendors'));
      }
    });

    // ── Customer alerts ──
    Customers.getAll().forEach(function (c) {
      var status = c.paymentStatus;
      if (status === 'overdue') {
        var od = c.nextDueDate ? Math.abs(_days(c.nextDueDate)) : 0;
        fresh.push(_make('payment_overdue', 'critical', 'customer', c.id, c.name, 'Payment overdue' + (od > 0 ? ' by ' + od + 'd' : ''), 'customers'));
      } else if (status === 'due') {
        var dl = c.nextDueDate ? Math.max(0, _days(c.nextDueDate)) : 0;
        fresh.push(_make('payment_due', 'warning', 'customer', c.id, c.name, 'Payment due in ' + dl + 'd', 'customers'));
      } else if (status === 'upfront_pending') {
        fresh.push(_make('upfront_pending', 'warning', 'customer', c.id, c.name, 'Upfront payment not received', 'customers'));
      }

      // Milestone alerts
      (c.milestones || []).forEach(function (m) {
        if (m.paid || !m.dueDate) return;
        var md = _days(m.dueDate);
        if (md < 0) {
          fresh.push(_make('milestone_overdue', 'critical', 'customer', c.id, c.name, 'Milestone "' + m.name + '" overdue by ' + Math.abs(md) + 'd', 'customers'));
        } else if (md <= pay) {
          fresh.push(_make('milestone_due', 'warning', 'customer', c.id, c.name, 'Milestone "' + m.name + '" due in ' + md + 'd', 'customers'));
        }
      });

      // Contract expiry
      if (c.agreementEnd) {
        var cd = _days(c.agreementEnd);
        if (cd >= 0 && cd <= exp) {
          fresh.push(_make('contract_expiring', cd <= 7 ? 'critical' : 'warning', 'customer', c.id, c.name, 'Customer contract expires in ' + cd + 'd', 'customers'));
        }
      }
    });

    // Preserve read state from previous run by matching on entityId + type
    var readMap = {};
    _notifs.forEach(function (n) { if (n.read) readMap[n.type + '|' + n.entityId] = true; });
    fresh.forEach(function (n) { if (readMap[n.type + '|' + n.entityId]) n.read = true; });

    _notifs = fresh;
    _persist();
    _updateBadge();
    _renderDropdownIfOpen();
  }

  function _make(type, severity, entityType, entityId, entityName, message, link) {
    return { id: _uuid(), type, severity, entityType, entityId, entityName, message, link,
      timestamp: new Date().toISOString(), read: false };
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
        (!n.read ? '<button class="notif-check" title="Mark read" onclick="FinNotifications.markRead(\'' + _esc(n.id) + '\');event.stopPropagation()">\u2713</button>' : '') +
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
    if (n && !n.read) { n.read = true; _persist(); _updateBadge(); _renderDropdownIfOpen(); _renderPageIfOpen(); }
  }

  function markAllRead() {
    _notifs.forEach(function (n) { n.read = true; });
    _persist(); _updateBadge(); _renderDropdown(); _renderPageIfOpen();
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
    _load();
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
    toggleDropdown:    toggleDropdown,
    onTabActivated:    onTabActivated,
    onPageFilterChange:onPageFilterChange,
  };

})();
