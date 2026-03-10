/* ═══════════════════════════════════════════════
   Audit Module — Event Log + Daily Summary
   ═══════════════════════════════════════════════

   Two views:
     • Event Log     — paginated table of every start/stop action
     • Daily Summary — per-day running hours, stopped hours, est. cost
   ═══════════════════════════════════════════════ */

const Audit = (function () {

  // ─── State ───
  var currentView   = 'events';
  var lastKey       = null;      // DynamoDB pagination cursor
  var isLoading     = false;
  var firstLoad     = true;      // lazy-load on first tab activation

  // ─── View Toggle ───────────────────────────────────────────────────────

  function switchView(view) {
    currentView = view;
    document.getElementById('btn-view-events').classList.toggle('active', view === 'events');
    document.getElementById('btn-view-daily').classList.toggle('active',  view === 'daily');
    document.getElementById('audit-events-view').style.display = view === 'events' ? 'block' : 'none';
    document.getElementById('audit-daily-view').style.display  = view === 'daily'  ? 'block' : 'none';
  }

  // ─── Event Log ─────────────────────────────────────────────────────────

  async function loadEvents(reset) {
    if (isLoading) return;
    if (reset) lastKey = null;

    var instanceId = document.getElementById('audit-filter-instance').value.trim();
    var userEmail  = document.getElementById('audit-filter-user').value.trim();

    var tbody = document.getElementById('audit-events-tbody');
    if (reset) {
      tbody.innerHTML = '<tr><td colspan="6" class="audit-loading">Loading events...</td></tr>';
    }

    isLoading = true;
    document.getElementById('btn-audit-more').disabled = true;

    try {
      var res  = await API.getAuditLog({ instanceId: instanceId, userEmail: userEmail, limit: 50, lastKey: lastKey });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      var items = data.items || [];
      lastKey   = data.lastKey || null;

      if (reset) tbody.innerHTML = '';

      if (items.length === 0 && reset) {
        tbody.innerHTML = '<tr><td colspan="6" class="audit-empty">No audit events found. Start or stop an instance to create entries.</td></tr>';
      } else {
        items.forEach(function (item) {
          var tr = document.createElement('tr');
          tr.innerHTML = buildEventRow(item);
          tbody.appendChild(tr);
        });
      }

      var moreBtn = document.getElementById('btn-audit-more');
      moreBtn.style.display = lastKey ? 'inline-flex' : 'none';
      moreBtn.disabled = false;

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        if (reset) {
          tbody.innerHTML = '<tr><td colspan="6" class="audit-empty">Error: ' + escHtml(err.message) + '</td></tr>';
        }
        App.showToast('Audit load failed: ' + err.message, 'err');
      }
    } finally {
      isLoading = false;
    }
  }

  function buildEventRow(item) {
    var actionCls = actionClass(item.action);
    var resultCls = item.result === 'success' ? 'result-ok' : 'result-err';
    return (
      '<td class="audit-cell-mono audit-cell-time">' + escHtml(fmtTs(item.timestamp)) + '</td>' +
      '<td>' +
        '<div class="audit-inst-name">' + escHtml(item.instanceName || item.instanceId) + '</div>' +
        '<div class="audit-inst-id">'   + escHtml(item.instanceId)  + ' &middot; ' + escHtml(item.region || '') + '</div>' +
      '</td>' +
      '<td><span class="audit-action ' + actionCls + '">' + escHtml(item.action || '--') + '</span></td>' +
      '<td class="audit-cell-mono audit-cell-user">' + escHtml(item.userEmail || '--') + '</td>' +
      '<td class="audit-cell-mono">'   + escHtml(item.instanceType || '--') + '</td>' +
      '<td><span class="audit-result ' + resultCls + '">' + escHtml(item.result || '--') + '</span></td>'
    );
  }

  // ─── Daily Summary ─────────────────────────────────────────────────────

  async function loadDailySummary() {
    var instanceId = document.getElementById('daily-instance-id').value.trim();
    var days       = parseInt(document.getElementById('daily-days').value) || 30;

    if (!instanceId) {
      App.showToast('Enter an instance ID first', 'info');
      document.getElementById('daily-instance-id').focus();
      return;
    }

    var container = document.getElementById('audit-daily-table');
    container.innerHTML = '<div class="audit-loading">Computing daily summary...</div>';
    document.getElementById('btn-daily-load').disabled = true;

    try {
      var res  = await API.getAuditDaily(instanceId, days);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      renderDailySummary(data);

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        container.innerHTML = '<div class="audit-empty">Error: ' + escHtml(err.message) + '</div>';
        App.showToast('Daily summary failed: ' + err.message, 'err');
      }
    } finally {
      document.getElementById('btn-daily-load').disabled = false;
    }
  }

  function renderDailySummary(data) {
    var container = document.getElementById('audit-daily-table');
    var rows      = data.summary || [];

    if (rows.length === 0) {
      container.innerHTML =
        '<div class="audit-empty">No data found for <strong>' + escHtml(data.instanceId) + '</strong>.<br>' +
        'Start or stop the instance to begin capturing data.</div>';
      return;
    }

    var iType      = data.instanceType || 'unknown';
    var rate       = data.hourlyRate   || 0;
    var totalRun   = data.totalRunningHours   || 0;
    var totalCost  = data.totalEstimatedCost  || 0;

    var rowsHtml = '';
    rows.forEach(function (r) {
      var pct    = Math.min(100, (r.runningHours / 24) * 100).toFixed(1);
      var costTxt = r.estimatedCost > 0 ? '$' + r.estimatedCost.toFixed(4) : '—';
      rowsHtml +=
        '<tr>' +
        '<td class="audit-cell-mono">' + escHtml(r.date) + '</td>' +
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
          '<span class="daily-badge badge-id">'   + escHtml(data.instanceId) + '</span>' +
          '<span class="daily-badge badge-type">' + escHtml(iType) + '</span>' +
          (rate > 0 ? '<span class="daily-badge badge-rate">$' + rate.toFixed(4) + '/hr on-demand</span>' : '') +
        '</div>' +
        '<div class="daily-totals-row">' +
          '<div class="daily-total-box">' +
            '<div class="daily-total-label">Total Running</div>' +
            '<div class="daily-total-val running-hrs">' + totalRun.toFixed(2) + ' hrs</div>' +
          '</div>' +
          '<div class="daily-total-box">' +
            '<div class="daily-total-label">Est. Total Cost</div>' +
            '<div class="daily-total-val cost-val">' + (totalCost > 0 ? '$' + totalCost.toFixed(4) : '—') + '</div>' +
          '</div>' +
          '<div class="daily-total-box">' +
            '<div class="daily-total-label">Days Analysed</div>' +
            '<div class="daily-total-val">' + rows.length + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<table class="audit-table daily-table">' +
        '<thead><tr>' +
          '<th>Date</th>' +
          '<th>Running Hours</th>' +
          '<th>Stopped Hours</th>' +
          '<th>Events</th>' +
          '<th>Est. Cost (USD)</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +

      '<div class="daily-disclaimer">' +
        '&#9432;&nbsp; Estimates use on-demand Linux pricing in ap-south-1. ' +
        'Actual charges depend on your pricing tier (reserved / spot), EBS volumes, and data transfer. ' +
        'Unknown instance types show — for cost.' +
      '</div>';
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  function actionClass(action) {
    if (!action) return 'action-neutral';
    var a = action.toLowerCase();
    if (a === 'start' || a === 'scheduled-start' || a === 'auto-start') return 'action-start';
    if (a === 'stop'  || a === 'scheduled-stop')                         return 'action-stop';
    if (a === 'auto-stop-idle' || a === 'auto-stop')                     return 'action-auto';
    return 'action-neutral';
  }

  function fmtTs(ts) {
    if (!ts) return '--';
    try {
      return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    } catch (e) { return ts; }
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ─── Public: called by app.js when Audit tab is clicked ───────────────

  function onTabActivated() {
    if (firstLoad) {
      firstLoad = false;
      loadEvents(true);
    }
  }

  // ─── Init — wire all event listeners ──────────────────────────────────

  function init() {
    // View toggle
    document.getElementById('btn-view-events').addEventListener('click', function () { switchView('events'); });
    document.getElementById('btn-view-daily').addEventListener('click',  function () { switchView('daily');  });

    // Event log controls
    document.getElementById('btn-audit-search').addEventListener('click', function () { loadEvents(true); });
    document.getElementById('btn-audit-more').addEventListener('click',   function () { loadEvents(false); });

    // Allow Enter in filter inputs
    ['audit-filter-instance', 'audit-filter-user'].forEach(function (id) {
      document.getElementById(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') loadEvents(true);
      });
    });

    // Daily summary controls
    document.getElementById('btn-daily-load').addEventListener('click', loadDailySummary);
    document.getElementById('daily-instance-id').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') loadDailySummary();
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────

  return {
    init:           init,
    onTabActivated: onTabActivated,
  };

})();
