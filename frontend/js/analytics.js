/* ═══════════════════════════════════════════════
   Analytics Module - Fleet health, cost, activity
   ═══════════════════════════════════════════════ */

const Analytics = (function () {

  // ─── State ───
  var firstLoad = true;

  // ─── Load ─────────────────────────────────────────────────────────────────

  async function load() {
    var instances = Instances.getAll();
    _renderFleetRing(instances);
    _renderCostByAcct(instances);
    _renderTypeBreakdown(instances);
    _renderCostProjection(instances);

    // Single audit fetch shared by stat cards and activity rows
    try {
      var res  = await API.getAuditLog({ limit: 200 });
      var data = await res.json();
      if (!res.ok) return;
      var items = data.items || [];
      _renderStatCards(instances, items);
      _renderActivityByInst(items);
      _renderActivityByUser(items);
    } catch (err) { /* silent */ }
  }

  // ─── Stat Cards ────────────────────────────────────────────────────────────

  function _renderStatCards(instances, auditItems) {
    var prices  = App.prices;
    var running = instances.filter(function (i) { return i.state === 'running'; });
    var hourly  = running.reduce(function (s, i) { return s + (prices[i.instanceType] || 0.05); }, 0);
    var monthly = (hourly * 24 * 30).toFixed(2);

    App.setText('an-proj',    monthly > 0 ? '$' + monthly : '-');
    App.setText('fleet-upd',  running.length + ' / ' + instances.length + ' running');

    var items  = auditItems || [];
    var starts = items.filter(function (i) { return (i.action || '').toLowerCase() === 'start'; }).length;
    var stops  = items.filter(function (i) { return (i.action || '').toLowerCase().includes('stop'); }).length;

    App.setText('an-total',  items.length);
    App.setText('an-starts', starts);
    App.setText('an-stops',  stops);
  }

  // ─── Fleet Ring SVG ─────────────────────────────────────────────────────────

  function _renderFleetRing(instances) {
    var wrap = document.getElementById('fleet-ring');
    if (!wrap) return;

    var total   = instances.length;
    var running = instances.filter(function (i) { return i.state === 'running'; }).length;
    var stopped = instances.filter(function (i) { return i.state === 'stopped'; }).length;
    var other   = total - running - stopped;

    if (total === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-ico">🖥️</div><p class="empty-t">No instances found</p></div>';
      return;
    }

    var r    = 54;
    var circ = 2 * Math.PI * r;

    function arc(start, count) {
      var a = circ * (count / total);
      var off = circ / 4 - circ * (start / total);
      return { dasharray: a.toFixed(2) + ' ' + (circ - a).toFixed(2), offset: off.toFixed(2) };
    }

    var runArc = arc(0, running);
    var stpArc = arc(running, stopped);
    var othArc = arc(running + stopped, other);

    wrap.innerHTML =
      '<div class="ring-wrap">' +
        '<svg width="128" height="128" viewBox="0 0 128 128">' +
          '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="#e5e7eb" stroke-width="14"/>' +
          (running > 0 ? '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="#059669" stroke-width="14" stroke-linecap="butt"' +
            ' stroke-dasharray="' + runArc.dasharray + '" stroke-dashoffset="' + runArc.offset + '"' +
            ' transform="rotate(-90 64 64)"/>' : '') +
          (stopped > 0 ? '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="#dc2626" stroke-width="14" stroke-linecap="butt"' +
            ' stroke-dasharray="' + stpArc.dasharray + '" stroke-dashoffset="' + stpArc.offset + '"' +
            ' transform="rotate(-90 64 64)"/>' : '') +
          (other > 0 ? '<circle cx="64" cy="64" r="' + r + '" fill="none" stroke="#d97706" stroke-width="14" stroke-linecap="butt"' +
            ' stroke-dasharray="' + othArc.dasharray + '" stroke-dashoffset="' + othArc.offset + '"' +
            ' transform="rotate(-90 64 64)"/>' : '') +
          '<text x="64" y="60" text-anchor="middle" font-size="22" font-weight="800" fill="#122c53">' + running + '</text>' +
          '<text x="64" y="76" text-anchor="middle" font-size="11" fill="#8596ae">running</text>' +
        '</svg>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-left:20px">' +
          _legRow('#059669', 'Running',      running) +
          _legRow('#dc2626', 'Stopped',      stopped) +
          (other > 0 ? _legRow('#d97706', 'Transitioning', other) : '') +
        '</div>' +
      '</div>';
  }

  function _legRow(color, label, count) {
    return (
      '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>' +
        '<span style="color:#4a5568">' + App.esc(label) + '</span>' +
        '<strong style="margin-left:auto;color:#1e2a3a">' + count + '</strong>' +
      '</div>'
    );
  }

  // ─── Cost by Account ────────────────────────────────────────────────────────

  function _renderCostByAcct(instances) {
    var wrap = document.getElementById('an-acct-cost');
    if (!wrap) return;

    var prices = App.prices;
    var byAcct = {};

    instances.filter(function (i) { return i.state === 'running'; }).forEach(function (i) {
      var id = i.accountId;
      if (!byAcct[id]) byAcct[id] = { name: i.accountName || id, cost: 0 };
      byAcct[id].cost += (prices[i.instanceType] || 0.05) * 24 * 30;
    });

    var ids = Object.keys(byAcct);
    if (ids.length === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-ico">💰</div><p class="empty-t">No running instances</p></div>';
      return;
    }

    ids.sort(function (a, b) { return byAcct[b].cost - byAcct[a].cost; });
    var max = byAcct[ids[0]].cost;

    wrap.innerHTML = ids.map(function (id) {
      var a   = byAcct[id];
      var pct = max > 0 ? (a.cost / max * 100).toFixed(1) : 0;
      return (
        '<div class="acct-bar-row">' +
          '<div class="acct-bar-name">' + App.esc(a.name) + '</div>' +
          '<div class="acct-bar-track">' +
            '<div class="acct-bar-fill" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<div class="acct-bar-val">$' + a.cost.toFixed(2) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ─── Type Breakdown ─────────────────────────────────────────────────────────

  function _renderTypeBreakdown(instances) {
    var wrap = document.getElementById('an-type-grid');
    if (!wrap) return;

    var counts = {};
    instances.forEach(function (i) {
      var t = i.instanceType || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    });

    var types = Object.keys(counts);
    App.setText('type-ct', types.length + ' type' + (types.length !== 1 ? 's' : ''));

    if (types.length === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-ico">🔎</div><p class="empty-t">No instances found</p></div>';
      return;
    }

    types.sort(function (a, b) { return counts[b] - counts[a]; });

    wrap.innerHTML = types.map(function (t) {
      return (
        '<div class="type-chip">' +
          '<div class="type-chip-name">' + App.esc(t) + '</div>' +
          '<div class="type-chip-count">' + counts[t] + '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ─── Running Cost Projection ────────────────────────────────────────────────

  function _renderCostProjection(instances) {
    var wrap    = document.getElementById('an-cost-proj');
    if (!wrap) return;

    var prices  = App.prices;
    var running = instances.filter(function (i) { return i.state === 'running'; });

    if (running.length === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-ico">💤</div><p class="empty-t">No instances currently running</p></div>';
      return;
    }

    running.sort(function (a, b) {
      return (prices[b.instanceType] || 0.05) - (prices[a.instanceType] || 0.05);
    });

    wrap.innerHTML = running.map(function (i) {
      var rate  = prices[i.instanceType] || 0.05;
      var month = (rate * 24 * 30).toFixed(2);
      return (
        '<div class="cproj-row">' +
          '<div class="cproj-name">' + App.esc(i.name || i.instanceId) + '</div>' +
          '<div class="cproj-type">' + App.esc(i.instanceType || '-') + '</div>' +
          '<div class="cproj-type">' + App.esc(i.accountName || i.accountId) + '</div>' +
          '<div class="cproj-cost">$' + month + '/mo</div>' +
        '</div>'
      );
    }).join('');
  }

  // ─── Activity by Instance / User ───────────────────────────────────────────

  function _renderActivityByInst(items) {
    var wrap = document.getElementById('an-inst-rows');
    if (!wrap) return;

    var counts = {};
    items.forEach(function (item) {
      var id = item.instanceId;
      if (!counts[id]) counts[id] = { name: item.instanceName || id, count: 0 };
      counts[id].count++;
    });

    var ids = Object.keys(counts);
    App.setText('an-ict', ids.length + ' instance' + (ids.length !== 1 ? 's' : ''));

    if (ids.length === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-ico">📊</div><p class="empty-t">No audit data yet</p></div>';
      return;
    }

    ids.sort(function (a, b) { return counts[b].count - counts[a].count; });
    var max = counts[ids[0]].count;

    wrap.innerHTML = ids.slice(0, 10).map(function (id) {
      var c   = counts[id];
      var pct = max > 0 ? (c.count / max * 100).toFixed(1) : 0;
      return (
        '<div class="an-act-row">' +
          '<div class="an-act-name">' + App.esc(c.name) + '</div>' +
          '<div class="an-act-bar-wrap"><div class="an-act-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="an-act-count">' + c.count + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function _renderActivityByUser(items) {
    var wrap = document.getElementById('an-user-rows');
    if (!wrap) return;

    var counts = {};
    items.forEach(function (item) {
      var u = item.userEmail || 'unknown';
      counts[u] = (counts[u] || 0) + 1;
    });

    var users = Object.keys(counts);
    App.setText('an-uct', users.length + ' user' + (users.length !== 1 ? 's' : ''));

    if (users.length === 0) {
      wrap.innerHTML = '<div class="empty"><div class="empty-ico">👤</div><p class="empty-t">No audit data yet</p></div>';
      return;
    }

    users.sort(function (a, b) { return counts[b] - counts[a]; });
    var max = counts[users[0]];

    wrap.innerHTML = users.slice(0, 10).map(function (u) {
      var pct = max > 0 ? (counts[u] / max * 100).toFixed(1) : 0;
      return (
        '<div class="an-act-row">' +
          '<div class="an-act-name">' + App.esc(u) + '</div>' +
          '<div class="an-act-bar-wrap"><div class="an-act-bar-fill" style="background:var(--violet);width:' + pct + '%"></div></div>' +
          '<div class="an-act-count" style="color:var(--violet)">' + counts[u] + '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ─── Tab Activation ────────────────────────────────────────────────────────

  function onTabActivated() {
    if (firstLoad) { firstLoad = false; }
    load();
  }

  // ─── Public ────────────────────────────────────────────────────────────────

  return {
    load:           load,
    onTabActivated: onTabActivated,
  };

})();
