'use strict';

const Backup = (function () {
  // ─── Private state
  var loaded         = false;
  var selInstance    = null;   // { instanceId, accountId, region, instanceArn }
  var recoveryPoints = [];
  var plans          = [];
  var editPlan       = null;   // plan being edited (null = add mode)
  var restoreArn     = null;   // recoveryPointArn for current restore modal

  // ─── Schedule preset cron expressions
  var CRON_PRESETS = {
    daily:   { cron: 'cron(0 2 * * ? *)',   days: 30  },
    weekly:  { cron: 'cron(0 2 ? * SUN *)', days: 90  },
    monthly: { cron: 'cron(0 2 1 * ? *)',   days: 365 },
    custom:  { cron: '',                     days: 30  },
  };

  // ─── Init: register event listeners (called once by App.init)
  function init() {
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
    sel.innerHTML = '<option value="">— Select an instance —</option>';

    var role = Auth.getRole();
    instances.forEach(function (inst) {
      if (role === 'none') return;
      var nameTag = inst.Tags && inst.Tags.find(function (t) { return t.Key === 'Name'; });
      var label   = inst.InstanceId + (nameTag ? ' (' + nameTag.Value + ')' : '') + ' — ' + inst.accountId;
      var val     = JSON.stringify({
        instanceId:  inst.InstanceId,
        accountId:   inst.accountId,
        region:      inst.region,
        instanceArn: 'arn:aws:ec2:' + inst.region + ':' + inst.accountId + ':instance/' + inst.InstanceId,
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
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      _setLoading(false);
    }
  }

  function _setLoading(on) {
    var el = document.getElementById('bk-loading');
    if (el) el.style.display = on ? '' : 'none';
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

  function _friendlyCron(cron) {
    var map = {
      'cron(0 2 * * ? *)':    'Daily at 02:00 UTC',
      'cron(0 2 ? * SUN *)':  'Weekly (Sun) at 02:00 UTC',
      'cron(0 2 1 * ? *)':    'Monthly (1st) at 02:00 UTC',
    };
    return map[cron] || cron || '—';
  }

  function _renderRecoveryPoints() {
    var wrap = document.getElementById('bk-rp-tbody');
    if (!wrap) return;
    if (!recoveryPoints.length) {
      wrap.innerHTML = '<tr><td colspan="4" class="bk-empty">No recovery points yet. Click "Back Up Now" to create one.</td></tr>';
      return;
    }
    var canAct = _canAct();
    wrap.innerHTML = recoveryPoints.map(function (rp) {
      var safeArn = rp.recoveryPointArn.replace(/'/g, '');
      var actions = canAct
        ? '<button class="btn btn-sm btn-out" onclick="Backup.openRestoreModal(\'' + safeArn + '\')">Restore</button> ' +
          '<button class="btn btn-sm btn-danger-out" onclick="Backup.deleteRecovery(\'' + safeArn + '\')">Delete</button>'
        : '<span class="bk-view-only">View only</span>';
      return '<tr>' +
        '<td>' + _fmtDate(rp.creationDate) + '</td>' +
        '<td><span class="bk-status bk-status-' + (rp.status || '').toLowerCase() + '">' + (rp.status || '—') + '</span></td>' +
        '<td>' + _fmtBytes(rp.backupSizeBytes) + '</td>' +
        '<td class="bk-actions">' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  function _renderPlans() {
    var wrap = document.getElementById('bk-plans-tbody');
    if (!wrap) return;
    if (!plans.length) {
      wrap.innerHTML = '<tr><td colspan="4" class="bk-empty">No schedules configured.</td></tr>';
      return;
    }
    var canAct = _canAct();
    wrap.innerHTML = plans.map(function (p) {
      var actions = canAct
        ? '<button class="btn btn-sm btn-out" onclick="Backup.openScheduleForm(\'' + p.backupPlanId + '\')">Edit</button> ' +
          '<button class="btn btn-sm btn-danger-out" onclick="Backup.deleteSchedule(\'' + p.backupPlanId + '\',\'' + p.selectionId + '\')">Delete</button>'
        : '—';
      return '<tr>' +
        '<td>' + _friendlyCron(p.scheduleCron) + '</td>' +
        '<td>' + (p.retentionDays ? p.retentionDays + ' days' : '—') + '</td>' +
        '<td>' + _fmtDate(p.lastExecutionDate) + '</td>' +
        '<td class="bk-actions">' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  function _canAct() {
    var role = Auth.getRole();
    return role === 'admin' || role === 'operator';
  }

  // ─── On-demand backup

  async function backupNow() {
    if (!selInstance) return App.toast('Select an instance first.', 'error');
    var btn = document.getElementById('bk-btn-now');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
    try {
      var res  = await API.postBackup({ action: 'createbackup', instanceId: selInstance.instanceId, instanceArn: selInstance.instanceArn, accountId: selInstance.accountId, region: selInstance.region });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Backup failed.');
      App.toast(data.message || 'Backup job started.', 'success');
      App.log('Backup started for ' + selInstance.instanceId);
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Back Up Now'; }
    }
  }

  // ─── Restore modal

  function openRestoreModal(arn) {
    restoreArn = arn;
    var modal = document.getElementById('bk-restore-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    var radio = modal.querySelector('input[name="bk-restore-type"][value="new_instance"]');
    if (radio) radio.checked = true;
  }

  function closeRestoreModal() {
    restoreArn = null;
    var modal = document.getElementById('bk-restore-modal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmRestore() {
    if (!selInstance || !restoreArn) return;
    var radio = document.querySelector('input[name="bk-restore-type"]:checked');
    var restoreType = radio ? radio.value : 'new_instance';
    var msg = restoreType === 'replace'
      ? 'This will create a new instance and STOP the original. Continue?'
      : 'This will create a new instance. The original keeps running. Continue?';
    if (!confirm(msg)) return;
    closeRestoreModal();
    try {
      var res  = await API.postBackup({ action: 'restore', recoveryPointArn: restoreArn, restoreType: restoreType, instanceId: selInstance.instanceId, accountId: selInstance.accountId, region: selInstance.region });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Restore failed.');
      App.toast(data.message || 'Restore job started.', 'success');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }

  // ─── Schedule form modal

  function openScheduleForm(planId) {
    editPlan = planId ? (plans.find(function (p) { return p.backupPlanId === planId; }) || null) : null;
    var modal    = document.getElementById('bk-sched-modal');
    var title    = document.getElementById('bk-sched-modal-title');
    var preset   = document.getElementById('bk-sched-preset');
    var cronInp  = document.getElementById('bk-sched-cron');
    var retInp   = document.getElementById('bk-sched-retention');
    var custRow  = document.getElementById('bk-sched-custom-row');
    if (!modal) return;
    if (title) title.textContent = editPlan ? 'Edit Backup Schedule' : 'Add Backup Schedule';
    if (editPlan) {
      var matched = Object.keys(CRON_PRESETS).find(function (k) { return CRON_PRESETS[k].cron === editPlan.scheduleCron; }) || 'custom';
      if (preset)  preset.value  = matched;
      if (cronInp) cronInp.value = editPlan.scheduleCron || '';
      if (retInp)  retInp.value  = editPlan.retentionDays || 30;
      if (custRow) custRow.style.display = (matched === 'custom') ? '' : 'none';
    } else {
      if (preset)  preset.value  = 'daily';
      if (cronInp) cronInp.value = CRON_PRESETS.daily.cron;
      if (retInp)  retInp.value  = CRON_PRESETS.daily.days;
      if (custRow) custRow.style.display = 'none';
    }
    modal.style.display = 'flex';
  }

  function onPresetChange() {
    var preset  = document.getElementById('bk-sched-preset');
    var cronInp = document.getElementById('bk-sched-cron');
    var retInp  = document.getElementById('bk-sched-retention');
    var custRow = document.getElementById('bk-sched-custom-row');
    var val = preset ? preset.value : 'daily';
    var p   = CRON_PRESETS[val] || CRON_PRESETS.daily;
    if (cronInp) cronInp.value = p.cron;
    if (retInp && !editPlan) retInp.value = p.days;
    if (custRow) custRow.style.display = (val === 'custom') ? '' : 'none';
  }

  function closeScheduleModal() {
    editPlan = null;
    var modal = document.getElementById('bk-sched-modal');
    if (modal) modal.style.display = 'none';
  }

  async function saveSchedule() {
    if (!selInstance) return;
    var cronInp = document.getElementById('bk-sched-cron');
    var retInp  = document.getElementById('bk-sched-retention');
    var scheduleCron  = cronInp ? cronInp.value.trim() : '';
    var retentionDays = retInp  ? parseInt(retInp.value, 10) : 30;
    if (!scheduleCron)                                     return App.toast('Cron expression is required.', 'error');
    if (isNaN(retentionDays) || retentionDays < 1 || retentionDays > 365) return App.toast('Retention must be between 1 and 365 days.', 'error');
    var action    = editPlan ? 'updateschedule' : 'createschedule';
    var planName  = editPlan ? editPlan.backupPlanName : ('ec2ctrl-' + selInstance.instanceId + '-' + Date.now());
    var payload   = { action: action, scheduleCron: scheduleCron, retentionDays: retentionDays, instanceId: selInstance.instanceId, instanceArn: selInstance.instanceArn, accountId: selInstance.accountId, region: selInstance.region, backupPlanName: planName };
    if (editPlan) payload.backupPlanId = editPlan.backupPlanId;
    closeScheduleModal();
    try {
      var res  = await API.postBackup(payload);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save schedule.');
      App.toast(data.message || 'Schedule saved.', 'success');
      load(selInstance.instanceId, selInstance.accountId, selInstance.region);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }

  // ─── Delete schedule

  async function deleteSchedule(planId, selId) {
    if (!selInstance) return;
    if (!confirm('Delete this backup schedule? Existing recovery points are not affected.')) return;
    try {
      var res  = await API.postBackup({ action: 'deleteschedule', backupPlanId: planId, selectionId: selId, accountId: selInstance.accountId, region: selInstance.region });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete schedule.');
      App.toast('Schedule deleted.', 'success');
      load(selInstance.instanceId, selInstance.accountId, selInstance.region);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }

  // ─── Delete recovery point

  async function deleteRecovery(arn) {
    if (!selInstance) return;
    if (!confirm('Permanently delete this recovery point? This cannot be undone.')) return;
    try {
      var res  = await API.postBackup({ action: 'deleterecovery', recoveryPointArn: arn, accountId: selInstance.accountId, region: selInstance.region });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete recovery point.');
      App.toast('Recovery point deleted.', 'success');
      load(selInstance.instanceId, selInstance.accountId, selInstance.region);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }

  // ─── Public API
  return {
    init:               init,
    onTabActivated:     onTabActivated,
    load:               load,
    backupNow:          backupNow,
    openRestoreModal:   openRestoreModal,
    closeRestoreModal:  closeRestoreModal,
    confirmRestore:     confirmRestore,
    openScheduleForm:   openScheduleForm,
    onPresetChange:     onPresetChange,
    closeScheduleModal: closeScheduleModal,
    saveSchedule:       saveSchedule,
    deleteSchedule:     deleteSchedule,
    deleteRecovery:     deleteRecovery,
  };
})();
