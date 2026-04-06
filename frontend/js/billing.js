/* ═══════════════════════════════════════════════════════
   Billing Module - Per-instance daily history & session
   estimates using live on-demand pricing from /pricing.
   ═══════════════════════════════════════════════════════ */

const Billing = (function () {

  function _getNprRate() { return (window.NPR_RATE && window.NPR_RATE > 0) ? window.NPR_RATE : 135; }
  function _npr(usd) {
    if (!usd || usd <= 0) return '-';
    return 'NPR\u00a0' + (usd * _getNprRate()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      var costTxt = r.estimatedCost > 0 ? _npr(r.estimatedCost) : '-';
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
          (rate > 0 ? '<span class="daily-badge badge-rate">' + _npr(rate) + '/hr on-demand</span>' : '') +
        '</div>' +
        '<div class="daily-totals-row">' +
          '<div class="daily-total-box"><div class="daily-total-label">Total Running</div><div class="daily-total-val running-hrs">' + totalRun.toFixed(2) + ' hrs</div></div>' +
          '<div class="daily-total-box"><div class="daily-total-label">Est. Total Cost</div><div class="daily-total-val cost-val">' + _npr(totalCost) + '</div></div>' +
          '<div class="daily-total-box"><div class="daily-total-label">Days Analysed</div><div class="daily-total-val">' + rows.length + '</div></div>' +
        '</div>' +
      '</div>' +
      '<table class="audit-table daily-table">' +
        '<thead><tr><th>Date</th><th>Running Hours</th><th>Stopped Hours</th><th>Events</th><th>Est. Cost (NPR)</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div class="daily-disclaimer">&#9432;&nbsp; Estimates use live on-demand Linux pricing from AWS Price List API (region-specific). ' +
      'Actual charges depend on your pricing tier, EBS volumes, and data transfer. ' +
      '(1 USD = NPR\u00a0' + _getNprRate().toFixed(0) + ' · live mid-market rate)</div>';
  }

  // ─── Today's Session Estimate (live pricing from /pricing) ────────────────────
  async function _renderTodaySessions() {
    var wrap = document.getElementById('today-sessions-wrap');
    if (!wrap) return;

    var running = Instances.getAll().filter(function (i) { return i.state === 'running'; });

    if (running.length === 0) {
      wrap.innerHTML = _emptyBlock('💤', 'No instances currently running.');
      return;
    }

    wrap.innerHTML = '<div class="audit-loading">Fetching live pricing…</div>';

    // Group running instances by region to minimise API calls
    var byRegion = {};
    running.forEach(function (i) {
      var r = i.region || 'ap-south-1';
      if (!byRegion[r]) byRegion[r] = [];
      byRegion[r].push(i);
    });

    // Fetch live prices for each unique region
    var priceMap = {}; // { instanceType@region: rate }
    try {
      await Promise.all(Object.keys(byRegion).map(async function (region) {
        var types = byRegion[region]
          .map(function (i) { return i.instanceType; })
          .filter(function (t, idx, arr) { return t && arr.indexOf(t) === idx; });
        var res  = await API.getPricing(region, types);
        var data = await res.json();
        if (res.ok && data.prices) {
          Object.keys(data.prices).forEach(function (t) {
            priceMap[t + '@' + region] = data.prices[t];
          });
        }
      }));
    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        wrap.innerHTML = '<div class="audit-empty">Could not fetch live pricing: ' + App.esc(err.message) + '</div>';
      }
      return;
    }

    var rows = running.map(function (i) {
      var region = i.region || 'ap-south-1';
      var rate   = priceMap[(i.instanceType || '') + '@' + region] || 0;
      return (
        '<div class="session-row">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="session-name">' + App.esc(i.name || i.instanceId) + '</div>' +
            '<div style="font-size:11px;color:var(--ink3)">' +
              App.esc(i.instanceId) + ' · ' + App.esc(i.accountName || i.accountId) + ' · ' + App.esc(region) +
            '</div>' +
          '</div>' +
          '<div class="session-type">' + App.esc(i.instanceType || '-') + '</div>' +
          '<div style="font-family:var(--mono);font-size:11px;color:var(--ink3)">' +
            (rate > 0 ? _npr(rate) + '/hr' : '-') +
          '</div>' +
          '<div class="session-cost">' + (rate > 0 ? '~' + _npr(rate * 24) + '/day' : '-') + '</div>' +
        '</div>'
      );
    }).join('');

    wrap.innerHTML = rows +
      '<div class="bill-disclaimer">ℹ Live on-demand Linux pricing via AWS Price List API (region-specific). ' +
      'Actual charges depend on your pricing tier, EBS volumes, and data transfer. ' +
      '(1 USD = NPR\u00a0' + _getNprRate().toFixed(0) + ' · live mid-market rate)</div>';
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function _fmtCost(n) {
    if (!n || n < 0.00001) return '<span class="cost-zero">-</span>';
    return '<span class="cost-num">' + _npr(n) + '</span>';
  }

  function _emptyBlock(ico, msg) {
    return '<div class="empty"><div class="empty-ico">' + ico + '</div><p class="empty-t">' + App.esc(msg) + '</p></div>';
  }

  // ─── Tab Activation ───────────────────────────────────────────────────────────
  function onTabActivated() {
    _populateInstancePicker();
    _renderTodaySessions();
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
    onTabActivated: onTabActivated,
    init:           init,
  };

})();
