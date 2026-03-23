'use strict';

const Backup = (function () {
  // ─── Private state
  var loaded         = false;
  var selInstance    = null;   // { instanceId, accountId, region, instanceArn }
  var recoveryPoints = [];
  var plans          = [];
  var editPlan           = null;   // plan being edited (null = add mode)
  var restoreArn         = null;   // recoveryPointArn for current restore form
  var _confirmCallback   = null;   // pending in-page confirm callback
  var _bannerTimer       = null;   // auto-dismiss timer for action banner
  var _lastRestoreJobId  = null;   // restoreJobId from most recent restore call
  var _lastRestoreInst   = null;   // {accountId, region} snapshot for status check

  // ─── Schedule preset retention defaults (no hardcoded time — user picks it)
  var CRON_PRESETS = {
    daily:   { days: 30  },
    weekly:  { days: 90  },
    monthly: { days: 365 },
    custom:  { days: 30  },
  };

  // ─── Init: register event listeners + populate hour selector
  function init() {
    var hourSel = document.getElementById('bk-sched-hour');
    if (hourSel) {
      for (var i = 0; i < 24; i++) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = String(i).padStart(2, '0') + ':00';
        if (i === 2) opt.selected = true;  // default 02:00 UTC
        hourSel.appendChild(opt);
      }
    }
    var sel = document.getElementById('bk-instance-select');
    if (sel) sel.addEventListener('change', _onInstanceChange);
  }

  // ─── Lazy-load: called by App.go('backup') on first visit
  function onTabActivated() {
    if (!loaded) {
      loaded = true;
      _populateInstanceSelector();
    }
  }

  // ─── Populate instance dropdown from already-loaded instances
  function _populateInstanceSelector() {
    var sel  = document.getElementById('bk-instance-select');
    var wrap = document.getElementById('bk-content');
    if (!sel) return;

    var instances = (typeof Instances !== 'undefined') ? Instances.getAll() : [];
    sel.innerHTML = '<option value="">— Choose an instance to manage backups —</option>';

    var role = Auth.getRole();
    instances.forEach(function (inst) {
      if (role === 'none') return;
      var label = inst.instanceId + (inst.name && inst.name !== inst.instanceId ? ' (' + inst.name + ')' : '') + ' — ' + inst.accountId;
      var val   = JSON.stringify({
        instanceId:  inst.instanceId,
        accountId:   inst.accountId,
        region:      inst.region,
        instanceArn: 'arn:aws:ec2:' + inst.region + ':' + inst.accountId + ':instance/' + inst.instanceId,
      });
      var opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      sel.appendChild(opt);
    });

    if (wrap) wrap.style.display = 'none';
  }

  function _onInstanceChange() {
    var sel = document.getElementById('bk-instance-select');
    var val = sel ? sel.value : '';
    var wrap = document.getElementById('bk-content');
    // Close any open inline forms when switching instance
    _closeRestoreInline();
    _closeSchedInline();
    _hideActionBanner();
    if (!val) {
      selInstance = null;
      if (wrap) wrap.style.display = 'none';
      return;
    }
    selInstance = JSON.parse(val);
    load(selInstance.instanceId, selInstance.accountId, selInstance.region);
  }

  // ─── Load recovery points + plans for selected instance
  async function load(instanceId, accountId, region) {
    _setLoading(true);
    try {
      var res  = await API.getBackups(instanceId, accountId, region);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load backups.');
      recoveryPoints = data.recoveryPoints || [];
      plans          = data.plans          || [];
      _renderRecoveryPoints();
      _renderPlans();
      var wrap = document.getElementById('bk-content');
      if (wrap) wrap.style.display = '';
      var vaultEl = document.getElementById('bk-stat-vault');
      if (vaultEl) vaultEl.textContent = 'ec2-control-vault-production';
    } catch (e) {
      App.showToast(e.message, 'err');
    } finally {
      _setLoading(false);
    }
  }

  function _setLoading(on) {
    var el = document.getElementById('bk-loading');
    if (el) el.style.display = on ? '' : 'none';
  }

  // ─── Cron helpers

  function _buildCron(preset, hour, minute) {
    var h = String(hour  || 0);
    var m = String(minute || 0);
    switch (preset) {
      case 'daily':   return 'cron(' + m + ' ' + h + ' * * ? *)';
      case 'weekly':  return 'cron(' + m + ' ' + h + ' ? * SUN *)';
      case 'monthly': return 'cron(' + m + ' ' + h + ' 1 * ? *)';
      default:        return 'cron(' + m + ' ' + h + ' * * ? *)';
    }
  }

  function _matchPreset(cron) {
    var match = cron && cron.match(/^cron\(\s*\d+\s+\d+\s+(.+)\)$/);
    if (!match) return 'custom';
    var body = match[1].trim();
    if (body === '* * ? *')    return 'daily';
    if (body === '? * SUN *')  return 'weekly';
    if (body === '1 * ? *')    return 'monthly';
    return 'custom';
  }

  function _parseCronTime(cron) {
    var match = cron && cron.match(/^cron\(\s*(\d+)\s+(\d+)/);
    if (!match) return { h: 2, m: 0 };
    var m = parseInt(match[1], 10);
    var h = parseInt(match[2], 10);
    // Snap minute to nearest quarter-hour (0, 15, 30, 45)
    var mSnap = [0, 15, 30, 45].reduce(function (prev, curr) {
      return Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev;
    });
    return { h: h, m: mSnap };
  }

  // ─── Render helpers

  function _fmtBytes(bytes) {
    if (!bytes) return '—';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }

  function _fmtDate(d) {
    if (!d || d === 'None') return '—';
    try { return new Date(d).toLocaleString(); } catch (e) { return d; }
  }

  function _relTime(d) {
    if (!d || d === 'None') return '';
    try {
      var diff = Date.now() - new Date(d).getTime();
      var mins = Math.floor(diff / 60000);
      if (mins < 1)  return 'just now';
      if (mins < 60) return mins + ' min ago';
      var hrs = Math.floor(mins / 60);
      if (hrs < 24)  return hrs + ' hr' + (hrs > 1 ? 's' : '') + ' ago';
      var days = Math.floor(hrs / 24);
      if (days < 30) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
      return new Date(d).toLocaleDateString();
    } catch (e) { return ''; }
  }

  function _friendlyCron(cron) {
    var match = cron && cron.match(/^cron\(\s*(\d+)\s+(\d+)\s+(.+)\)$/);
    if (!match) return cron || '—';
    var m    = parseInt(match[1], 10);
    var h    = parseInt(match[2], 10);
    var body = match[3].trim();
    var t    = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' UTC';
    if (body === '* * ? *')   return 'Daily at ' + t;
    if (body === '? * SUN *') return 'Weekly (Sun) at ' + t;
    if (body === '1 * ? *')   return 'Monthly (1st) at ' + t;
    return cron;
  }

  function _nextCronRun(cron) {
    var match = cron && cron.match(/^cron\(\s*(\d+)\s+(\d+)\s+(.+)\)$/);
    if (!match) return '—';
    var m    = parseInt(match[1], 10);
    var h    = parseInt(match[2], 10);
    var body = match[3].trim();
    var now  = new Date();
    var next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
    if (next <= now) {
      if (body === '? * SUN *') {
        // advance to next Sunday
        var daysUntilSun = (7 - next.getUTCDay()) % 7 || 7;
        next.setUTCDate(next.getUTCDate() + daysUntilSun);
      } else if (body === '1 * ? *') {
        // advance to 1st of next month
        next.setUTCMonth(next.getUTCMonth() + 1, 1);
      } else {
        // daily (and custom)
        next.setUTCDate(next.getUTCDate() + 1);
      }
    }
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var hh = String(next.getUTCHours()).padStart(2, '0');
    var mm = String(next.getUTCMinutes()).padStart(2, '0');
    return months[next.getUTCMonth()] + ' ' + next.getUTCDate() + ', ' + next.getUTCFullYear() + ' at ' + hh + ':' + mm + ' UTC';
  }

  function _renderRecoveryPoints() {
    var wrap = document.getElementById('bk-rp-list');
    if (!wrap) return;
    // Close inline restore form when list re-renders
    _closeRestoreInline();
    // Update stat cards
    var statCount = document.getElementById('bk-stat-count');
    if (statCount) statCount.textContent = recoveryPoints.length || '0';
    var statLast = document.getElementById('bk-stat-last');
    if (statLast) {
      if (recoveryPoints.length) {
        var newest = recoveryPoints.reduce(function (a, b) {
          return new Date(a.creationDate) > new Date(b.creationDate) ? a : b;
        });
        statLast.textContent = _relTime(newest.creationDate);
      } else {
        statLast.textContent = 'Never';
      }
    }
    if (!recoveryPoints.length) {
      wrap.innerHTML =
        '<div class="bk-empty-state">' +
        '<svg viewBox="0 0 64 64" width="48" height="48" fill="none"><circle cx="32" cy="32" r="30" stroke="var(--bd2)" stroke-width="2"/><path d="M32 18v14l8 4" stroke="var(--ink4)" stroke-width="2.5" stroke-linecap="round"/><path d="M20 44h24" stroke="var(--bd2)" stroke-width="2" stroke-linecap="round"/></svg>' +
        '<p class="bk-empty-title">No recovery points yet</p>' +
        '<p class="bk-empty-sub">Click \u201cBack Up Now\u201d to create your first snapshot</p>' +
        '</div>';
      return;
    }
    var canAct = _canAct();
    wrap.innerHTML = recoveryPoints.map(function (rp) {
      var safeArn = rp.recoveryPointArn.replace(/'/g, '');
      var statusClass = 'bk-status-' + (rp.status || '').toLowerCase();
      // Delete button is intentionally removed — use AWS Console to delete recovery points
      var actions = canAct
        ? '<button class="btn btn-sm btn-out bk-restore-btn" onclick="Backup.openRestoreModal(\'' + safeArn + '\')">Restore</button>'
        : '<span class="bk-view-only">View only</span>';
      return '<div class="bk-rp-row" data-arn="' + safeArn + '">' +
        '<div><div class="bk-rp-date">' + _fmtDate(rp.creationDate) + '</div>' +
        '<div class="bk-rp-meta">' + _relTime(rp.creationDate) + '</div></div>' +
        '<span class="bk-status ' + statusClass + '">' + (rp.status || 'Unknown') + '</span>' +
        '<span class="bk-rp-size">' + _fmtBytes(rp.backupSizeBytes) + '</span>' +
        '<div class="bk-rp-actions">' + actions + '</div>' +
        '</div>';
    }).join('');
  }

  function _renderPlans() {
    var wrap = document.getElementById('bk-plans-list');
    if (!wrap) return;
    // Close inline schedule form when list re-renders
    _closeSchedInline();
    // Update stat card
    var statSched = document.getElementById('bk-stat-schedules');
    if (statSched) statSched.textContent = plans.length || '0';
    if (!plans.length) {
      wrap.innerHTML =
        '<div class="bk-empty-state">' +
        '<svg viewBox="0 0 64 64" width="48" height="48" fill="none"><circle cx="32" cy="32" r="30" stroke="var(--bd2)" stroke-width="2"/><rect x="18" y="20" width="28" height="24" rx="3" stroke="var(--ink4)" stroke-width="2"/><line x1="24" y1="30" x2="40" y2="30" stroke="var(--bd2)" stroke-width="2"/><line x1="24" y1="36" x2="34" y2="36" stroke="var(--bd2)" stroke-width="2"/></svg>' +
        '<p class="bk-empty-title">No schedules configured</p>' +
        '<p class="bk-empty-sub">Add a schedule to automate recurring backups</p>' +
        '</div>';
      return;
    }
    var canAct = _canAct();
    wrap.innerHTML = plans.map(function (p) {
      var actions = canAct
        ? '<button class="btn btn-sm btn-out" onclick="Backup.openScheduleForm(\'' + p.backupPlanId + '\')">Edit</button>' +
          '<button class="btn btn-sm btn-danger-out" onclick="Backup.deleteSchedule(\'' + p.backupPlanId + '\',\'' + p.selectionId + '\')">Delete</button>'
        : '<span class="bk-view-only">View only</span>';
      return '<div class="bk-plan-card">' +
        '<div class="bk-plan-freq-icon">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '</div>' +
        '<div><div class="bk-plan-name">' + _friendlyCron(p.scheduleCron) + '</div>' +
        '<div class="bk-plan-meta">' + (p.backupPlanName || '') + '</div></div>' +
        '<span class="bk-plan-ret">' + (p.retentionDays ? p.retentionDays + ' days' : '—') + '</span>' +
        (p.lastExecutionDate && p.lastExecutionDate !== 'None' && p.lastExecutionDate !== ''
          ? '<span class="bk-plan-last">Last run: ' + _fmtDate(p.lastExecutionDate) + '</span>'
          : '<span class="bk-plan-last bk-plan-last--next">Next run: ' + _nextCronRun(p.scheduleCron) + '</span>') +
        '<div class="bk-plan-actions">' + actions + '</div>' +
        '</div>';
    }).join('');
  }

  function _canAct() {
    var role = Auth.getRole();
    return role === 'admin' || role === 'operator';
  }

  // ─── Internal helpers to collapse inline forms

  function _closeRestoreInline() {
    restoreArn = null;
    var el = document.getElementById('bk-restore-inline');
    if (el) el.style.display = 'none';
    document.querySelectorAll('.bk-rp-row').forEach(function (r) { r.classList.remove('bk-rp-row--active'); });
  }

  function _closeSchedInline() {
    editPlan = null;
    var el = document.getElementById('bk-sched-inline');
    if (el) el.style.display = 'none';
  }

  // ─── In-page confirmation dialog (replaces browser confirm())

  function _showConfirm(opts) {
    // opts: { title, message, confirmLabel, confirmClass, iconClass, onConfirm }
    var overlay    = document.getElementById('bk-confirm-overlay');
    var titleEl    = document.getElementById('bk-confirm-title');
    var msgEl      = document.getElementById('bk-confirm-msg');
    var okBtn      = document.getElementById('bk-confirm-ok');
    var iconWrap   = document.getElementById('bk-confirm-icon-wrap');
    if (!overlay) return;

    if (titleEl)  titleEl.textContent  = opts.title   || 'Confirm Action';
    if (msgEl)    msgEl.textContent    = opts.message  || '';
    if (okBtn) {
      okBtn.textContent = opts.confirmLabel || 'Confirm';
      okBtn.className   = 'btn ' + (opts.confirmClass || 'btn-danger');
    }
    if (iconWrap) {
      iconWrap.className = 'bk-confirm-icon-wrap ' + (opts.iconClass || 'bk-confirm-icon-danger');
    }
    _confirmCallback = opts.onConfirm || null;
    overlay.style.display = 'flex';
  }

  function confirmOk() {
    var overlay = document.getElementById('bk-confirm-overlay');
    if (overlay) overlay.style.display = 'none';
    var cb = _confirmCallback;
    _confirmCallback = null;
    if (cb) cb();
  }

  function confirmCancel() {
    var overlay = document.getElementById('bk-confirm-overlay');
    if (overlay) overlay.style.display = 'none';
    _confirmCallback = null;
  }

  // ─── Action feedback banner (inline result message)

  function _showActionBanner(msg, type) {
    var el = document.getElementById('bk-action-banner');
    if (!el) return;
    clearTimeout(_bannerTimer);
    var icons = {
      ok:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
      err: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      info:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };
    var t = type || 'info';
    el.className = 'bk-action-banner bk-action-banner-' + t;
    el.innerHTML = (icons[t] || icons.info) +
      '<span>' + msg + '</span>' +
      '<button class="bk-banner-close" onclick="Backup.dismissBanner()" title="Dismiss">' +
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>';
    el.style.display = 'flex';
    _bannerTimer = setTimeout(function () { _hideActionBanner(); }, 6000);
  }

  function _hideActionBanner() {
    clearTimeout(_bannerTimer);
    var el = document.getElementById('bk-action-banner');
    if (el) el.style.display = 'none';
  }

  function _showRestoreBanner(jobId) {
    var el = document.getElementById('bk-action-banner');
    if (!el) return;
    clearTimeout(_bannerTimer);
    var checkBtn = jobId
      ? ' <button onclick="Backup.checkRestoreStatus()" style="margin-left:10px;padding:2px 10px;font-size:12px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;cursor:pointer;">Check Status</button>'
      : '';
    var jobLabel = jobId ? ' Job: <code style="font-size:11px;">' + jobId + '</code>' : '';
    el.className = 'bk-action-banner bk-action-banner-ok';
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
      '<span>Restore started. New instance will appear in Instances tab in 15\u201330 min.' + jobLabel + checkBtn + '</span>' +
      '<button class="bk-banner-close" onclick="Backup.dismissBanner()" title="Dismiss">' +
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>';
    el.style.display = 'flex';
    // Don't auto-dismiss — user needs time to click Check Status
  }

  async function checkRestoreStatus() {
    if (!_lastRestoreJobId || !_lastRestoreInst) {
      return App.showToast('No recent restore job to check.', 'err');
    }
    var el = document.getElementById('bk-action-banner');
    if (el) {
      var span = el.querySelector('span');
      if (span) span.textContent = 'Checking restore status\u2026';
    }
    try {
      var res  = await API.postBackup({
        action:       'describerestorejob',
        restoreJobId: _lastRestoreJobId,
        accountId:    _lastRestoreInst.accountId,
        region:       _lastRestoreInst.region,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Status check failed.');
      var status  = data.status || 'UNKNOWN';
      var pct     = data.percentDone ? ' (' + data.percentDone + '%)' : '';
      var newArn  = data.createdResourceArn || '';
      var errMsg  = data.statusMessage || '';
      var msg, type;
      if (status === 'COMPLETED') {
        msg  = '\u2713 Restore complete.' + (newArn ? ' New instance: ' + newArn.split('/').pop() : '');
        type = 'ok';
      } else if (status === 'FAILED' || status === 'ABORTED') {
        msg  = '\u2717 Restore ' + status.toLowerCase() + (errMsg ? ': ' + errMsg : '.');
        type = 'err';
      } else {
        msg  = 'Restore ' + status + pct + '. Check again in a few minutes.';
        type = 'info';
      }
      _showActionBanner(msg, type);
      if (status !== 'COMPLETED' && status !== 'FAILED' && status !== 'ABORTED') {
        // Keep banner visible for in-progress states; re-add Check Status
        clearTimeout(_bannerTimer);
        var elAfter = document.getElementById('bk-action-banner');
        if (elAfter) {
          var sp = elAfter.querySelector('span');
          if (sp) sp.innerHTML = msg +
            ' <button onclick="Backup.checkRestoreStatus()" style="margin-left:10px;padding:2px 10px;font-size:12px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;cursor:pointer;">Check Again</button>';
        }
      }
    } catch (e) {
      _showActionBanner(e.message, 'err');
    }
  }

  // ─── On-demand backup

  async function backupNow() {
    if (!selInstance) return App.showToast('Select an instance first.', 'err');
    var btn = document.getElementById('bk-btn-now');
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Starting\u2026'; }
    _hideActionBanner();
    try {
      var res  = await API.postBackup({
        action:      'createbackup',
        instanceId:  selInstance.instanceId,
        instanceArn: selInstance.instanceArn,
        accountId:   selInstance.accountId,
        region:      selInstance.region,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Backup failed.');
      _showActionBanner(
        (data.message || 'Backup job started successfully.') +
        ' The snapshot will appear in Recovery Points once complete (usually 5\u201315 minutes).',
        'ok'
      );
      App.showToast(data.message || 'Backup job started.', 'ok');
    } catch (e) {
      _showActionBanner(e.message, 'err');
      App.showToast(e.message, 'err');
    } finally {
      if (btn) { btn.disabled = false; if (origHtml) btn.innerHTML = origHtml; }
    }
  }

  // ─── Restore inline form

  function openRestoreModal(arn) {
    restoreArn = arn;
    var inline = document.getElementById('bk-restore-inline');
    if (!inline) return;
    // Highlight the selected recovery point row
    document.querySelectorAll('.bk-rp-row').forEach(function (r) { r.classList.remove('bk-rp-row--active'); });
    var activeRow = document.querySelector('.bk-rp-row[data-arn="' + arn + '"]');
    if (activeRow) activeRow.classList.add('bk-rp-row--active');
    // Reset to default option
    var radio = inline.querySelector('input[name="bk-restore-type"][value="new_instance"]');
    if (radio) radio.checked = true;
    inline.style.display = '';
    setTimeout(function () { inline.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }

  function closeRestoreModal() {
    _closeRestoreInline();
  }

  function confirmRestore() {
    if (!selInstance || !restoreArn) return;
    var arnToRestore = restoreArn;  // capture before _closeRestoreInline clears it
    var radio = document.querySelector('input[name="bk-restore-type"]:checked');
    var restoreType = radio ? radio.value : 'new_instance';
    var msg = restoreType === 'replace'
      ? 'This will launch a new EC2 instance and immediately STOP your original instance. Manually terminate the original after verifying the new one.'
      : 'This will launch a new EC2 instance from this snapshot. Your original instance keeps running — verify the new one before terminating the old.';
    _showConfirm({
      title:        'Confirm Restore',
      message:      msg,
      confirmLabel: 'Start Restore',
      confirmClass: 'btn-primary',
      iconClass:    'bk-confirm-icon-info',
      onConfirm: async function () {
        _closeRestoreInline();
        try {
          var res  = await API.postBackup({
            action:           'restore',
            recoveryPointArn: arnToRestore,
            restoreType:      restoreType,
            instanceId:       selInstance.instanceId,
            accountId:        selInstance.accountId,
            region:           selInstance.region,
          });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Restore failed.');
          _lastRestoreJobId = data.restoreJobId || null;
          _lastRestoreInst  = { accountId: selInstance.accountId, region: selInstance.region };
          _showRestoreBanner(data.restoreJobId);
          App.showToast('Restore job started.', 'ok');
        } catch (e) {
          _showActionBanner(e.message, 'err');
          App.showToast(e.message, 'err');
        }
      },
    });
  }

  // ─── Schedule inline form

  function openScheduleForm(planId) {
    editPlan = planId
      ? (plans.find(function (p) { return p.backupPlanId === planId; }) || null)
      : null;

    var inline  = document.getElementById('bk-sched-inline');
    var title   = document.getElementById('bk-sched-inline-title');
    var preset  = document.getElementById('bk-sched-preset');
    var cronInp = document.getElementById('bk-sched-cron');
    var retInp  = document.getElementById('bk-sched-retention');
    var custRow = document.getElementById('bk-sched-custom-row');
    var timeRow = document.getElementById('bk-sched-time-row');
    var hourSel = document.getElementById('bk-sched-hour');
    var minSel  = document.getElementById('bk-sched-minute');
    if (!inline) return;

    if (title) title.textContent = editPlan ? 'Edit Backup Schedule' : 'Add Backup Schedule';

    var cronDisplay = document.getElementById('bk-sched-cron-display');
    if (editPlan) {
      var matched = _matchPreset(editPlan.scheduleCron);
      if (preset)      preset.value      = matched;
      if (cronInp)     cronInp.value     = editPlan.scheduleCron || '';
      if (cronDisplay) cronDisplay.value = editPlan.scheduleCron || '';
      if (retInp)  retInp.value  = editPlan.retentionDays || 30;
      var t = _parseCronTime(editPlan.scheduleCron);
      if (hourSel) hourSel.value = t.h;
      if (minSel)  minSel.value  = t.m;
      var isCustom = matched === 'custom';
      if (custRow) custRow.style.display = isCustom ? '' : 'none';
      if (timeRow) timeRow.style.display = isCustom ? 'none' : '';
    } else {
      if (preset)      preset.value      = 'daily';
      if (cronInp)     cronInp.value     = 'cron(0 2 * * ? *)';
      if (cronDisplay) cronDisplay.value = '';
      if (retInp)  retInp.value  = 30;
      if (hourSel) hourSel.value = 2;
      if (minSel)  minSel.value  = 0;
      if (custRow) custRow.style.display = 'none';
      if (timeRow) timeRow.style.display = '';
    }

    inline.style.display = '';
    setTimeout(function () { inline.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }

  function onPresetChange() {
    var preset      = document.getElementById('bk-sched-preset');
    var cronInp     = document.getElementById('bk-sched-cron');
    var cronDisplay = document.getElementById('bk-sched-cron-display');
    var retInp      = document.getElementById('bk-sched-retention');
    var custRow     = document.getElementById('bk-sched-custom-row');
    var timeRow     = document.getElementById('bk-sched-time-row');
    var hourSel     = document.getElementById('bk-sched-hour');
    var minSel      = document.getElementById('bk-sched-minute');
    var val         = preset ? preset.value : 'daily';
    var isCustom    = val === 'custom';
    if (custRow) custRow.style.display = isCustom ? '' : 'none';
    if (timeRow) timeRow.style.display = isCustom ? 'none' : '';
    if (!isCustom) {
      var h = hourSel ? parseInt(hourSel.value, 10) : 2;
      var m = minSel  ? parseInt(minSel.value,  10) : 0;
      var cron = _buildCron(val, h, m);
      if (cronInp) cronInp.value = cron;
      if (retInp && !editPlan) retInp.value = (CRON_PRESETS[val] || CRON_PRESETS.daily).days;
    } else {
      // Switching to custom: seed display with current hidden value
      if (cronDisplay && cronInp) cronDisplay.value = cronInp.value;
    }
  }

  function onTimeChange() {
    var preset  = document.getElementById('bk-sched-preset');
    var cronInp = document.getElementById('bk-sched-cron');
    var hourSel = document.getElementById('bk-sched-hour');
    var minSel  = document.getElementById('bk-sched-minute');
    var val = preset ? preset.value : 'daily';
    if (val === 'custom') return;  // custom cron: user edits directly
    var h = hourSel ? parseInt(hourSel.value, 10) : 2;
    var m = minSel  ? parseInt(minSel.value,  10) : 0;
    if (cronInp) cronInp.value = _buildCron(val, h, m);
  }

  function closeScheduleModal() {
    _closeSchedInline();
  }

  async function saveSchedule() {
    if (!selInstance) return;
    var cronInp = document.getElementById('bk-sched-cron');
    var retInp  = document.getElementById('bk-sched-retention');
    var preset  = document.getElementById('bk-sched-preset');
    var presetVal = preset ? preset.value : 'daily';

    var scheduleCron = cronInp ? cronInp.value.trim() : '';
    var retentionDays = retInp ? parseInt(retInp.value, 10) : 30;

    if (!scheduleCron)                                                     return App.showToast('Cron expression is required.', 'err');
    if (isNaN(retentionDays) || retentionDays < 1 || retentionDays > 365) return App.showToast('Retention must be 1\u2013365 days.', 'err');

    var action   = editPlan ? 'updateschedule' : 'createschedule';
    var planName = editPlan
      ? editPlan.backupPlanName
      : ('ec2ctrl-' + selInstance.instanceId + '-' + Date.now());
    var payload = {
      action:        action,
      scheduleCron:  scheduleCron,
      retentionDays: retentionDays,
      instanceId:    selInstance.instanceId,
      instanceArn:   selInstance.instanceArn,
      accountId:     selInstance.accountId,
      region:        selInstance.region,
      backupPlanName: planName,
    };
    if (editPlan) payload.backupPlanId = editPlan.backupPlanId;
    var verb = editPlan ? 'updated' : 'created';
    _closeSchedInline();
    _hideActionBanner();
    try {
      var res  = await API.postBackup(payload);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save schedule.');
      _showActionBanner(data.message || ('Backup schedule ' + verb + ' successfully.'), 'ok');
      App.showToast(data.message || 'Schedule saved.', 'ok');
      load(selInstance.instanceId, selInstance.accountId, selInstance.region);
    } catch (e) {
      _showActionBanner(e.message, 'err');
      App.showToast(e.message, 'err');
    }
  }

  // ─── Delete schedule

  function deleteSchedule(planId, selId) {
    if (!selInstance) return;
    _showConfirm({
      title:        'Delete Schedule',
      message:      'Delete this backup schedule? Existing recovery points are not affected and will remain in the vault.',
      confirmLabel: 'Delete',
      confirmClass: 'btn-danger',
      iconClass:    'bk-confirm-icon-danger',
      onConfirm: async function () {
        _hideActionBanner();
        try {
          var res  = await API.postBackup({
            action:       'deleteschedule',
            backupPlanId: planId,
            selectionId:  selId,
            accountId:    selInstance.accountId,
            region:       selInstance.region,
          });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Failed to delete schedule.');
          _showActionBanner('Backup schedule deleted successfully. Existing recovery points are unaffected.', 'ok');
          App.showToast('Schedule deleted.', 'ok');
          load(selInstance.instanceId, selInstance.accountId, selInstance.region);
        } catch (e) {
          _showActionBanner(e.message, 'err');
          App.showToast(e.message, 'err');
        }
      },
    });
  }

  function refresh() {
    if (selInstance) load(selInstance.instanceId, selInstance.accountId, selInstance.region);
  }

  // ─── Called by Instances.refresh() after instance data is loaded ─────────────
  // Repopulates the instance selector while preserving the current selection.
  // Fixes the race condition where the user visits Backup before instances load.
  function onInstancesRefreshed() {
    var sel = document.getElementById('bk-instance-select');
    if (!sel) return;
    var prev = sel.value;
    _populateInstanceSelector();
    if (prev) {
      sel.value = prev;
      if (!sel.value) {   // previous instance no longer in the list
        selInstance = null;
        var wrap = document.getElementById('bk-content');
        if (wrap) wrap.style.display = 'none';
      }
    }
  }

  // ─── Public API
  return {
    init:                 init,
    onTabActivated:       onTabActivated,
    onInstancesRefreshed: onInstancesRefreshed,
    load:               load,
    refresh:            refresh,
    backupNow:          backupNow,
    openRestoreModal:   openRestoreModal,
    closeRestoreModal:  closeRestoreModal,
    confirmRestore:     confirmRestore,
    openScheduleForm:   openScheduleForm,
    onPresetChange:     onPresetChange,
    onTimeChange:       onTimeChange,
    closeScheduleModal: closeScheduleModal,
    saveSchedule:       saveSchedule,
    deleteSchedule:     deleteSchedule,
    confirmOk:           confirmOk,
    confirmCancel:       confirmCancel,
    dismissBanner:       _hideActionBanner,
    checkRestoreStatus:  checkRestoreStatus,
  };
})();
