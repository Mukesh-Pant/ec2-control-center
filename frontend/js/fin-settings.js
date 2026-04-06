'use strict';

/* ═══════════════════════════════════════════════════
   Finance Settings - exchange rates, billing engine,
   tax management, alert thresholds, defaults
   IIFE → FinSettings global
   ═══════════════════════════════════════════════════ */

const FinSettings = (function () {

  var STORAGE_KEY         = 'ec2ctrl_fin_settings';
  var TAX_ACCOUNTS_KEY    = 'ec2ctrl_tax_accounts';

  var DEFAULTS = {
    usdToNpr: 135,
    inrToNpr: 1.62,
    expiryWarningDays: 30,
    paymentWarningDays: 7,
    defaultCurrency: 'USD',
  };

  var CURRENCY_SYMBOLS = { USD: '$', NPR: 'NPR\u00a0', INR: '\u20b9' };

  var _s              = null;
  var _taxAccounts    = null;  // { accountId: { rebate: 0, customWht: null, customVat: null, customMargin: null } }

  // ─── Persistence ──────────────────────────────────────────────────────

  function _load() {
    if (_s) return;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      _s = raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
    } catch (e) {
      _s = Object.assign({}, DEFAULTS);
    }
  }

  function _loadTaxAccounts() {
    if (_taxAccounts) return;
    try {
      var raw = localStorage.getItem(TAX_ACCOUNTS_KEY);
      _taxAccounts = raw ? JSON.parse(raw) : {};
    } catch (e) {
      _taxAccounts = {};
    }
  }

  function _persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_s));
  }

  function _persistTaxAccounts() {
    localStorage.setItem(TAX_ACCOUNTS_KEY, JSON.stringify(_taxAccounts));
  }

  // ─── Public getters ───────────────────────────────────────────────────

  function get() {
    if (!_s) _load();
    return Object.assign({}, _s);
  }

  // Returns tax overrides for a specific account (null = use global defaults)
  function getTaxForAccount(accountId) {
    _loadTaxAccounts();
    return _taxAccounts[accountId] || null;
  }

  // ─── Currency helpers ─────────────────────────────────────────────────

  function toNpr(amount, currency) {
    if (!_s) _load();
    if (currency === 'NPR') return amount;
    if (currency === 'USD') {
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

  function fmtWithNpr(amount, currency) {
    var primary = fmtAmt(amount, currency);
    if (currency === 'NPR') return primary;
    var npr = Math.round(toNpr(amount, currency));
    return primary + '<span class="fm-npr">\u00a0NPR\u00a0' + npr.toLocaleString('en-IN') + '</span>';
  }

  // ─── Settings page ────────────────────────────────────────────────────

  function onTabActivated() {
    _renderForm();
    _renderTaxAccountsSection();
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

  // ─── Billing Engine config section ───────────────────────────────────

  function _renderBillingEngineSection() {
    var role = (typeof Auth !== 'undefined' && Auth.getRole) ? Auth.getRole() : '';
    var container = document.getElementById('fset-billing-engine');
    if (!container) return;
    if (role !== 'admin') { container.innerHTML = ''; return; }

    var cfg = (typeof BillingEngine !== 'undefined') ? BillingEngine.getConfig() : {};
    container.innerHTML =
      '<div class="fset-section-title">Billing Engine Configuration</div>' +
      '<p class="fset-section-desc">These rates apply globally to all customer invoices. Customers see only the final tax-inclusive price.</p>' +
      '<div class="fset-grid">' +
        '<div class="fg">' +
          '<label class="fl" for="bcfg-wht">WHT Rate (%)</label>' +
          '<input class="finp" id="bcfg-wht" type="number" step="0.1" min="0" max="50" value="' + ((cfg.wht_rate || 0.18) * 100).toFixed(1) + '"/>' +
          '<span class="fset-field-hint">Withholding Tax</span>' +
        '</div>' +
        '<div class="fg">' +
          '<label class="fl" for="bcfg-margin">Margin Rate (%)</label>' +
          '<input class="finp" id="bcfg-margin" type="number" step="0.1" min="0" max="100" value="' + ((cfg.margin_rate || 0.12) * 100).toFixed(1) + '"/>' +
          '<span class="fset-field-hint">Service margin on top of AWS cost</span>' +
        '</div>' +
        '<div class="fg">' +
          '<label class="fl" for="bcfg-vat">VAT Rate (%)</label>' +
          '<input class="finp" id="bcfg-vat" type="number" step="0.1" min="0" max="50" value="' + ((cfg.vat_rate || 0.13) * 100).toFixed(1) + '"/>' +
          '<span class="fset-field-hint">Value Added Tax</span>' +
        '</div>' +
        '<div class="fg">' +
          '<label class="fl" for="bcfg-npr">USD \u2192 NPR Rate</label>' +
          '<input class="finp" id="bcfg-npr" type="number" step="0.5" min="100" max="500" value="' + (cfg.usd_to_npr || 135) + '"/>' +
        '</div>' +
        '<div class="fg">' +
          '<label class="fl" for="bcfg-inr">USD \u2192 INR Rate</label>' +
          '<input class="finp" id="bcfg-inr" type="number" step="0.5" min="50" max="200" value="' + (cfg.usd_to_inr || 84) + '"/>' +
        '</div>' +
      '</div>' +
      '<div class="fset-toggle-row">' +
        '<input type="checkbox" id="bcfg-breakdown"' + (cfg.show_breakdown ? ' checked' : '') + '/>' +
        '<label for="bcfg-breakdown">Show tax breakdown to customers (collapsed by default)</label>' +
      '</div>' +
      '<button class="btn btn-blue fset-save-btn" onclick="FinSettings.saveBillingEngine()">Save Billing Config</button>' +
      '<div class="fset-err" id="bcfg-err"></div>';
  }

  function saveBillingEngine() {
    if (typeof BillingEngine === 'undefined') return;
    var errEl = document.getElementById('bcfg-err');
    if (errEl) errEl.textContent = '';

    var wht       = parseFloat(_getVal('bcfg-wht'))     / 100;
    var margin    = parseFloat(_getVal('bcfg-margin'))  / 100;
    var vat       = parseFloat(_getVal('bcfg-vat'))     / 100;
    var npr       = parseFloat(_getVal('bcfg-npr'));
    var inr       = parseFloat(_getVal('bcfg-inr'));
    var _bdEl = document.getElementById('bcfg-breakdown');
    var breakdown = !!(_bdEl && _bdEl.checked);

    if (isNaN(wht) || wht < 0)    { if (errEl) errEl.textContent = 'Invalid WHT rate';    return; }
    if (isNaN(margin) || margin < 0) { if (errEl) errEl.textContent = 'Invalid margin rate'; return; }
    if (isNaN(vat) || vat < 0)    { if (errEl) errEl.textContent = 'Invalid VAT rate';    return; }
    if (isNaN(npr) || npr <= 0)   { if (errEl) errEl.textContent = 'Invalid NPR rate';    return; }
    if (isNaN(inr) || inr <= 0)   { if (errEl) errEl.textContent = 'Invalid INR rate';    return; }

    BillingEngine.saveConfig({ wht_rate: wht, margin_rate: margin, vat_rate: vat, usd_to_npr: npr, usd_to_inr: inr, show_breakdown: breakdown });
    App.showToast('Billing config saved', 'ok');
  }

  // ─── Tax per-account section ──────────────────────────────────────────

  function _renderTaxAccountsSection() {
    var role = (typeof Auth !== 'undefined' && Auth.getRole) ? Auth.getRole() : '';
    var container = document.getElementById('fset-tax-accounts');
    if (!container) return;
    if (role !== 'admin') { container.innerHTML = ''; return; }

    _loadTaxAccounts();

    var accounts = [];
    if (typeof API !== 'undefined') {
      // Use cached accounts if available; async load otherwise
      _loadAccountsForTax(function (accts) {
        accounts = accts;
        _doRenderTaxAccounts(container, accounts);
      });
    } else {
      _doRenderTaxAccounts(container, []);
    }
  }

  function _loadAccountsForTax(cb) {
    if (window._fsetAccountsCache) { cb(window._fsetAccountsCache); return; }
    API.getAccounts().then(function (res) {
      return res.json();
    }).then(function (data) {
      window._fsetAccountsCache = (data.accounts || []).filter(function (a) { return a.enabled; });
      cb(window._fsetAccountsCache);
    }).catch(function () { cb([]); });
  }

  function _doRenderTaxAccounts(container, accounts) {
    _loadTaxAccounts();
    var cfg = (typeof BillingEngine !== 'undefined') ? BillingEngine.getConfig() : { wht_rate: 0.18, margin_rate: 0.12, vat_rate: 0.13 };

    var rowsHtml = accounts.length === 0
      ? '<div class="fset-tax-empty">No enabled accounts found. Add member accounts first.</div>'
      : accounts.map(function (acct) {
          var id     = acct.accountId;
          var name   = acct.name || id;
          var ovr    = _taxAccounts[id] || {};
          var rebate = ovr.rebate != null ? ovr.rebate : 0;
          var customWht    = ovr.customWht    != null ? ovr.customWht    : '';
          var customVat    = ovr.customVat    != null ? ovr.customVat    : '';
          var customMargin = ovr.customMargin != null ? ovr.customMargin : '';
          return (
            '<div class="fset-tax-row" id="fset-tax-row-' + _esc(id) + '">' +
              '<div class="fset-tax-account">' +
                '<div class="fset-tax-acct-name">' + _esc(name) + '</div>' +
                '<div class="fset-tax-acct-id">' + _esc(id) + '</div>' +
              '</div>' +
              '<div class="fset-tax-fields">' +
                '<div class="fset-tax-field">' +
                  '<label class="fset-tax-lbl">WHT % <span class="fset-tax-dflt">(global: ' + (cfg.wht_rate * 100).toFixed(1) + '%)</span></label>' +
                  '<input class="fset-tax-input" type="number" step="0.1" min="0" max="50" placeholder="Use global" ' +
                    'id="ta-wht-' + _esc(id) + '" value="' + _esc(String(customWht)) + '"/>' +
                '</div>' +
                '<div class="fset-tax-field">' +
                  '<label class="fset-tax-lbl">VAT % <span class="fset-tax-dflt">(global: ' + (cfg.vat_rate * 100).toFixed(1) + '%)</span></label>' +
                  '<input class="fset-tax-input" type="number" step="0.1" min="0" max="50" placeholder="Use global" ' +
                    'id="ta-vat-' + _esc(id) + '" value="' + _esc(String(customVat)) + '"/>' +
                '</div>' +
                '<div class="fset-tax-field">' +
                  '<label class="fset-tax-lbl">Margin % <span class="fset-tax-dflt">(global: ' + (cfg.margin_rate * 100).toFixed(1) + '%)</span></label>' +
                  '<input class="fset-tax-input" type="number" step="0.1" min="0" max="100" placeholder="Use global" ' +
                    'id="ta-margin-' + _esc(id) + '" value="' + _esc(String(customMargin)) + '"/>' +
                '</div>' +
                '<div class="fset-tax-field">' +
                  '<label class="fset-tax-lbl">Rebate % <span class="fset-tax-dflt fset-tax-rebate-hint">(discount)</span></label>' +
                  '<input class="fset-tax-input fset-tax-input--rebate" type="number" step="0.1" min="0" max="100" placeholder="0" ' +
                    'id="ta-rebate-' + _esc(id) + '" value="' + _esc(String(rebate)) + '"/>' +
                '</div>' +
              '</div>' +
              '<button class="btn btn-sm btn-outline fset-tax-save-btn" onclick="FinSettings.saveTaxAccount(\'' + _esc(id) + '\')">Apply</button>' +
            '</div>'
          );
        }).join('');

    container.innerHTML =
      '<div class="fset-section-title">Tax Management - Per Account</div>' +
      '<p class="fset-section-desc">Override global rates per customer account. Rebate (discount) is applied to the final price and shown as a discount line item to customers. Leave a field blank to use the global default.</p>' +
      '<div class="fset-tax-list">' + rowsHtml + '</div>' +
      '<div class="fset-err" id="fset-tax-err"></div>';
  }

  function saveTaxAccount(accountId) {
    _loadTaxAccounts();
    var errEl = document.getElementById('fset-tax-err');
    if (errEl) errEl.textContent = '';

    function _fv(id) {
      var el = document.getElementById(id);
      if (!el) return null;
      var v = el.value.trim();
      return v === '' ? null : parseFloat(v);
    }

    var wht    = _fv('ta-wht-'    + accountId);
    var vat    = _fv('ta-vat-'    + accountId);
    var margin = _fv('ta-margin-' + accountId);
    var rebate = _fv('ta-rebate-' + accountId);

    if (wht    !== null && (isNaN(wht)    || wht < 0 || wht > 50))    { if (errEl) errEl.textContent = 'Invalid WHT %';    return; }
    if (vat    !== null && (isNaN(vat)    || vat < 0 || vat > 50))    { if (errEl) errEl.textContent = 'Invalid VAT %';    return; }
    if (margin !== null && (isNaN(margin) || margin < 0 || margin > 100)) { if (errEl) errEl.textContent = 'Invalid Margin %'; return; }
    if (rebate !== null && (isNaN(rebate) || rebate < 0 || rebate > 100)) { if (errEl) errEl.textContent = 'Invalid Rebate %'; return; }

    _taxAccounts[accountId] = {
      customWht:    wht    !== null ? wht / 100    : null,
      customVat:    vat    !== null ? vat / 100    : null,
      customMargin: margin !== null ? margin / 100 : null,
      rebate:       rebate !== null ? rebate / 100 : 0,
    };
    _persistTaxAccounts();
    App.showToast('Tax settings saved for account ' + accountId.substring(0, 8) + '\u2026', 'ok');
  }

  // ─── Compute billing for account with overrides applied ──────────────
  // Used by Labs/BillingEngine to get account-specific final price
  function computeWithAccountTax(accountId, opts) {
    if (typeof BillingEngine === 'undefined') return null;
    _loadTaxAccounts();
    var ovr = _taxAccounts[accountId] || {};
    var cfg = BillingEngine.getConfig();

    // Merge overrides
    var effectiveCfg = Object.assign({}, cfg, {
      wht_rate:    ovr.customWht    != null ? ovr.customWht    : cfg.wht_rate,
      vat_rate:    ovr.customVat    != null ? ovr.customVat    : cfg.vat_rate,
      margin_rate: ovr.customMargin != null ? ovr.customMargin : cfg.margin_rate,
    });

    // Temporarily swap config, compute, restore
    var orig = window.BillingConfig;
    window.BillingConfig = effectiveCfg;
    var result = BillingEngine.compute(opts);
    window.BillingConfig = orig;

    // Apply rebate on final price
    var rebate = ovr.rebate || 0;
    if (rebate > 0) {
      var rebateNpr  = result.finalNpr  * rebate;
      var rebateUsd  = result.finalUsd  * rebate;
      result.rebate     = rebate;
      result.rebateNpr  = rebateNpr;
      result.rebateUsd  = rebateUsd;
      result.finalNpr   = result.finalNpr  - rebateNpr;
      result.finalUsd   = result.finalUsd  - rebateUsd;
      result.finalInr   = result.finalUsd  * effectiveCfg.usd_to_inr;
      result.perSecondNpr = result.finalNpr / 30 / 24 / 3600;
    }
    return result;
  }

  // ─── saveFromForm (basic settings) ───────────────────────────────────

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

    if (!_s) _load();
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
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function init() { /* lazy */ }

  return {
    init:                    init,
    get:                     get,
    getTaxForAccount:        getTaxForAccount,
    computeWithAccountTax:   computeWithAccountTax,
    toNpr:                   toNpr,
    fmtAmt:                  fmtAmt,
    fmtWithNpr:              fmtWithNpr,
    onTabActivated:          onTabActivated,
    saveFromForm:            saveFromForm,
    saveBillingEngine:       saveBillingEngine,
    saveTaxAccount:          saveTaxAccount,
  };

})();
