'use strict';

/* ═══════════════════════════════════════════════════════════════
   Server Billing Engine — BillingEngine global
   Computes final NPR price from raw server config.
   All tax/margin logic is internal; customers see only the final.
   Admin config lives in window.BillingConfig (set by FinSettings
   or from localStorage).
   ═══════════════════════════════════════════════════════════════ */

const BillingEngine = (function () {

  // ─── AWS ap-south-1 on-demand Linux hourly rates (USD) ───────────────────
  var INSTANCE_RATES = {
    't3.micro':  0.0116,
    't3.small':  0.0232,
    't3.medium': 0.0464,
    't3.large':  0.0928,
    'm5.large':  0.1070,
    'm5.xlarge': 0.2140,
    'c5.xlarge': 0.1920,
    // Extended common types
    't3.xlarge':  0.1664,
    't3.2xlarge': 0.3328,
    'c5.large':   0.0960,
    'c5.2xlarge': 0.3840,
    'r5.large':   0.1260,
    'r5.xlarge':  0.2520,
  };

  // ─── Default admin config (overridden by window.BillingConfig) ──────────
  var DEFAULTS = {
    wht_rate:       0.18,   // 18%
    margin_rate:    0.12,   // 12%
    vat_rate:       0.13,   // 13%
    usd_to_npr:     135,
    usd_to_inr:     84,
    show_breakdown: false,  // admin toggle: show tax lines to customers
  };

  // ─── Read live config (falls back to defaults) ────────────────────────────
  function _cfg() {
    var c = window.BillingConfig || {};
    return {
      wht_rate:       (typeof c.wht_rate      === 'number') ? c.wht_rate      : DEFAULTS.wht_rate,
      margin_rate:    (typeof c.margin_rate   === 'number') ? c.margin_rate   : DEFAULTS.margin_rate,
      vat_rate:       (typeof c.vat_rate      === 'number') ? c.vat_rate      : DEFAULTS.vat_rate,
      usd_to_npr:     (typeof c.usd_to_npr    === 'number') ? c.usd_to_npr    : DEFAULTS.usd_to_npr,
      usd_to_inr:     (typeof c.usd_to_inr    === 'number') ? c.usd_to_inr    : DEFAULTS.usd_to_inr,
      show_breakdown: (typeof c.show_breakdown === 'boolean') ? c.show_breakdown : DEFAULTS.show_breakdown,
    };
  }

  // ─── Load persisted admin config from localStorage ────────────────────────
  function loadConfig() {
    try {
      var raw = localStorage.getItem('ec2ctrl_billing_config');
      if (raw) {
        var parsed = JSON.parse(raw);
        window.BillingConfig = Object.assign({}, DEFAULTS, parsed);
      } else {
        window.BillingConfig = Object.assign({}, DEFAULTS);
      }
    } catch (_) {
      window.BillingConfig = Object.assign({}, DEFAULTS);
    }
  }

  // ─── Save admin config to localStorage ────────────────────────────────────
  function saveConfig(updates) {
    var current = _cfg();
    var next    = Object.assign({}, current, updates);
    window.BillingConfig = next;
    try { localStorage.setItem('ec2ctrl_billing_config', JSON.stringify(next)); } catch (_) {}
    return next;
  }

  // ─── Get hourly rate for an instance type ─────────────────────────────────
  function getHourlyRate(instanceType) {
    return INSTANCE_RATES[instanceType] || 0;
  }

  /* ──────────────────────────────────────────────────────────────────────────
     compute(opts) → billing fields object

     opts:
       instanceType    string    e.g. 't3.micro'
       hoursPerDay     number    1–24 (billing hours per day)
       storageGb       number    EBS storage in GB
       isRunning       boolean   true = instance is running (Static IP free)
       dataTransferGb  number    estimated monthly data transfer (default 0)
       snapshotGb      number    backup snapshot size (default 0)
       detailedMonitor boolean   true = detailed CloudWatch monitoring enabled

     Returns:
       { instanceCost, ebsCost, staticIpCost, dataTransferCost, backupCost,
         monitorCost, subtotal, wht, totalAfterWht, margin, totalBeforeVat,
         vat, finalUsd, finalNpr, finalInr, hourlyRate, cfg }
  ────────────────────────────────────────────────────────────────────────── */
  function compute(opts) {
    opts = opts || {};
    var cfg = _cfg();

    var hourlyRate      = getHourlyRate(opts.instanceType || '');
    var hoursPerDay     = Math.max(0, Math.min(24, opts.hoursPerDay || 24));
    var storageGb       = Math.max(0, opts.storageGb || 0);
    var isRunning       = opts.isRunning !== false;  // default: running
    var dataTransferGb  = Math.max(0, opts.dataTransferGb || 0);
    var snapshotGb      = Math.max(0, opts.snapshotGb || 0);
    var detailedMonitor = !!opts.detailedMonitor;

    var instanceCost     = hourlyRate * hoursPerDay * 30;
    var ebsCost          = storageGb * 0.08;
    var staticIpCost     = isRunning ? 0 : 3.65;
    var dataTransferCost = dataTransferGb * 0.09;
    var backupCost       = snapshotGb * 0.05;
    var monitorCost      = detailedMonitor ? 2.10 : 0;

    var subtotal         = instanceCost + ebsCost + staticIpCost + dataTransferCost + backupCost + monitorCost;
    var wht              = subtotal * cfg.wht_rate;
    var totalAfterWht    = subtotal + wht;
    var margin           = totalAfterWht * cfg.margin_rate;
    var totalBeforeVat   = totalAfterWht + margin;
    var vat              = totalBeforeVat * cfg.vat_rate;
    var finalUsd         = totalBeforeVat + vat;
    var finalNpr         = finalUsd * cfg.usd_to_npr;
    var finalInr         = finalUsd * cfg.usd_to_inr;

    // Per-second cost for live ticker (monthly → per second)
    var perSecondNpr = finalNpr / 30 / 24 / 3600;

    return {
      hourlyRate:       hourlyRate,
      instanceCost:     instanceCost,
      ebsCost:          ebsCost,
      staticIpCost:     staticIpCost,
      dataTransferCost: dataTransferCost,
      backupCost:       backupCost,
      monitorCost:      monitorCost,
      subtotal:         subtotal,
      wht:              wht,
      totalAfterWht:    totalAfterWht,
      margin:           margin,
      totalBeforeVat:   totalBeforeVat,
      vat:              vat,
      finalUsd:         finalUsd,
      finalNpr:         finalNpr,
      finalInr:         finalInr,
      perSecondNpr:     perSecondNpr,
      cfg:              cfg,
      show_breakdown:   cfg.show_breakdown,
    };
  }

  // ─── Format NPR with grouping ─────────────────────────────────────────────
  function fmtNpr(amount) {
    if (!amount || amount <= 0) return '—';
    return 'NPR\u00a0' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ─── Format USD ───────────────────────────────────────────────────────────
  function fmtUsd(amount) {
    if (!amount || amount <= 0) return '—';
    return '$' + amount.toFixed(2);
  }

  // ─── Build collapsed cost summary (what customers see) ───────────────────
  function summaryHtml(billing) {
    var nprStr = fmtNpr(billing.finalNpr);
    var usdStr = fmtUsd(billing.finalUsd);
    var breakdown = '';

    if (billing.show_breakdown) {
      var items = [
        { label: 'Instance compute',  val: fmtNpr(billing.instanceCost     * billing.cfg.usd_to_npr) },
        { label: 'EBS storage',       val: fmtNpr(billing.ebsCost           * billing.cfg.usd_to_npr) },
      ];
      if (billing.staticIpCost > 0)
        items.push({ label: 'Static IP (while stopped)', val: fmtNpr(billing.staticIpCost * billing.cfg.usd_to_npr) });
      if (billing.dataTransferCost > 0)
        items.push({ label: 'Data transfer',  val: fmtNpr(billing.dataTransferCost * billing.cfg.usd_to_npr) });
      if (billing.backupCost > 0)
        items.push({ label: 'Backup storage', val: fmtNpr(billing.backupCost        * billing.cfg.usd_to_npr) });
      if (billing.monitorCost > 0)
        items.push({ label: 'Detailed monitoring', val: fmtNpr(billing.monitorCost  * billing.cfg.usd_to_npr) });

      breakdown =
        '<div class="be-breakdown">' +
        items.map(function (it) {
          return '<div class="be-breakdown-row"><span>' + it.label + '</span><span>' + it.val + '</span></div>';
        }).join('') +
        '</div>';
    }

    return (
      '<div class="be-summary">' +
        '<div class="be-summary-main">' +
          '<span class="be-summary-label">Monthly cost</span>' +
          '<span class="be-summary-amount">' + nprStr + '</span>' +
          '<span class="be-summary-usd">' + usdStr + '</span>' +
        '</div>' +
        breakdown +
      '</div>'
    );
  }

  // ─── Quick Launch Templates ───────────────────────────────────────────────
  var TEMPLATES = [
    {
      id:          'starter-blog',
      name:        'Starter Blog',
      description: 'Personal websites, portfolios, and blogs',
      badge:       'Most Affordable',
      badgeClass:  'tpl-badge--green',
      icon:        '📝',
      instanceType: 't3.micro',
      vcpu:        2,
      ram:         '1 GB',
      storageGb:   20,
      platform:    'ubuntu',
      detailedMonitor: true,
      elasticIp:   true,
      useCases:    ['WordPress', 'Ghost', 'Static sites'],
    },
    {
      id:          'dev-sandbox',
      name:        'Dev Sandbox',
      description: 'Development, testing, and CI environments',
      badge:       'Developer Pick',
      badgeClass:  'tpl-badge--blue',
      icon:        '🛠️',
      instanceType: 't3.medium',
      vcpu:        2,
      ram:         '4 GB',
      storageGb:   30,
      platform:    'ubuntu',
      detailedMonitor: true,
      elasticIp:   true,
      useCases:    ['Node.js', 'Python', 'Docker'],
    },
    {
      id:          'ecommerce',
      name:        'E-Commerce',
      description: 'Online stores with moderate traffic',
      badge:       'Popular',
      badgeClass:  'tpl-badge--amber',
      icon:        '🛒',
      instanceType: 't3.large',
      vcpu:        2,
      ram:         '8 GB',
      storageGb:   50,
      platform:    'ubuntu',
      detailedMonitor: true,
      elasticIp:   true,
      useCases:    ['WooCommerce', 'Magento', 'Shopify self-hosted'],
    },
    {
      id:          'analytics',
      name:        'Analytics Engine',
      description: 'Data processing and analytics workloads',
      badge:       'High Memory',
      badgeClass:  'tpl-badge--violet',
      icon:        '📊',
      instanceType: 'm5.large',
      vcpu:        2,
      ram:         '8 GB',
      storageGb:   100,
      platform:    'ubuntu',
      detailedMonitor: true,
      elasticIp:   true,
      useCases:    ['Jupyter', 'Pandas', 'Spark'],
    },
    {
      id:          'game-server',
      name:        'Game Server',
      description: 'High-performance multiplayer game hosting',
      badge:       'High CPU',
      badgeClass:  'tpl-badge--red',
      icon:        '🎮',
      instanceType: 'c5.xlarge',
      vcpu:        4,
      ram:         '8 GB',
      storageGb:   80,
      platform:    'ubuntu',
      detailedMonitor: true,
      elasticIp:   true,
      useCases:    ['Minecraft', 'CS2', 'Valheim'],
    },
    {
      id:          'enterprise-api',
      name:        'Enterprise API',
      description: 'High-traffic backends and microservices',
      badge:       'Enterprise',
      badgeClass:  'tpl-badge--cyan',
      icon:        '⚡',
      instanceType: 'm5.xlarge',
      vcpu:        4,
      ram:         '16 GB',
      storageGb:   200,
      platform:    'ubuntu',
      detailedMonitor: true,
      elasticIp:   true,
      useCases:    ['REST APIs', 'GraphQL', 'gRPC'],
    },
  ];

  // Custom admin-added templates stored in localStorage
  var CUSTOM_TEMPLATES_KEY = 'ec2ctrl_custom_templates';

  function _loadCustomTemplates() {
    try {
      var raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function saveCustomTemplate(tpl) {
    var customs = _loadCustomTemplates();
    var idx = customs.findIndex(function (t) { return t.id === tpl.id; });
    if (idx >= 0) customs[idx] = tpl; else customs.push(tpl);
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(customs));
  }

  function deleteCustomTemplate(tplId) {
    var customs = _loadCustomTemplates().filter(function (t) { return t.id !== tplId; });
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(customs));
  }

  function getAllTemplates() {
    return TEMPLATES.concat(_loadCustomTemplates());
  }

  function getTemplates() { return TEMPLATES; }

  // ─── Compute billing for each template at 8 hrs/day (business hours) ─────
  // Cards show 8-hr price as the "from" price (lower = more attractive).
  // Wizard step 2 always shows the exact price for the customer's chosen uptime.
  function templatePrices() {
    return getAllTemplates().map(function (t) {
      var b = compute({
        instanceType:    t.instanceType,
        hoursPerDay:     8,          // display price at business hours
        storageGb:       t.storageGb,
        isRunning:       true,
        detailedMonitor: t.detailedMonitor,
        elasticIp:       t.elasticIp,
      });
      return Object.assign({}, t, { billing: b });
    });
  }

  // ─── 12-month forecast (simple compound growth) ──────────────────────────
  function forecast12m(monthlyNpr, growthRate) {
    growthRate = growthRate || 0.03; // 3% monthly growth default
    var points = [];
    var now    = new Date();
    for (var i = 0; i < 12; i++) {
      var mo  = new Date(now.getFullYear(), now.getMonth() + i, 1);
      var lbl = mo.toLocaleString('en', { month: 'short' }) + ' ' + mo.getFullYear().toString().slice(2);
      points.push({
        label: lbl,
        value: monthlyNpr * Math.pow(1 + growthRate, i),
      });
    }
    return points;
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  return {
    loadConfig:     loadConfig,
    saveConfig:     saveConfig,
    compute:        compute,
    getHourlyRate:  getHourlyRate,
    getTemplates:   getTemplates,
    templatePrices: templatePrices,
    forecast12m:    forecast12m,
    fmtNpr:         fmtNpr,
    fmtUsd:         fmtUsd,
    summaryHtml:    summaryHtml,
    getDefaults:    function () { return Object.assign({}, DEFAULTS); },
    getConfig:      _cfg,
    INSTANCE_RATES: INSTANCE_RATES,
  };

})();

// ─── Auto-load config on script parse ────────────────────────────────────────
BillingEngine.loadConfig();
