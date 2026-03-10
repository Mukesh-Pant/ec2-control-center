/* ═══════════════════════════════════════════════
   Instances Module — List, select, start/stop
   ═══════════════════════════════════════════════ */

const Instances = (function () {

  let allInstances = [];
  let selectedInstance = null;
  let pollTimer = null;
  let currentState = 'stopped';
  let activeFilter = 'all';

  // ─── Load all instances ───

  async function loadInstances() {
    const btn = document.getElementById('btn-refresh');
    const list = document.getElementById('instance-list');

    btn.disabled = true;
    btn.classList.add('spinning');
    list.innerHTML = '<div class="loading-msg">Fetching instances from AWS...</div>';

    try {
      const res = await API.ec2Action({ action: 'list' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to list instances');

      allInstances = data.instances || [];
      renderInstances();

      App.addLog('Loaded ' + allInstances.length + ' instance(s).', 'ok');
    } catch (err) {
      if (err.message === 'Session expired' || err.message === 'Unauthorized') return;
      list.innerHTML = '<div class="empty-msg">Failed to load: ' + err.message + '</div>';
      App.addLog('List failed: ' + err.message, 'err');
      App.showToast('Failed to load instances', 'err');
    } finally {
      btn.disabled = false;
      btn.classList.remove('spinning');
    }
  }

  // ─── Render grouped instance list ───

  function renderInstances() {
    const list = document.getElementById('instance-list');
    const filtered = activeFilter === 'all'
      ? allInstances
      : allInstances.filter(function (i) { return i.accountId === activeFilter; });

    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-msg">No instances found.</div>';
      updateAccountChips();
      return;
    }

    // Group by account, then region
    var groups = {};
    filtered.forEach(function (inst) {
      var accountKey = inst.accountName + ' (' + inst.accountId + ')';
      if (!groups[accountKey]) groups[accountKey] = {};
      if (!groups[accountKey][inst.region]) groups[accountKey][inst.region] = [];
      groups[accountKey][inst.region].push(inst);
    });

    var html = '';
    Object.keys(groups).forEach(function (accountLabel) {
      html += '<div class="account-group-header">' + escapeHtml(accountLabel) + '</div>';
      var regions = groups[accountLabel];
      Object.keys(regions).sort().forEach(function (region) {
        html += '<div class="region-label">' + escapeHtml(region) + '</div>';
        regions[region].forEach(function (inst) {
          var isSelected = selectedInstance && selectedInstance.instanceId === inst.instanceId;
          html += '<div class="instance-row' + (isSelected ? ' selected' : '') + '" data-id="' + inst.instanceId + '">' +
            '<div class="inst-status-dot ' + inst.state + '"></div>' +
            '<div class="inst-name">' + escapeHtml(inst.name || inst.instanceId) + '</div>' +
            '<div class="inst-id">' + inst.instanceId + '</div>' +
            '<div class="inst-type">' + inst.instanceType + '</div>' +
            '<div class="inst-state ' + inst.state + '">' + inst.state + '</div>' +
            '</div>';
        });
      });
    });

    list.innerHTML = html;

    // Attach click handlers
    list.querySelectorAll('.instance-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        var inst = allInstances.find(function (i) { return i.instanceId === id; });
        if (inst) selectInstance(inst);
      });
    });

    updateAccountChips();
  }

  // ─── Account filter chips ───

  function updateAccountChips() {
    var chips = document.getElementById('account-chips');
    var accounts = {};
    allInstances.forEach(function (inst) {
      if (!accounts[inst.accountId]) {
        accounts[inst.accountId] = inst.accountName || inst.accountId;
      }
    });

    var html = '<button class="filter-chip' + (activeFilter === 'all' ? ' active' : '') + '" data-account="all">All</button>';
    Object.keys(accounts).forEach(function (id) {
      html += '<button class="filter-chip' + (activeFilter === id ? ' active' : '') + '" data-account="' + id + '">' +
        escapeHtml(accounts[id]) + '</button>';
    });
    chips.innerHTML = html;

    chips.querySelectorAll('.filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        activeFilter = this.getAttribute('data-account');
        renderInstances();
      });
    });
  }

  // ─── Select instance ───

  function selectInstance(inst) {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    selectedInstance = inst;

    // Update card
    document.getElementById('server-name').textContent = inst.name || inst.instanceId;
    document.getElementById('instance-display').textContent = inst.instanceId + '  ·  ' + inst.region;
    document.getElementById('metric-account').textContent = inst.accountName || inst.accountId;
    document.getElementById('metric-region').textContent = inst.region;
    document.getElementById('metric-type').textContent = inst.instanceType || '--';
    document.getElementById('metric-ip').textContent = inst.publicIp || 'N/A';

    document.getElementById('server-card').classList.remove('dimmed');
    document.getElementById('no-selection').style.display = 'none';
    document.getElementById('controls-section').style.display = 'block';

    setStatus(inst.state);
    renderInstances(); // re-render to highlight selection
    App.addLog('Selected: ' + (inst.name || inst.instanceId), 'info');

    fetchStatus();
  }

  // ─── Poll status ───

  async function fetchStatus() {
    if (!selectedInstance) return;

    try {
      var res = await API.ec2Action({
        action: 'status',
        instanceId: selectedInstance.instanceId,
        region: selectedInstance.region,
        accountId: selectedInstance.accountId,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Status failed');

      setStatus(data.state);
      if (data.instanceType) document.getElementById('metric-type').textContent = data.instanceType;
      document.getElementById('metric-ip').textContent = data.publicIp || 'N/A';

      var stable = ['running', 'stopped', 'terminated'].indexOf(data.state) !== -1;
      pollTimer = setTimeout(fetchStatus, stable ? 15000 : 3000);

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        App.addLog('Status fetch failed: ' + err.message, 'err');
        pollTimer = setTimeout(fetchStatus, 15000);
      }
    }
  }

  // ─── Set status UI ───

  function setStatus(state) {
    currentState = state;
    var cls = ['running', 'stopped', 'pending'].indexOf(state) !== -1 ? state : 'pending';
    document.getElementById('status-badge').className = 'status-badge ' + cls;
    document.getElementById('status-text').textContent = state.toUpperCase();
    document.getElementById('btn-start').disabled = state !== 'stopped';
    document.getElementById('btn-stop').disabled = state !== 'running';
  }

  // ─── Start / Stop ───

  async function controlServer(action) {
    if (!selectedInstance) { App.showToast('Select an instance first.', 'info'); return; }
    if (action === 'start' && currentState === 'running') { App.showToast('Already running.', 'info'); return; }
    if (action === 'stop' && currentState === 'stopped') { App.showToast('Already stopped.', 'info'); return; }

    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }

    setLoading(action, true);
    setStatus('pending');
    App.addLog('Sending ' + action.toUpperCase() + ' → ' + selectedInstance.instanceId + '...', 'info');

    try {
      var res = await API.ec2Action({
        action: action,
        instanceId: selectedInstance.instanceId,
        region: selectedInstance.region,
        accountId: selectedInstance.accountId,
      });
      var data = await res.json();

      if (res.ok) {
        App.addLog(action + ' accepted — ' + selectedInstance.instanceId, 'ok');
        App.showToast('Server ' + action + ' accepted', 'ok');
        pollTimer = setTimeout(fetchStatus, 3000);
      } else {
        throw new Error(data.message || 'HTTP ' + res.status);
      }
    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        App.addLog('Error: ' + err.message, 'err');
        App.showToast(err.message, 'err');
        setStatus('stopped');
      }
    } finally {
      setLoading(action, false);
    }
  }

  function setLoading(action, on) {
    document.getElementById('spin-' + action).style.display = on ? 'block' : 'none';
    document.getElementById('icon-' + action).style.display = on ? 'none' : 'flex';
    document.getElementById('label-' + action).textContent =
      on ? (action === 'start' ? 'Starting...' : 'Stopping...') : (action === 'start' ? 'Start Server' : 'Stop Server');
    document.getElementById('btn-start').disabled = on;
    document.getElementById('btn-stop').disabled = on;
  }

  // ─── Utility ───

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Public API ───

  return {
    loadInstances: loadInstances,
    controlServer: controlServer,
  };

})();
