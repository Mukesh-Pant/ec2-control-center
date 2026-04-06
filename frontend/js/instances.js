/* ═══════════════════════════════════════════════
   Instances Module - List, account groups, detail panel, start/stop
   ═══════════════════════════════════════════════ */

const Instances = (function () {

  // ─── State ───
  var allInstances = [];
  var selInst      = null;
  var pollTimer    = null;
  var _terminating = false;

  // ─── Refresh (called from Dashboard + Instances page) ─────────────────────

  async function refresh() {
    var agWrap  = document.getElementById('ag-wrap');
    var dashLst = document.getElementById('dash-list');

    if (agWrap) agWrap.innerHTML = '<div class="empty"><div class="empty-ico">🔄</div><p class="empty-t">Fetching instances from AWS…</p></div>';
    if (dashLst) dashLst.innerHTML = '<div class="empty"><div class="empty-ico">⚡</div><p class="empty-t">Loading instances…</p></div>';

    try {
      var res  = await API.ec2Action({ action: 'list' });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to list instances');

      allInstances = data.instances || [];

      if (data.pendingApproval) {
        var msg = '<div class="empty"><div class="empty-ico">⏳</div><p class="empty-t">Your account is pending approval.<br>Contact an administrator to get access.</p></div>';
        if (agWrap)  agWrap.innerHTML  = msg;
        if (dashLst) dashLst.innerHTML = msg;
        App.updateDashStats([]);
        return;
      }
      if (data.noAccountsAssigned) {
        var msg2 = '<div class="empty"><div class="empty-ico">🔒</div><p class="empty-t">No accounts have been assigned to you yet.<br>Contact an administrator.</p></div>';
        if (agWrap)  agWrap.innerHTML  = msg2;
        if (dashLst) dashLst.innerHTML = msg2;
        App.updateDashStats([]);
        return;
      }

      _renderAGroups();
      _renderDashList();
      App.updateDashStats(allInstances);
      App.log('Loaded ' + allInstances.length + ' instance(s)', 'ok');
      if (typeof Backup !== 'undefined' && Backup.onInstancesRefreshed) {
        Backup.onInstancesRefreshed();
      }
      if (typeof Audit !== 'undefined' && Audit.onInstancesRefreshed) {
        Audit.onInstancesRefreshed();
      }

    } catch (err) {
      if (err.message === 'Session expired' || err.message === 'Unauthorized') return;
      if (agWrap)  agWrap.innerHTML  = '<div class="empty"><p class="empty-t">Error: ' + App.esc(err.message) + '</p></div>';
      if (dashLst) dashLst.innerHTML = '<div class="empty"><p class="empty-t">Error: ' + App.esc(err.message) + '</p></div>';
      App.log('List failed: ' + err.message, 'err');
      App.showToast('Failed to load instances', 'err');
    }
  }

  // ─── Account-grouped tables (Instances page) ──────────────────────────────

  function _renderAGroups() {
    var wrap = document.getElementById('ag-wrap');
    if (!wrap) return;

    if (allInstances.length === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-ico">🖥️</div><p class="empty-t">No instances found across linked accounts</p></div>';
      return;
    }

    // Group by accountId
    var groups = {};
    var order  = [];
    allInstances.forEach(function (i) {
      if (!groups[i.accountId]) {
        groups[i.accountId] = { name: i.accountName || i.accountId, instances: [] };
        order.push(i.accountId);
      }
      groups[i.accountId].instances.push(i);
    });

    var role = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : 'admin';
    var canConsole = (role === 'admin' || role === 'operator');

    var html = '';
    order.forEach(function (acctId) {
      var g   = groups[acctId];
      var gid = 'ag-' + acctId;
      // Use the region of the first instance in this group as the console region
      var firstRegion = g.instances.length ? App.esc(g.instances[0].region) : 'ap-south-1';
      var consoleBtn = canConsole
        ? '<button class="btn-console-sm" onclick="event.stopPropagation();Accounts.consoleLogin(\'' + App.esc(acctId) + '\')" title="Open AWS Console for this account">Console &#x2197;</button>'
        : '';
      html +=
        '<div class="ag" id="' + gid + '">' +
          '<div class="ag-hd" onclick="Instances._toggleAg(\'' + gid + '\')">' +
            '<svg class="ag-arrow open" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
            '<span class="ag-name">' + App.esc(g.name) + '</span>' +
            '<span class="ag-id">' + App.esc(acctId) + '</span>' +
            '<span class="ag-count">' + g.instances.length + '</span>' +
            consoleBtn +
          '</div>' +
          '<div class="ag-body" id="' + gid + '-body">' +
            '<table class="itbl">' +
              '<thead><tr>' +
                '<th>Name</th><th>Instance ID</th><th>Type</th><th>State</th><th>Region</th><th>Public IP</th>' +
              '</tr></thead>' +
              '<tbody>' +
              g.instances.map(function (i) {
                return '<tr id="irow-' + App.esc(i.instanceId) + '" class="inst-row" onclick="Instances.openDP(\'' + App.esc(i.instanceId) + '\',\'' + App.esc(i.accountId) + '\')">' +
                  '<td class="inst-name">' + App.esc(i.name || i.instanceId) + '</td>' +
                  '<td class="mono">' + App.esc(i.instanceId) + '</td>' +
                  '<td class="mono">' + App.esc(i.instanceType || '-') + '</td>' +
                  '<td>' + _stateBadge(i.state) + '</td>' +
                  '<td class="mono">' + App.esc(i.region) + '</td>' +
                  '<td class="mono">' + App.esc(i.publicIp || '-') + '</td>' +
                '</tr>';
              }).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
    });

    wrap.innerHTML = html;
  }

  function _toggleAg(gid) {
    var body  = document.getElementById(gid + '-body');
    var arrow = document.querySelector('#' + gid + ' .ag-arrow');
    if (!body) return;
    body.classList.toggle('collapsed');
    if (arrow) arrow.classList.toggle('open', !body.classList.contains('collapsed'));
  }

  // ─── Dashboard quick-control list ─────────────────────────────────────────

  function _renderDashList() {
    var wrap = document.getElementById('dash-list');
    if (!wrap) return;

    if (allInstances.length === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-ico">🖥️</div><p class="empty-t">No instances found</p></div>';
      return;
    }

    var role      = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : 'admin';
    var canMutate = (role === 'admin' || role === 'operator');

    var html = allInstances.map(function (i) {
      var isRunning = i.state === 'running';
      var isStopped = i.state === 'stopped';
      var dotCls = isRunning ? 'running' : (isStopped ? 'stopped' : 'pending');
      var meta = App.esc(i.accountName || i.accountId) + ' · ' + App.esc(i.region) + ' · ' + App.esc(i.instanceType || '-');
      var ctrlBtns = canMutate
        ? '<div class="dl-btns">' +
            '<button class="btn btn-green btn-xs dl-start-btn" onclick="event.stopPropagation();Instances._qCtrl(event,\'start\',\'' + App.esc(i.instanceId) + '\',\'' + App.esc(i.accountId) + '\',\'' + App.esc(i.region) + '\',\'' + App.esc(i.name||i.instanceId) + '\',\'' + App.esc(i.instanceType||'') + '\')"' + (isStopped ? '' : ' disabled') + '>' +
              '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>Start' +
            '</button>' +
            '<button class="btn btn-red btn-xs" onclick="event.stopPropagation();Instances._qCtrl(event,\'stop\',\'' + App.esc(i.instanceId) + '\',\'' + App.esc(i.accountId) + '\',\'' + App.esc(i.region) + '\',\'' + App.esc(i.name||i.instanceId) + '\',\'' + App.esc(i.instanceType||'') + '\')"' + (isRunning ? '' : ' disabled') + '>' +
              '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>Stop' +
            '</button>' +
          '</div>'
        : '<div class="dl-btns"><span class="usr-badge usr-badge-viewers" style="font-size:10px">View only</span></div>';
      return (
        '<div class="dl-row" onclick="App.go(\'instances\'); Instances.openDP(\'' + App.esc(i.instanceId) + '\',\'' + App.esc(i.accountId) + '\')">' +
          '<span class="dl-dot ' + dotCls + '"></span>' +
          '<div class="dl-info">' +
            '<div class="dl-name">' + App.esc(i.name || i.instanceId) + '</div>' +
            '<div class="dl-meta">' + meta + '</div>' +
          '</div>' +
          '<span class="dl-sep">-</span>' +
          _stateBadge(i.state) +
          ctrlBtns +
        '</div>'
      );
    }).join('');

    wrap.innerHTML = html;
  }

  // ─── Quick control (dashboard buttons) ────────────────────────────────────

  async function _qCtrl(e, action, instanceId, accountId, region, name, type) {
    e.stopPropagation();
    App.log('Quick ' + action + ': ' + instanceId, 'sys');
    try {
      var res  = await API.ec2Action({ action: action, instanceId: instanceId, accountId: accountId, region: region, instanceName: name, instanceType: type });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      App.log(action + ' sent to ' + instanceId, 'ok');
      App.showToast(name + ' ' + action + ' accepted', 'ok');
      setTimeout(refresh, 3000);
    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        App.log('Error: ' + err.message, 'err');
        App.showToast(err.message, 'err');
      }
    }
  }

  // ─── Inline Detail Panel ──────────────────────────────────────────────────

  function openDP(instanceId, accountId) {
    var inst = allInstances.find(function (i) { return i.instanceId === instanceId && i.accountId === accountId; });
    if (!inst) return;

    // Toggle: clicking same open instance closes it
    if (selInst && selInst.instanceId === instanceId) {
      closeDP();
      return;
    }

    // Close any previously open panel
    closeDP();

    var role      = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : 'admin';
    var canMutate = (role === 'admin' || role === 'operator');
    var isAdmin   = (role === 'admin');

    selInst = inst;

    var sourceRow = document.getElementById('irow-' + instanceId);
    if (!sourceRow) return;

    // Build inline detail row
    var detailRow = document.createElement('tr');
    detailRow.className = 'dp-inline-row';
    detailRow.id = 'dp-inline';
    detailRow.innerHTML =
      '<td colspan="6" style="padding:0">' +
        '<div class="dp">' +
          '<div class="dp-stripe"></div>' +
          '<div class="dp-banner">' +
            '<div class="dp-left">' +
              '<div class="dp-name" id="dp-name">-</div>' +
              '<div class="dp-id" id="dp-id">-</div>' +
            '</div>' +
            '<div class="dp-badge stopped" id="dp-bdg"><span class="dp-sdot"></span><span id="dp-st">STOPPED</span></div>' +
          '</div>' +
          '<div class="dp-metrics">' +
            '<div class="dp-m"><div class="dp-ml">Account</div><div class="dp-mv blue" id="dp-acct">-</div></div>' +
            '<div class="dp-m"><div class="dp-ml">Region</div><div class="dp-mv blue" id="dp-reg">-</div></div>' +
            '<div class="dp-m"><div class="dp-ml">Instance Type</div><div class="dp-mv" id="dp-type">-</div></div>' +
            '<div class="dp-m"><div class="dp-ml">Platform</div><div class="dp-mv violet" id="dp-plat">-</div></div>' +
            '<div class="dp-m"><div class="dp-ml">Public IP</div><div class="dp-mv mono-sm" id="dp-pub">-</div></div>' +
            '<div class="dp-m"><div class="dp-ml">Storage</div><div class="dp-mv" id="dp-storage">-</div></div>' +
            '<div class="dp-m"><div class="dp-ml">Elastic IP</div><div class="dp-mv mono-sm amber" id="dp-eip">-</div></div>' +
          '</div>' +
          (canMutate
            ? '<div class="dp-ctrl">' +
                '<span class="dp-ctrl-lbl">Controls</span>' +
                '<button class="btn btn-green btn-sm" id="dp-start" onclick="Instances.ctrlInst(\'start\')" disabled>' +
                  '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg><span id="dp-sl">Start</span>' +
                '</button>' +
                '<button class="btn btn-red btn-sm" id="dp-stop" onclick="Instances.ctrlInst(\'stop\')" disabled>' +
                  '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg><span id="dp-stl">Stop</span>' +
                '</button>' +
                (isAdmin
                  ? '<button class="btn btn-red btn-sm" id="dp-terminate" onclick="Instances.confirmTerminate()">' +
                      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">' +
                        '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>' +
                        '<path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>' +
                      '</svg>Terminate' +
                    '</button>'
                  : '') +
                '<button class="btn btn-out btn-sm" onclick="Instances.refreshDP()">' +
                  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Refresh' +
                '</button>' +
                '<button class="btn btn-ghost btn-sm ml-auto" onclick="Instances.closeDP()">' +
                  '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Close' +
                '</button>' +
              '</div>'
            : '<div class="dp-ctrl">' +
                '<span class="dp-ctrl-lbl" style="color:var(--ink3)">View only - no start/stop access</span>' +
                '<button class="btn btn-out btn-sm" onclick="Instances.refreshDP()">' +
                  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Refresh' +
                '</button>' +
                '<button class="btn btn-ghost btn-sm ml-auto" onclick="Instances.closeDP()">' +
                  '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Close' +
                '</button>' +
              '</div>') +
        '</div>' +
      '</td>';

    sourceRow.parentNode.insertBefore(detailRow, sourceRow.nextSibling);

    // Highlight selected row
    sourceRow.classList.add('inst-row-selected');

    _fillDP(inst);
    _setDPStatus(inst.state);
    App.log('Opened: ' + (inst.name || inst.instanceId), 'sys');
    _pollDP();

    detailRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeDP() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }

    var existing = document.getElementById('dp-inline');
    if (existing) existing.remove();

    // Remove highlight from previously selected row
    document.querySelectorAll('.inst-row-selected').forEach(function (r) {
      r.classList.remove('inst-row-selected');
    });

    selInst = null;
  }

  function _fillDP(inst) {
    App.setText('dp-name', inst.name || inst.instanceId);
    App.setText('dp-id',   inst.instanceId + ' · ' + inst.region);
    App.setText('dp-acct', inst.accountName || inst.accountId);
    App.setText('dp-reg',  inst.region);
    App.setText('dp-type', inst.instanceType || '-');
    App.setText('dp-plat', inst.platform || 'Linux');
    App.setText('dp-pub',  inst.publicIp || '-');
    App.setText('dp-storage', inst.storageGb ? inst.storageGb + ' GB' : '-');
    App.setText('dp-eip',  inst.elasticIp || '-');

    // Show terminate button for admins only
    var termBtn = document.getElementById('dp-terminate');
    if (termBtn) termBtn.style.display = Auth.getRole() === 'admin' ? '' : 'none';
  }

  function _setDPStatus(state) {
    var st   = state || 'stopped';
    var norm = ['running','stopped','pending','stopping','starting'].indexOf(st) !== -1 ? st : 'pending';
    var bdg  = document.getElementById('dp-bdg');
    var txt  = document.getElementById('dp-st');
    if (bdg) { bdg.className = 'dp-badge ' + norm; }
    if (txt) txt.textContent = st.toUpperCase();

    var startBtn = document.getElementById('dp-start');
    var stopBtn  = document.getElementById('dp-stop');
    if (startBtn) startBtn.disabled = st !== 'stopped';
    if (stopBtn)  stopBtn.disabled  = st !== 'running';
  }

  async function _pollDP() {
    if (!selInst) return;
    try {
      var res  = await API.ec2Action({ action: 'status', instanceId: selInst.instanceId, region: selInst.region, accountId: selInst.accountId });
      var data = await res.json();
      if (res.ok) {
        _setDPStatus(data.state);
        if (data.instanceType) App.setText('dp-type', data.instanceType);
        App.setText('dp-pub', data.publicIp || '-');
        var stable = ['running','stopped','terminated'].indexOf(data.state) !== -1;
        pollTimer = setTimeout(_pollDP, stable ? 15000 : 3000);
      }
    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        pollTimer = setTimeout(_pollDP, 20000);
      }
    }
  }

  function refreshDP() {
    if (selInst) _pollDP();
  }

  // ─── Terminate from detail panel (admin only) ─────────────────────────────

  function confirmTerminate() {
    if (!selInst) return;
    var overlay = document.getElementById('inst-term-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function cancelTerminate() {
    var overlay = document.getElementById('inst-term-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function doTerminate() {
    if (!selInst || _terminating) return;
    _terminating = true;
    cancelTerminate();

    var btn = document.getElementById('dp-terminate');
    if (btn) { btn.disabled = true; btn.textContent = 'Terminating…'; }

    try {
      var res  = await API.ec2Action({
        action:       'terminate',
        instanceId:   selInst.instanceId,
        region:       selInst.region,
        accountId:    selInst.accountId,
        instanceName: selInst.name,
        instanceType: selInst.instanceType,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Terminate failed');
      App.showToast('Instance terminated', 'ok');
      closeDP();
      setTimeout(function () { Instances.refresh(); }, 3000);
    } catch (e) {
      App.showToast('Terminate error: ' + e.message, 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Terminate'; }
    } finally {
      _terminating = false;
    }
  }

  // ─── Start / Stop from detail panel ───────────────────────────────────────

  async function ctrlInst(action) {
    if (!selInst) return;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }

    var startBtn = document.getElementById('dp-start');
    var stopBtn  = document.getElementById('dp-stop');
    var lblEl    = document.getElementById(action === 'start' ? 'dp-sl' : 'dp-stl');
    if (startBtn) startBtn.disabled = true;
    if (stopBtn)  stopBtn.disabled  = true;
    if (lblEl)    lblEl.textContent  = action === 'start' ? 'Starting…' : 'Stopping…';

    App.log('Sending ' + action.toUpperCase() + ' → ' + selInst.instanceId, 'sys');

    try {
      var res  = await API.ec2Action({
        action:       action,
        instanceId:   selInst.instanceId,
        region:       selInst.region,
        accountId:    selInst.accountId,
        instanceName: selInst.name || selInst.instanceId,
        instanceType: selInst.instanceType || '',
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);

      App.log(action + ' accepted - ' + selInst.instanceId, 'ok');
      App.showToast((selInst.name || selInst.instanceId) + ' ' + action + ' accepted', 'ok');
      _setDPStatus(action === 'start' ? 'pending' : 'stopping');
      pollTimer = setTimeout(_pollDP, 3000);
      setTimeout(refresh, 6000);

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        App.log('Error: ' + err.message, 'err');
        App.showToast(err.message, 'err');
        if (selInst) _setDPStatus(selInst.state || 'stopped');
      }
    } finally {
      if (lblEl) lblEl.textContent = action === 'start' ? 'Start' : 'Stop';
    }
  }

  // ─── State badge HTML ──────────────────────────────────────────────────────

  function _stateBadge(state) {
    var cls = ['running','stopped','pending','stopping','starting'].indexOf(state) !== -1 ? state : 'pending';
    return '<span class="sbadge ' + cls + '"><span class="sbadge-dot"></span>' + App.esc(state || '-') + '</span>';
  }

  // ─── Public ────────────────────────────────────────────────────────────────

  return {
    refresh:          refresh,
    openDP:           openDP,
    closeDP:          closeDP,
    refreshDP:        refreshDP,
    ctrlInst:         ctrlInst,
    confirmTerminate: confirmTerminate,
    cancelTerminate:  cancelTerminate,
    doTerminate:      doTerminate,
    _toggleAg:        _toggleAg,
    _qCtrl:           _qCtrl,
    getAll:           function () { return allInstances; },
  };

})();
