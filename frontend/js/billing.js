/* ═══════════════════════════════════════════════════════
   Billing Module — AWS Cost Explorer detailed cost report
   Manual trigger only — no auto-loading on tab open.
   ═══════════════════════════════════════════════════════ */

const Billing = (function () {

  // ─── State ───────────────────────────────────────────────────────────────────
  var lastUpdated = null;
  var lastData    = null;

  // ─── Load (triggered ONLY by "Get Cost Update" button) ───────────────────────

  async function load() {
    var range      = document.getElementById('bill-range').value;
    var filterType = document.getElementById('bill-filter-type').value;
    var accountId  = null;
    if (filterType === 'account') {
      accountId = document.getElementById('bill-filter-val').value || null;
    }

    _setBtnLoading(true);
    _setReportLoading();
    App.log('Fetching billing data from AWS Cost Explorer (' + range + ')…', 'sys');

    try {
      var res  = await API.getBilling(range, accountId);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);

      lastData    = data;
      lastUpdated = new Date();

      _updateLastUpdated();
      _populateAccountFilter(data);
      _renderSummaryCards(data, range);
      _renderReport(data);
      _renderTodaySessions();
      App.log('Billing loaded — total $' + (data.grandTotal || 0).toFixed(4), 'ok');

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        App.log('Billing error: ' + err.message, 'err');
        App.showToast('Failed to load billing: ' + err.message, 'err');
        _setReportError(err.message);
      }
    } finally {
      _setBtnLoading(false);
    }
  }

  // ─── Filter Type Change (no auto-load) ────────────────────────────────────────
  function onFilterTypeChange() {
    var filterType = document.getElementById('bill-filter-type').value;
    var wrap       = document.getElementById('bill-filter-val-wrap');
    if (wrap) wrap.style.display = filterType === 'account' ? '' : 'none';
  }

  // ─── Populate Account Filter ─────────────────────────────────────────────────
  function _populateAccountFilter(data) {
    var sel = document.getElementById('bill-filter-val');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '';
    var byAcct = data.byAccount || {};
    Object.keys(byAcct).forEach(function (id) {
      var opt = document.createElement('option');
      opt.value       = id;
      opt.textContent = (byAcct[id].accountName || id) + ' (' + id + ')';
      if (id === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ─── Summary Cards ────────────────────────────────────────────────────────────
  function _renderSummaryCards(data, range) {
    var grand    = data.grandTotal || 0;
    var ec2      = data.ec2Total   || 0;
    var ebs      = data.ebsTotal   || 0;
    var byAcct   = data.byAccount  || {};

    var rangeLabels = {
      today:     'Today',
      yesterday: 'Yesterday',
      '7d':      'Last 7 Days',
      '14d':     'Last 14 Days',
      '30d':     'Last 30 Days',
    };

    App.setText('bill-period',     '$' + grand.toFixed(4));
    App.setText('bill-period-lbl', rangeLabels[range] || range);
    App.setText('bill-ec2',        '$' + ec2.toFixed(4));
    App.setText('bill-ebs',        '$' + ebs.toFixed(4));

    var days = _rangeDays(range);
    var proj = days > 0 ? (grand / days) * 30 : 0;
    App.setText('bill-proj', '$' + proj.toFixed(4));
  }

  function _rangeDays(r) {
    if (r === 'today' || r === 'yesterday') return 1;
    if (r === '7d')  return 7;
    if (r === '14d') return 14;
    if (r === '30d') return 30;
    return 7;
  }

  // ─── Main Report Renderer ──────────────────────────────────────────────────────
  function _renderReport(data) {
    var wrap   = document.getElementById('bill-report-wrap');
    var byAcct = data.byAccount || {};
    var ids    = Object.keys(byAcct);

    App.setText('bill-count', ids.length + ' account' + (ids.length !== 1 ? 's' : ''));

    if (ids.length === 0) {
      wrap.innerHTML = _emptyBlock('💰', 'No cost data found for the selected period.');
      return;
    }

    // Sort by total descending
    ids.sort(function (a, b) { return (byAcct[b].total || 0) - (byAcct[a].total || 0); });

    var html = ids.map(function (id) {
      return _renderAccountCard(id, byAcct[id], data);
    }).join('');

    // Disclaimer
    if (data.disclaimer) {
      html += '<div class="bill-disclaimer">ℹ ' + App.esc(data.disclaimer) + '</div>';
    }

    wrap.innerHTML = html;
  }

  // ─── Per-Account Card ──────────────────────────────────────────────────────────
  function _renderAccountCard(id, a, data) {
    var name      = App.esc(a.accountName || id);
    var total     = a.total     || 0;
    var ec2       = a.ec2       || 0;
    var ebs       = a.ebs       || 0;
    var otherEc2  = a.other_ec2 || 0;
    var otherSvc  = a.other_services || 0;
    var limited   = a.limitedData;

    var sourceBadge = limited
      ? '<span class="limited-badge">⚠ Limited Data</span>'
      : '<span class="ce-badge">✓ Cost Explorer</span>';

    // Top mini-summary row
    var summaryRow =
      '<div class="acct-cost-summary">' +
        _miniCostBox('Total AWS',   total,    'amber') +
        _miniCostBox('EC2 Compute', ec2,      'cyan') +
        _miniCostBox('EBS Storage', ebs,      'blue') +
        _miniCostBox('EC2 Other',   otherEc2, 'ink3') +
        _miniCostBox('Other Svcs',  otherSvc, 'ink3') +
      '</div>';

    // Service breakdown table
    var svcBreakdown = _renderServiceBreakdown(a.by_service || {}, total);

    // EC2 usage types
    var utBreakdown = _renderUsageTypes(a.usageTypes || []);

    // Daily trend
    var dailyTrend = _renderDailyTrend(a.daily || {}, total);

    return (
      '<div class="acct-report-card">' +
        '<div class="acct-report-hd">' +
          '<div class="acct-report-name">' + name + '</div>' +
          '<div class="acct-report-id">' + App.esc(id) + '</div>' +
          '<div style="margin-left:auto;display:flex;gap:8px;align-items:center">' + sourceBadge + '</div>' +
        '</div>' +

        summaryRow +

        '<div class="acct-report-sections">' +
          svcBreakdown +
          (utBreakdown ? utBreakdown : '') +
          dailyTrend +
        '</div>' +
      '</div>'
    );
  }

  function _miniCostBox(label, amount, color) {
    var cls = color === 'amber' ? 'cost-amber' :
              color === 'cyan'  ? 'cost-cyan'  :
              color === 'blue'  ? 'cost-blue'  : 'cost-muted';
    return (
      '<div class="mini-cost-box">' +
        '<div class="mini-cost-lbl">' + label + '</div>' +
        '<div class="mini-cost-val ' + cls + '">' +
          (amount > 0 ? '$' + amount.toFixed(4) : '<span class="cost-zero">$0.00</span>') +
        '</div>' +
      '</div>'
    );
  }

  // ─── Service Breakdown Section ────────────────────────────────────────────────
  function _renderServiceBreakdown(byService, totalCost) {
    var entries = Object.keys(byService).map(function (svc) {
      return { svc: svc, cost: byService[svc] };
    });
    entries.sort(function (a, b) { return b.cost - a.cost; });

    if (entries.length === 0) {
      return (
        '<div class="report-section">' +
          '<div class="report-section-title">All AWS Services</div>' +
          '<div class="report-empty-msg">No cost data for this period.</div>' +
        '</div>'
      );
    }

    var maxCost = entries[0].cost;

    var rows = entries.map(function (e) {
      var pct     = maxCost > 0 ? Math.min(100, (e.cost / maxCost * 100)).toFixed(1) : 0;
      var sharePct = totalCost > 0 ? (e.cost / totalCost * 100).toFixed(1) : '0';
      var isEc2 = (
        e.svc === 'Amazon Elastic Compute Cloud - Compute' ||
        e.svc === 'Amazon Elastic Block Store' ||
        e.svc === 'Amazon EC2 - Other'
      );
      var barColor = isEc2 ? 'var(--amber)' : 'var(--cyan)';
      var shortName = _shortenSvcName(e.svc);
      return (
        '<div class="svc-bar-row">' +
          '<div class="svc-bar-name" title="' + App.esc(e.svc) + '">' +
            (isEc2 ? '<span class="svc-dot ec2-dot"></span>' : '<span class="svc-dot"></span>') +
            App.esc(shortName) +
          '</div>' +
          '<div class="svc-bar-track">' +
            '<div class="svc-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div>' +
          '</div>' +
          '<div class="svc-bar-pct">' + sharePct + '%</div>' +
          '<div class="svc-bar-cost">' + _fmtCost(e.cost) + '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="report-section">' +
        '<div class="report-section-title">' +
          'All AWS Services' +
          '<span class="report-section-hint">■ EC2 services&nbsp; ░ other services</span>' +
        '</div>' +
        '<div class="svc-breakdown">' + rows + '</div>' +
      '</div>'
    );
  }

  function _shortenSvcName(svc) {
    var map = {
      'Amazon Elastic Compute Cloud - Compute': 'EC2 Compute',
      'Amazon Elastic Block Store':             'EBS Storage',
      'Amazon EC2 - Other':                     'EC2 Other',
      'AWS Lambda':                             'Lambda',
      'Amazon API Gateway':                     'API Gateway',
      'Amazon CloudFront':                      'CloudFront',
      'Amazon Simple Storage Service':          'S3',
      'Amazon DynamoDB':                        'DynamoDB',
      'AWS Key Management Service':             'KMS',
      'Amazon Simple Notification Service':     'SNS',
      'Amazon Simple Queue Service':            'SQS',
      'AWS CloudTrail':                         'CloudTrail',
      'Amazon Route 53':                        'Route 53',
      'AWS Cost Explorer':                      'Cost Explorer',
      'Amazon Virtual Private Cloud':           'VPC',
      'Amazon Elastic Container Service':       'ECS',
      'Amazon Relational Database Service':     'RDS',
      'Amazon ElastiCache':                     'ElastiCache',
    };
    return map[svc] || svc;
  }

  // ─── EC2 Usage Types Section ──────────────────────────────────────────────────
  function _renderUsageTypes(usageTypes) {
    if (!usageTypes || usageTypes.length === 0) return '';

    var rows = usageTypes.slice(0, 20).map(function (ut) {
      var cat = _categorizeUsageType(ut.usageType);
      return (
        '<tr>' +
          '<td class="ut-type">' + App.esc(_cleanUsageType(ut.usageType)) + '</td>' +
          '<td class="ut-cat"><span class="ut-badge ut-' + cat.cls + '">' + cat.label + '</span></td>' +
          '<td class="ut-qty">' + _fmtQty(ut.quantity, ut.usageType) + '</td>' +
          '<td class="ut-cost">' + _fmtCost(ut.cost) + '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="report-section">' +
        '<div class="report-section-title">EC2 Usage Detail</div>' +
        '<div class="ut-table-wrap">' +
          '<table class="ut-table">' +
            '<thead><tr><th>Usage Type</th><th>Category</th><th>Quantity</th><th>Cost (USD)</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>'
    );
  }

  function _categorizeUsageType(ut) {
    var u = ut.toLowerCase();
    if (u.indexOf('boxusage') >= 0 || u.indexOf('spotusage') >= 0 || u.indexOf('dedicatedusage') >= 0)
      return { cls: 'compute', label: 'Compute' };
    if (u.indexOf('ebs:volumeusage') >= 0 || u.indexOf('ebs:volume') >= 0)
      return { cls: 'storage', label: 'EBS Volume' };
    if (u.indexOf('ebs:snapshot') >= 0)
      return { cls: 'storage', label: 'EBS Snapshot' };
    if (u.indexOf('datatransfer') >= 0 || u.indexOf('data-transfer') >= 0)
      return { cls: 'network', label: 'Data Transfer' };
    if (u.indexOf('elasticip') >= 0 || u.indexOf('publicipv4') >= 0)
      return { cls: 'network', label: 'Elastic IP' };
    if (u.indexOf('natgateway') >= 0)
      return { cls: 'network', label: 'NAT Gateway' };
    if (u.indexOf('loadbalancing') >= 0 || u.indexOf('loadbalancer') >= 0)
      return { cls: 'network', label: 'Load Balancer' };
    return { cls: 'other', label: 'Other' };
  }

  function _cleanUsageType(ut) {
    // Strip region prefix like "APS3-BoxUsage:t3.micro" → "BoxUsage:t3.micro"
    return ut.replace(/^[A-Z0-9]+-/, '');
  }

  function _fmtQty(qty, usageType) {
    if (!qty) return '—';
    var u = usageType.toLowerCase();
    var unit = u.indexOf('boxusage') >= 0 || u.indexOf('spot') >= 0 ? 'hrs' :
               u.indexOf('ebs:volume') >= 0 ? 'GB-mo' :
               u.indexOf('snapshot') >= 0 ? 'GB-mo' :
               u.indexOf('datatransfer') >= 0 ? 'GB' : '';
    return qty.toFixed(2) + (unit ? ' ' + unit : '');
  }

  // ─── Daily Trend Section ───────────────────────────────────────────────────────
  function _renderDailyTrend(daily, totalCost) {
    var dates = Object.keys(daily).sort();
    if (dates.length === 0) return '';

    var maxDay = Math.max.apply(null, dates.map(function (d) { return daily[d]; }));

    var rows = dates.map(function (d) {
      var cost = daily[d];
      var pct  = maxDay > 0 ? Math.min(100, (cost / maxDay * 100)).toFixed(1) : 0;
      var label = _fmtDate(d);
      return (
        '<div class="daily-trend-row">' +
          '<div class="daily-trend-date">' + label + '</div>' +
          '<div class="daily-trend-track">' +
            '<div class="daily-trend-fill" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<div class="daily-trend-cost">' + _fmtCost(cost) + '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="report-section">' +
        '<div class="report-section-title">Daily Cost Trend</div>' +
        '<div class="daily-trend-wrap">' + rows + '</div>' +
      '</div>'
    );
  }

  function _fmtDate(dateStr) {
    try {
      var d = new Date(dateStr + 'T00:00:00Z');
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    } catch (e) { return dateStr; }
  }

  // ─── Today's Session Estimate ─────────────────────────────────────────────────
  function _renderTodaySessions() {
    var wrap = document.getElementById('today-sessions-wrap');
    if (!wrap) return;

    var running = Instances.getAll().filter(function (i) { return i.state === 'running'; });

    if (running.length === 0) {
      wrap.innerHTML = _emptyBlock('💤', 'No instances currently running.');
      return;
    }

    var prices = App.prices;
    var rows = running.map(function (i) {
      var rate   = prices[i.instanceType] || 0.05;
      var dayEst = (rate * 24).toFixed(4);
      return (
        '<div class="session-row">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="session-name">' + App.esc(i.name || i.instanceId) + '</div>' +
            '<div style="font-size:11px;color:var(--ink3)">' +
              App.esc(i.instanceId) + ' · ' + App.esc(i.accountName || i.accountId) +
            '</div>' +
          '</div>' +
          '<div class="session-type">' + App.esc(i.instanceType || '—') + '</div>' +
          '<div style="font-family:var(--mono);font-size:11px;color:var(--ink3)">$' + rate.toFixed(4) + '/hr</div>' +
          '<div class="session-cost">~$' + dayEst + '/day</div>' +
        '</div>'
      );
    }).join('');

    wrap.innerHTML = rows +
      '<div class="bill-disclaimer">ℹ Estimates use on-demand Linux pricing in ap-south-1. ' +
      'Actual charges depend on your pricing tier, EBS volumes, and data transfer.</div>';
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function _fmtCost(n) {
    if (!n || n < 0.00001) return '<span class="cost-zero">—</span>';
    return '<span class="cost-num">$' + n.toFixed(4) + '</span>';
  }

  function _emptyBlock(ico, msg) {
    return '<div class="empty"><div class="empty-ico">' + ico + '</div><p class="empty-t">' + App.esc(msg) + '</p></div>';
  }

  function _setBtnLoading(on) {
    var btn = document.getElementById('btn-get-cost');
    if (!btn) return;
    if (on) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spin-icon">⟳</span> Fetching…';
    } else {
      btn.disabled = false;
      btn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10"/>' +
        '<polyline points="22 2 22 8 16 8"/></svg>' +
        'Get Cost Update';
    }
  }

  function _setReportLoading() {
    var wrap = document.getElementById('bill-report-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<div class="bill-loading-state">' +
          '<div class="bill-spinner"></div>' +
          '<div class="bill-loading-msg">Querying AWS Cost Explorer…</div>' +
          '<div class="bill-loading-sub">This may take a few seconds. Cost Explorer data is billed per API call.</div>' +
        '</div>';
    }
    // Reset stat cards to dashes
    ['bill-period', 'bill-ec2', 'bill-ebs', 'bill-proj'].forEach(function (id) {
      App.setText(id, '$—');
    });
  }

  function _setReportError(msg) {
    var wrap = document.getElementById('bill-report-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<div class="bill-error-state">' +
          '<div class="bill-error-ico">⚠</div>' +
          '<div class="bill-error-msg">Failed to fetch billing data</div>' +
          '<div class="bill-error-detail">' + App.esc(msg) + '</div>' +
        '</div>';
    }
  }

  function _updateLastUpdated() {
    var el = document.getElementById('bill-last-updated');
    if (!el || !lastUpdated) return;
    el.textContent = 'Last updated: ' + lastUpdated.toLocaleTimeString();
    el.style.display = '';
  }

  // ─── Daily Summary (per-instance from audit logs) ─────────────────────────────
  async function loadDailySummary() {
    var instanceId = document.getElementById('daily-instance-id').value.trim();
    var days       = parseInt(document.getElementById('daily-days').value) || 30;

    if (!instanceId) {
      App.showToast('Enter an instance ID first', 'info');
      document.getElementById('daily-instance-id').focus();
      return;
    }

    var container = document.getElementById('audit-daily-table');
    container.innerHTML = '<div class="audit-loading">Computing daily summary…</div>';
    document.getElementById('btn-daily-load').disabled = true;

    try {
      var res  = await API.getAuditDaily(instanceId, days);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      _renderDailySummary(data);
    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        container.innerHTML = '<div class="audit-empty">Error: ' + App.esc(err.message) + '</div>';
        App.showToast('Daily summary failed: ' + err.message, 'err');
      }
    } finally {
      document.getElementById('btn-daily-load').disabled = false;
    }
  }

  function _renderDailySummary(data) {
    var container = document.getElementById('audit-daily-table');
    var rows      = data.summary || [];

    if (rows.length === 0) {
      container.innerHTML =
        '<div class="audit-empty">No data found for <strong>' + App.esc(data.instanceId) + '</strong>.<br>' +
        'Start or stop the instance to begin capturing data.</div>';
      return;
    }

    var iType     = data.instanceType || 'unknown';
    var rate      = data.hourlyRate   || 0;
    var totalRun  = data.totalRunningHours  || 0;
    var totalCost = data.totalEstimatedCost || 0;

    var rowsHtml = '';
    rows.forEach(function (r) {
      var pct     = Math.min(100, (r.runningHours / 24) * 100).toFixed(1);
      var costTxt = r.estimatedCost > 0 ? '$' + r.estimatedCost.toFixed(4) : '—';
      rowsHtml +=
        '<tr>' +
        '<td class="audit-cell-mono">' + App.esc(r.date) + '</td>' +
        '<td>' +
          '<div class="daily-bar-wrap" title="' + r.runningHours.toFixed(2) + ' hrs running">' +
            '<div class="daily-bar-fill" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<span class="daily-hrs running-hrs">' + r.runningHours.toFixed(2) + ' h</span>' +
        '</td>' +
        '<td><span class="daily-hrs stopped-hrs">' + r.stoppedHours.toFixed(2) + ' h</span></td>' +
        '<td class="audit-cell-center daily-events-count">' + r.events + '</td>' +
        '<td class="audit-cell-cost">' + costTxt + '</td>' +
        '</tr>';
    });

    container.innerHTML =
      '<div class="daily-summary-header">' +
        '<div class="daily-meta-badges">' +
          '<span class="daily-badge badge-id">'   + App.esc(data.instanceId) + '</span>' +
          '<span class="daily-badge badge-type">' + App.esc(iType) + '</span>' +
          (rate > 0 ? '<span class="daily-badge badge-rate">$' + rate.toFixed(4) + '/hr on-demand</span>' : '') +
        '</div>' +
        '<div class="daily-totals-row">' +
          '<div class="daily-total-box"><div class="daily-total-label">Total Running</div><div class="daily-total-val running-hrs">' + totalRun.toFixed(2) + ' hrs</div></div>' +
          '<div class="daily-total-box"><div class="daily-total-label">Est. Total Cost</div><div class="daily-total-val cost-val">' + (totalCost > 0 ? '$' + totalCost.toFixed(4) : '—') + '</div></div>' +
          '<div class="daily-total-box"><div class="daily-total-label">Days Analysed</div><div class="daily-total-val">' + rows.length + '</div></div>' +
        '</div>' +
      '</div>' +
      '<table class="audit-table daily-table">' +
        '<thead><tr><th>Date</th><th>Running Hours</th><th>Stopped Hours</th><th>Events</th><th>Est. Cost (USD)</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div class="daily-disclaimer">&#9432;&nbsp; Estimates use on-demand Linux pricing in ap-south-1. ' +
      'Actual charges depend on your pricing tier, EBS volumes, and data transfer.</div>';
  }

  // ─── Tab Activation ───────────────────────────────────────────────────────────
  function onTabActivated() {
    _populateInstancePicker();
    _renderTodaySessions();
    // Do NOT auto-load CE data — user must click "Get Cost Update"
  }

  // ─── Instance Picker ──────────────────────────────────────────────────────────
  function _populateInstancePicker() {
    var sel = document.getElementById('daily-instance-select');
    if (!sel) return;
    var current = sel.value;
    while (sel.options.length > 1) sel.remove(1);

    var instances = Instances.getAll ? Instances.getAll() : [];
    instances.sort(function (a, b) {
      var na = (a.name || a.instanceId).toLowerCase();
      var nb = (b.name || b.instanceId).toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    instances.forEach(function (i) {
      var opt   = document.createElement('option');
      opt.value = i.instanceId;
      var label = (i.name || i.instanceId) + ' (' + i.instanceId + ')';
      if (i.state === 'running') label += ' ▶';
      opt.textContent = label;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────────
  function init() {
    var btn = document.getElementById('btn-daily-load');
    if (btn) btn.addEventListener('click', loadDailySummary);

    var inp = document.getElementById('daily-instance-id');
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') loadDailySummary();
    });

    var sel = document.getElementById('daily-instance-select');
    if (sel) {
      sel.addEventListener('change', function () {
        var idInput = document.getElementById('daily-instance-id');
        if (sel.value && idInput) idInput.value = sel.value;
      });
    }
    if (inp) {
      inp.addEventListener('input', function () {
        var s = document.getElementById('daily-instance-select');
        if (s && inp.value.trim() === '') s.value = '';
      });
    }
  }

  // ─── Public ───────────────────────────────────────────────────────────────────
  return {
    load:               load,
    onTabActivated:     onTabActivated,
    onFilterTypeChange: onFilterTypeChange,
    init:               init,
  };

})();
