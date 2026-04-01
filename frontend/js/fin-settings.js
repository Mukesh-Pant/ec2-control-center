'use strict';

/* ═══════════════════════════════════════════════════
   Finance Settings — exchange rates & alert thresholds
   IIFE → FinSettings global
   Loaded before Vendors / Customers / FinNotifications
   ═══════════════════════════════════════════════════ */

const FinSettings = (function () {

  var STORAGE_KEY = 'ec2ctrl_fin_settings';

  var DEFAULTS = {
    usdToNpr: 135,
    inrToNpr: 1.62,
    expiryWarningDays: 30,
    paymentWarningDays: 7,
    defaultCurrency: 'USD',
  };

  // Module-level constant — avoids re-creating the object on every fmtAmt call
  var CURRENCY_SYMBOLS = { USD: '$', NPR: 'NPR\u00a0', INR: '\u20b9' };

  var _s = null;

  // ─── Persistence ──────────────────────────────────────────────────────

  function _load() {
    if (_s) return;   // idempotent — skip if already loaded
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      _s = raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
    } catch (e) {
      _s = Object.assign({}, DEFAULTS);
    }
  }

  function _persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_s));
  }

  // ─── Public getters ───────────────────────────────────────────────────

  // Returns a shallow copy so callers cannot mutate internal state
  function get() {
    if (!_s) _load();
    return Object.assign({}, _s);
  }

  // ─── Currency helpers ─────────────────────────────────────────────────

  function toNpr(amount, currency) {
    if (currency === 'NPR') return amount;
    if (currency === 'USD') {
      // Prefer the live rate fetched by app.js, fall back to persisted setting
      var rate = (window.NPR_RATE && window.NPR_RATE > 0) ? window.NPR_RATE : _s.usdToNpr;
      return amount * rate;
    }
    if (currency === 'INR') return amount * _s.inrToNpr;
    return amount;
  }

  function fmtAmt(amount, currency) {
    var sym = CURRENCY_SYMBOLS[currency] || '';
    var v = (amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return sym + v;
  }

  // Returns HTML: primary amount + small NPR equivalent (when currency is not NPR)
  function fmtWithNpr(amount, currency) {
    var primary = fmtAmt(amount, currency);
    if (currency === 'NPR') return primary;
    var npr = Math.round(toNpr(amount, currency));
    return primary + '<span class="fm-npr">\u00a0NPR\u00a0' + npr.toLocaleString('en-IN') + '</span>';
  }

  // ─── Settings page ────────────────────────────────────────────────────

  function onTabActivated() {
    _renderForm();
  }

  function _renderForm() {
    _load();
    _setVal('fset-usd-npr',          _s.usdToNpr);
    _setVal('fset-inr-npr',          _s.inrToNpr);
    _setVal('fset-expiry-days',      _s.expiryWarningDays);
    _setVal('fset-payment-days',     _s.paymentWarningDays);
    _setVal('fset-default-currency', _s.defaultCurrency);
    var lbl = document.getElementById('fset-live-rate');
    if (lbl) {
      lbl.textContent = (window.NPR_RATE && window.NPR_RATE > 0)
        ? '1 USD = NPR ' + window.NPR_RATE.toFixed(0) + ' (live)'
        : '(live rate unavailable)';
    }
  }

  function saveFromForm() {
    var usdNpr  = parseFloat(_getVal('fset-usd-npr'));
    var inrNpr  = parseFloat(_getVal('fset-inr-npr'));
    var expDays = parseInt(_getVal('fset-expiry-days'), 10);
    var payDays = parseInt(_getVal('fset-payment-days'), 10);
    var defCur  = _getVal('fset-default-currency');

    var errEl = document.getElementById('fset-err');
    if (errEl) errEl.textContent = '';
    function showErr(msg) { if (errEl) errEl.textContent = msg; }

    if (isNaN(usdNpr) || usdNpr <= 0) { showErr('Invalid USD\u2192NPR rate'); return; }
    if (isNaN(inrNpr) || inrNpr <= 0) { showErr('Invalid INR\u2192NPR rate'); return; }
    if (isNaN(expDays) || expDays < 1) { showErr('Expiry warning must be \u22651 day'); return; }
    if (isNaN(payDays) || payDays < 1) { showErr('Payment warning must be \u22651 day'); return; }

    _s.usdToNpr           = usdNpr;
    _s.inrToNpr           = inrNpr;
    _s.expiryWarningDays  = expDays;
    _s.paymentWarningDays = payDays;
    _s.defaultCurrency    = defCur;
    _persist();

    window.NPR_RATE = usdNpr;
    App.showToast('Settings saved', 'ok');
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  // ─── DOM helpers ──────────────────────────────────────────────────────

  function _setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = (val == null ? '' : val);
  }
  function _getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // ─── Init (lazy — _load is deferred until first get() call) ──────────

  function init() { /* nothing to do eagerly */ }

  // ─── Public ───────────────────────────────────────────────────────────

  return {
    init:           init,
    get:            get,
    toNpr:          toNpr,
    fmtAmt:         fmtAmt,
    fmtWithNpr:     fmtWithNpr,
    onTabActivated: onTabActivated,
    saveFromForm:   saveFromForm,
  };

})();
