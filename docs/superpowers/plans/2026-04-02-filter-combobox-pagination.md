# Filter Comboboxes + Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Submitted By filter bug (field name mismatch), replace native browser `<datalist>` dropdowns with custom styled in-page comboboxes on three filter inputs, and add 10-record/page Next/Previous pagination to both the Audit Log and Labs ("My Servers") tabs.

**Architecture:** `App.makeCombobox(inputId, getOptions)` in `app.js` handles all dropdown behavior (injected `<ul>`, keyboard nav, click-outside dismiss). `audit.js` calls it once in `init()`; `labs.js` calls it after every `_renderLabsList()` DOM rebuild (the filter bar is regenerated via innerHTML). Audit pagination accumulates all server-fetched records in `_allEvents[]` and slices 10 at a time by `_auditPage`; auto-fetches the next server batch (50 records) when the user advances past what is loaded. Labs pagination is pure client-side over the already-loaded `activeLabs[]`.

**Tech Stack:** Vanilla JS (ES5 IIFE modules), HTML5, CSS3 custom properties already defined in `styles.css`

---

## File Map

| File | What changes |
|------|-------------|
| `frontend/css/styles.css` | Append `.custom-cb-*` and `.audit-pg-row` / `.btn-pg` / `.pg-info` classes |
| `frontend/js/app.js` | Add `makeCombobox` function; expose in return |
| `frontend/index.html` | Remove `list=` attrs + `<datalist>` elements; replace Load More div with pagination bar |
| `frontend/js/audit.js` | Add `_allEvents`/`_auditPage`/`PAGE_SIZE`; rewrite `loadEvents`; add `_renderAuditPage` + `_updatePaginationBar`; remove `_populateInstanceDatalist`; update `init()` |
| `frontend/js/labs.js` | Fix `callerEmail→userEmail`; add `_labsPage`/`LAB_PAGE_SIZE`/`_labsPageNav`; paginate `_renderLabsList`; remove datalist from `_renderFilterBar`; call `App.makeCombobox` after each render |

---

## Task 1: CSS — Combobox + Pagination Styles

**Files:**
- Modify: `frontend/css/styles.css` (append to end of file)

- [ ] **Step 1: Append the following CSS to the very end of `frontend/css/styles.css`**

```css
/* ─── Custom Combobox ─────────────────────────────────────────── */
.custom-cb-dropdown {
  position: absolute; top: calc(100% + 2px); left: 0;
  min-width: 100%; max-height: 220px; overflow-y: auto;
  background: #fff; border: 1.5px solid var(--bd);
  border-radius: var(--rsm); box-shadow: 0 4px 12px rgba(0,0,0,.1);
  z-index: 200; list-style: none; margin: 0; padding: 4px 0;
}
.custom-cb-option {
  padding: 7px 12px; font-size: 12.5px; color: var(--ink);
  cursor: pointer; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  font-family: var(--sans);
}
.custom-cb-option:hover,
.custom-cb-option--active { background: var(--bdim); color: var(--blue); }
.custom-cb-empty {
  padding: 7px 12px; font-size: 12px; color: var(--ink4);
  cursor: default; font-family: var(--sans);
}

/* ─── Pagination Row (shared: Audit Log + Labs) ───────────────── */
.audit-pg-row {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; padding: 12px; border-top: 1px solid var(--bg2);
}
.btn-pg {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 14px; background: var(--bdim); color: var(--blue);
  border: 1.5px solid rgba(37,99,235,.2); border-radius: var(--r);
  font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: var(--sans); transition: all .15s;
}
.btn-pg:hover:not(:disabled) { background: var(--blue2); color: #fff; }
.btn-pg:disabled { opacity: .4; cursor: default; }
.pg-info { font-size: 12px; color: var(--ink3); white-space: nowrap; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/css/styles.css
git commit -m "feat(ui): add custom combobox and pagination CSS"
```

---

## Task 2: app.js — Add `App.makeCombobox` Utility

**Files:**
- Modify: `frontend/js/app.js`

Current last lines of the module (line ~333 onward):
```js
  // ─── Public ────────────────────────────────────────────────────────────────

  return {
    go:               go,
    ...
    init:               init,
    prices:             _PRICES,
  };
```

- [ ] **Step 1: Add `makeCombobox` function immediately above the `// ─── Public` comment**

```js
  // ─── Custom combobox ─────────────────────────────────────────────────────

  function makeCombobox(inputId, getOptions) {
    var input = document.getElementById(inputId);
    if (!input) return;

    // Remove any previous dropdown for this input (re-attach after DOM rebuild)
    var wrapperId = inputId + '-cb';
    var old = document.getElementById(wrapperId);
    if (old) old.parentElement.removeChild(old);

    var ul = document.createElement('ul');
    ul.className = 'custom-cb-dropdown';
    ul.id = wrapperId;
    ul.style.display = 'none';
    // Append INSIDE the parent wrapper (.audit-filter-input-wrap has position:relative)
    input.parentElement.appendChild(ul);

    var activeIndex = -1;

    function _cbEsc(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function getItems() {
      var opts = getOptions();
      if (!opts || opts.length === 0) return [];
      var val = input.value.toLowerCase();
      var filtered = val
        ? opts.filter(function (o) { return o.toLowerCase().indexOf(val) !== -1; })
        : opts;
      return filtered.slice(0, 8);
    }

    function render() {
      var items = getItems();
      activeIndex = -1;
      if (items.length === 0) { close(); return; }
      ul.innerHTML = items.map(function (item) {
        return '<li class="custom-cb-option" data-val="' + _cbEsc(item) + '">' +
          _cbEsc(item) + '</li>';
      }).join('');
      ul.style.display = 'block';
    }

    function close() {
      ul.style.display = 'none';
      activeIndex = -1;
    }

    function selectItem(val) {
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      close();
    }

    function setActive(idx) {
      var opts = ul.querySelectorAll('.custom-cb-option');
      opts.forEach(function (el) { el.classList.remove('custom-cb-option--active'); });
      activeIndex = idx;
      if (idx >= 0 && opts[idx]) {
        opts[idx].classList.add('custom-cb-option--active');
        opts[idx].scrollIntoView({ block: 'nearest' });
      }
    }

    input.addEventListener('focus', render);
    input.addEventListener('input', render);

    input.addEventListener('keydown', function (e) {
      if (ul.style.display === 'none') return;
      var opts = ul.querySelectorAll('.custom-cb-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, opts.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (e.key === 'Enter' && activeIndex >= 0 && opts[activeIndex]) {
        e.preventDefault();
        selectItem(opts[activeIndex].getAttribute('data-val'));
      } else if (e.key === 'Escape') {
        close();
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(close, 150);
    });

    ul.addEventListener('mousedown', function (e) {
      // Use closest() with fallback for older browsers
      var li = e.target.closest
        ? e.target.closest('.custom-cb-option')
        : (e.target.classList.contains('custom-cb-option') ? e.target : null);
      if (li) {
        e.preventDefault();   // prevent blur firing before click registers
        selectItem(li.getAttribute('data-val'));
      }
    });
  }
```

- [ ] **Step 2: Add `makeCombobox` to the return object**

The return block currently ends:
```js
  return {
    go:               go,
    openSidebar:      openSidebar,
    closeSidebar:     closeSidebar,
    log:              log,
    clearLog:         clearLog,
    showToast:        showToast,
    setText:          setText,
    setWidth:         setWidth,
    esc:              esc,
    updateDashStats:  updateDashStats,
    setAdmin:           setAdmin,
    setUserInfo:        setUserInfo,
    setSessionExpiry:   setSessionExpiry,
    isExtensionPresent: isExtensionPresent,
    init:               init,
    prices:             _PRICES,
  };
```

Add `makeCombobox` before `init`:
```js
  return {
    go:               go,
    openSidebar:      openSidebar,
    closeSidebar:     closeSidebar,
    log:              log,
    clearLog:         clearLog,
    showToast:        showToast,
    setText:          setText,
    setWidth:         setWidth,
    esc:              esc,
    updateDashStats:  updateDashStats,
    setAdmin:           setAdmin,
    setUserInfo:        setUserInfo,
    setSessionExpiry:   setSessionExpiry,
    isExtensionPresent: isExtensionPresent,
    makeCombobox:       makeCombobox,
    init:               init,
    prices:             _PRICES,
  };
```

- [ ] **Step 3: Commit**

```bash
git add frontend/js/app.js
git commit -m "feat(ui): add App.makeCombobox custom in-page dropdown utility"
```

---

## Task 3: index.html — Remove Datalists, Replace Load More with Pagination Bar

**Files:**
- Modify: `frontend/index.html`

Current audit filter bar (lines 1143–1181):
```html
            <div class="audit-filter-input-wrap">
              <svg ...></svg>
              <input class="audit-input" type="text" id="audit-filter-instance" placeholder="Instance ID or name…" list="audit-instance-datalist" autocomplete="off"/>
            </div>
            <datalist id="audit-instance-datalist"></datalist>
            <div class="audit-filter-input-wrap">
              <svg ...></svg>
              <input class="audit-input" type="text" id="audit-filter-user" list="audit-user-list" placeholder="User email…"/>
            </div>
            <datalist id="audit-user-list"></datalist>
            ...
          <div class="audit-more-row">
            <button class="btn-load-more" id="btn-audit-more" style="display:none">Load more</button>
          </div>
```

- [ ] **Step 1: Remove `list="audit-instance-datalist"` from the Instance input (line ~1145)**

Change:
```html
              <input class="audit-input" type="text" id="audit-filter-instance" placeholder="Instance ID or name…" list="audit-instance-datalist" autocomplete="off"/>
```
To:
```html
              <input class="audit-input" type="text" id="audit-filter-instance" placeholder="Instance ID or name…" autocomplete="off"/>
```

- [ ] **Step 2: Delete the `<datalist id="audit-instance-datalist">` line (line ~1147)**

Delete this entire line:
```html
            <datalist id="audit-instance-datalist"></datalist>
```

- [ ] **Step 3: Remove `list="audit-user-list"` from the User Email input (line ~1150)**

Change:
```html
              <input class="audit-input" type="text" id="audit-filter-user" list="audit-user-list" placeholder="User email…"/>
```
To:
```html
              <input class="audit-input" type="text" id="audit-filter-user" placeholder="User email…"/>
```

- [ ] **Step 4: Delete the `<datalist id="audit-user-list">` line (line ~1152)**

Delete this entire line:
```html
            <datalist id="audit-user-list"></datalist>
```

- [ ] **Step 5: Replace the Load More div with the pagination bar (lines ~1179–1181)**

Change:
```html
          <div class="audit-more-row">
            <button class="btn-load-more" id="btn-audit-more" style="display:none">Load more</button>
          </div>
```
To:
```html
          <div class="audit-pg-row">
            <button class="btn-pg" id="btn-audit-prev" disabled>&#8592; Prev</button>
            <span class="pg-info" id="audit-pg-info">Page 1 of 1 &middot; 0 loaded</span>
            <button class="btn-pg" id="btn-audit-next" disabled>Next &#8594;</button>
          </div>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html
git commit -m "feat(audit): replace datalists and load-more with custom combobox markup and pagination bar"
```

---

## Task 4: audit.js — Pagination Refactor + Combobox Integration

**Files:**
- Modify: `frontend/js/audit.js`

- [ ] **Step 1: Add three new state variables after `var _auditUsers = [];` (line ~29)**

After:
```js
  var _auditUsers = [];
```
Add:
```js
  var _allEvents  = [];   // accumulates all fetched records across server pages
  var _auditPage  = 0;    // current display page (0-based)
  var PAGE_SIZE   = 10;
```

- [ ] **Step 2: Replace the entire `loadEvents` function (lines ~46–125)**

Replace the old `async function loadEvents(reset) { ... }` with:

```js
  async function loadEvents(reset) {
    if (isLoading) return;
    if (reset) { _allEvents = []; _auditPage = 0; lastKey = null; }

    var rawInstance    = document.getElementById('audit-filter-instance').value.trim();
    var instanceFilter = _resolveInstanceId(rawInstance);
    var userFilter     = document.getElementById('audit-filter-user').value.trim();
    var actionFilter   = document.getElementById('audit-filter-action').value;
    var accountFilter  = document.getElementById('audit-filter-account').value;

    var tbody = document.getElementById('audit-events-tbody');
    if (reset) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="audit-loading">Loading events\u2026</td></tr>';
    }

    isLoading = true;
    _updatePaginationBar();

    try {
      var res = await API.getAuditLog({
        instanceId: instanceFilter || undefined,
        userEmail:  userFilter     || undefined,
        action:     actionFilter   || undefined,
        accountId:  accountFilter  || undefined,
        limit:      50,
        lastKey:    lastKey,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      var items = data.items || [];
      lastKey = data.lastKey || null;

      items.forEach(function (item) {
        if (item.accountId) knownAccounts[item.accountId] = item.accountName || item.accountId;
      });

      _allEvents = _allEvents.concat(items);

      if (reset && _allEvents.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="7" class="audit-empty">' +
          'No audit events found. Start or stop an instance to create entries.' +
          '</td></tr>';
        _updatePaginationBar();
      } else {
        _renderAuditPage();
      }

      populateAccountDropdown();

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        if (reset) {
          tbody.innerHTML =
            '<tr><td colspan="7" class="audit-empty">Error: ' +
            escHtml(err.message) + '</td></tr>';
        }
        App.showToast('Audit load failed: ' + err.message, 'err');
      }
    } finally {
      isLoading = false;
      _updatePaginationBar();
    }
  }
```

- [ ] **Step 3: Add `_renderAuditPage` and `_updatePaginationBar` immediately after `loadEvents`**

```js
  function _renderAuditPage() {
    var totalPages = Math.max(1, Math.ceil(_allEvents.length / PAGE_SIZE));
    _auditPage = Math.min(_auditPage, totalPages - 1);  // clamp after filter resets

    var start = _auditPage * PAGE_SIZE;
    var rows  = _allEvents.slice(start, start + PAGE_SIZE);

    var tbody = document.getElementById('audit-events-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    rows.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML = buildEventRow(item);
      tbody.appendChild(tr);
    });

    var countEl = document.getElementById('audit-record-count');
    if (countEl) countEl.textContent = _allEvents.length + ' loaded';

    _updatePaginationBar();
  }

  function _updatePaginationBar() {
    var prevBtn = document.getElementById('btn-audit-prev');
    var nextBtn = document.getElementById('btn-audit-next');
    var pgInfo  = document.getElementById('audit-pg-info');
    if (!prevBtn || !nextBtn || !pgInfo) return;

    var totalPages = Math.max(1, Math.ceil(_allEvents.length / PAGE_SIZE));
    // Clamp _auditPage — guards against "Page 6 of 5" if a next-page fetch fails
    // after _auditPage was already incremented in the Next button handler
    _auditPage = Math.min(_auditPage, totalPages - 1);
    var onLastPage = _auditPage >= totalPages - 1;

    prevBtn.disabled = _auditPage === 0 || isLoading;
    nextBtn.disabled = (onLastPage && !lastKey) || isLoading;
    pgInfo.textContent = 'Page ' + (_auditPage + 1) + ' of ' + totalPages +
      ' \u00b7 ' + _allEvents.length + ' loaded';
  }
```

- [ ] **Step 4: Remove `_populateInstanceDatalist` and simplify its callers**

Delete the entire `_populateInstanceDatalist` function (it populated the now-removed `<datalist>`).

Find `_seedAccountsFromInstances` — its entire body currently calls `_populateInstanceDatalist`. Replace the body:

```js
  function _seedAccountsFromInstances() {
    // Instance suggestions now served live by App.makeCombobox — no datalist to seed
  }
```

Find `onInstancesRefreshed` — same situation:

```js
  function onInstancesRefreshed() {
    // Instance combobox uses a live getter — no action needed on instance refresh
  }
```

- [ ] **Step 5: Update `_loadAuditUsers` — remove the datalist DOM update**

Find `_loadAuditUsers`. The current body ends with code that updates `#audit-user-list` datalist innerHTML. Remove that block. The function should end after populating `_auditUsers`:

```js
  async function _loadAuditUsers() {
    try {
      var res  = await API.getUsers();
      var data = await res.json();
      _auditUsers = (data.users || [])
        .filter(function (u) {
          var g = u.groups || [];
          return g.indexOf('admins') !== -1 || g.indexOf('operators') !== -1
              || g.indexOf('viewers') !== -1;
        })
        .map(function (u) { return u.email; });
    } catch (_) {
      _auditUsers = [];
    }
  }
```

*(The combobox `getOptions` closure always reads the latest `_auditUsers` — no further action needed after loading.)*

- [ ] **Step 6: Update `onTabActivated` — remove `_seedAccountsFromInstances` call**

Old:
```js
  function onTabActivated() {
    _seedAccountsFromInstances();
    if (firstLoad) {
      firstLoad = false;
      loadEvents(true);
    }
    var role = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : '';
    if (role === 'admin' && _auditUsers.length === 0) _loadAuditUsers();
  }
```

New:
```js
  function onTabActivated() {
    if (firstLoad) {
      firstLoad = false;
      loadEvents(true);
    }
    var role = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : '';
    if (role === 'admin' && _auditUsers.length === 0) _loadAuditUsers();
  }
```

- [ ] **Step 7: Replace the entire `init()` function**

Old `init()` wired the load-more button. Replace it with:

```js
  function init() {
    // Attach custom comboboxes (getOptions is a live getter — always up-to-date)
    App.makeCombobox('audit-filter-instance', function () {
      return (typeof Instances !== 'undefined' && Instances.getAll)
        ? Instances.getAll()
            .map(function (i) { return i.name || i.instanceId; })
            .filter(Boolean)
        : [];
    });
    App.makeCombobox('audit-filter-user', function () { return _auditUsers; });

    // Search button
    document.getElementById('btn-audit-search').addEventListener('click', function () {
      loadEvents(true);
    });

    // Pagination buttons
    document.getElementById('btn-audit-prev').addEventListener('click', function () {
      if (_auditPage > 0) { _auditPage--; _renderAuditPage(); }
    });

    document.getElementById('btn-audit-next').addEventListener('click', async function () {
      var totalPages = Math.max(1, Math.ceil(_allEvents.length / PAGE_SIZE));
      if (_auditPage < totalPages - 1) {
        // Next page is already in _allEvents
        _auditPage++;
        _renderAuditPage();
      } else if (lastKey) {
        // Advance page counter first, then fetch — loadEvents will call _renderAuditPage
        // at the new _auditPage after appending the next batch to _allEvents
        _auditPage++;
        await loadEvents(false);
      }
    });

    // Clear button — reset all filters then reload
    document.getElementById('btn-audit-clear').addEventListener('click', function () {
      document.getElementById('audit-filter-instance').value = '';
      document.getElementById('audit-filter-user').value     = '';
      document.getElementById('audit-filter-action').value   = '';
      document.getElementById('audit-filter-account').value  = '';
      loadEvents(true);
    });

    // Dropdowns trigger immediate search on change
    document.getElementById('audit-filter-action').addEventListener('change', function () {
      loadEvents(true);
    });
    document.getElementById('audit-filter-account').addEventListener('change', function () {
      loadEvents(true);
    });

    // Text inputs: debounced 350ms search + Enter for instant search
    ['audit-filter-instance', 'audit-filter-user'].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener('input', function () {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(function () { loadEvents(true); }, 350);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { clearTimeout(_debounceTimer); loadEvents(true); }
      });
    });
  }
```

- [ ] **Step 8: Verify no stale references to removed elements**

```bash
grep -n "btn-audit-more\|audit-instance-datalist\|audit-user-list\|_populateInstanceDatalist" frontend/js/audit.js
```
Expected: no output. If any remain, remove them.

- [ ] **Step 9: Commit**

```bash
git add frontend/js/audit.js
git commit -m "feat(audit): replace load-more with accumulation pagination and custom combobox"
```

---

## Task 5: labs.js — Bug Fix + Combobox + Pagination

**Files:**
- Modify: `frontend/js/labs.js`

- [ ] **Step 1: Fix `callerEmail` → `userEmail` in `_passesLabFilter` (line ~374)**

Change:
```js
    if (_labFilters.submittedBy && !(lab.callerEmail || '').toLowerCase().includes(_labFilters.submittedBy.toLowerCase())) return false;
```
To:
```js
    if (_labFilters.submittedBy && !(lab.userEmail || '').toLowerCase().includes(_labFilters.submittedBy.toLowerCase())) return false;
```

- [ ] **Step 2: Add `_labsPage` and `LAB_PAGE_SIZE` state variables after `var _labsUsers = [];` (line ~27)**

After:
```js
  var _labsUsers    = [];
```
Add:
```js
  var _labsPage     = 0;    // current page in the labs list (0-based)
  var LAB_PAGE_SIZE = 10;
```

- [ ] **Step 3: Reset `_labsPage = 0` in `_setLabFilter` (line ~378)**

Old:
```js
  function _setLabFilter(field, value) {
    _labFilters[field] = value;
    _expandedLabId = null;
    _renderLabsList();
  }
```
New:
```js
  function _setLabFilter(field, value) {
    _labFilters[field] = value;
    _expandedLabId = null;
    _labsPage = 0;
    _renderLabsList();
  }
```

- [ ] **Step 4: Reset `_labsPage = 0` in `_clearLabFilters` (line ~384)**

Old:
```js
  function _clearLabFilters() {
    _labFilters = { platform: '', serverType: '', status: '', account: '', region: '', submittedBy: '' };
    _expandedLabId = null;
    _renderLabsList();
  }
```
New:
```js
  function _clearLabFilters() {
    _labFilters = { platform: '', serverType: '', status: '', account: '', region: '', submittedBy: '' };
    _expandedLabId = null;
    _labsPage = 0;
    _renderLabsList();
  }
```

- [ ] **Step 5: Add `_labsPageNav` function immediately after `_clearLabFilters`**

```js
  function _labsPageNav(delta) {
    var visible    = activeLabs.filter(_passesLabFilter);
    var totalPages = Math.max(1, Math.ceil(visible.length / LAB_PAGE_SIZE));
    _labsPage = Math.max(0, Math.min(totalPages - 1, _labsPage + delta));
    _renderLabsList();
  }
```

- [ ] **Step 6: Add pagination to `_renderLabsList` — replace the filter+render block (lines ~301–330)**

Find the section starting `// ── Filter bar + filtered rows` and ending with the second `listEl.innerHTML = html; _restoreFocus(...)`. Replace it entirely with:

```js
    // ── Filter bar + filtered rows
    var visible    = activeLabs.filter(_passesLabFilter);
    var totalPages = Math.max(1, Math.ceil(visible.length / LAB_PAGE_SIZE));
    _labsPage      = Math.min(_labsPage, totalPages - 1);  // clamp when filters narrow results
    var pageItems  = visible.slice(_labsPage * LAB_PAGE_SIZE, (_labsPage + 1) * LAB_PAGE_SIZE);

    var html = statsHtml + guideHtml + _renderFilterBar();

    if (visible.length === 0) {
      html += '<div class="lbs-empty">No servers match the current filters.' +
        (cntAll > 0
          ? ' <button class="btn-audit-clear" onclick="Labs._clearLabFilters()">Clear filters</button>'
          : '') +
        '</div>';
      listEl.innerHTML = html;
      if (typeof Auth !== 'undefined' && Auth.getRole && Auth.getRole() === 'admin') {
        App.makeCombobox('lbs-filter-submittedby', function () { return _labsUsers; });
      }
      _restoreFocus(_focusId, _selStart, _selEnd);
      return;
    }

    html += '<table class="lbs-tbl">';
    html += '<thead class="lbs-tbl-head"><tr>';
    html += '<th></th>';
    html += '<th>Server Name</th>';
    html += '<th>Platform</th>';
    html += '<th>Server Type</th>';
    html += '<th>Status</th>';
    html += '<th>Account</th>';
    html += '<th>Region</th>';
    html += '<th>Expires</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    pageItems.forEach(function (lab) { html += _renderRow(lab); });
    html += '</tbody></table>';

    if (visible.length > LAB_PAGE_SIZE) {
      html += '<div class="audit-pg-row">' +
        '<button class="btn-pg"' + (_labsPage === 0 ? ' disabled' : '') +
          ' onclick="Labs._labsPageNav(-1)">&#8592; Prev</button>' +
        '<span class="pg-info">Page ' + (_labsPage + 1) + ' of ' + totalPages +
          ' &middot; ' + visible.length + ' servers</span>' +
        '<button class="btn-pg"' + (_labsPage >= totalPages - 1 ? ' disabled' : '') +
          ' onclick="Labs._labsPageNav(1)">Next &#8594;</button>' +
        '</div>';
    }

    listEl.innerHTML = html;
    // Attach combobox BEFORE restoreFocus so the dropdown is ready when focus returns
    if (typeof Auth !== 'undefined' && Auth.getRole && Auth.getRole() === 'admin') {
      App.makeCombobox('lbs-filter-submittedby', function () { return _labsUsers; });
    }
    _restoreFocus(_focusId, _selStart, _selEnd);
```

- [ ] **Step 7: Remove `list=` attribute and `<datalist>` from `_renderFilterBar`**

Find the Submitted By section in `_renderFilterBar` (line ~437). The current HTML string for the input contains `list="lbs-sb-list"` and is followed by a `<datalist>` string.

Old:
```js
        ? '<div class="audit-filter-input-wrap">' +
            '<svg class="audit-filter-icon" viewBox="0 0 24 24" width="14" height="14">' +
              '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' +
            '</svg>' +
            '<input class="audit-input" id="lbs-filter-submittedby" type="text" list="lbs-sb-list"' +
              ' placeholder="Submitted by\u2026"' +
              ' value="' + _esc(_labFilters.submittedBy) + '"' +
              ' oninput="Labs._setLabFilter(\'submittedBy\',this.value)"/>' +
          '</div>' +
          '<datalist id="lbs-sb-list">' +
            _labsUsers.map(function(e){ return '<option value="' + _esc(e) + '">'; }).join('') +
          '</datalist>'
        : '') +
```

New (remove `list=` and the entire `<datalist>` concat):
```js
        ? '<div class="audit-filter-input-wrap">' +
            '<svg class="audit-filter-icon" viewBox="0 0 24 24" width="14" height="14">' +
              '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' +
            '</svg>' +
            '<input class="audit-input" id="lbs-filter-submittedby" type="text"' +
              ' placeholder="Submitted by\u2026"' +
              ' value="' + _esc(_labFilters.submittedBy) + '"' +
              ' oninput="Labs._setLabFilter(\'submittedBy\',this.value)"/>' +
          '</div>'
        : '') +
```

- [ ] **Step 8: Expose `_labsPageNav` in the public return object**

Find the `return { ... }` block (line ~1831). Add `_labsPageNav` alongside the other exposed inline-handler functions:

```js
    _labsPageNav:        _labsPageNav,
```

Place it next to `_setLabFilter` and `_clearLabFilters` in the return object for readability.

- [ ] **Step 9: Verify no stale datalist references remain in labs.js**

```bash
grep -n "lbs-sb-list\|list=\"lbs" frontend/js/labs.js
```
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add frontend/js/labs.js
git commit -m "feat(labs): fix submittedBy filter bug, add custom combobox and 10/page pagination"
```

---

## Task 6: Push + Deploy

- [ ] **Step 1: Confirm working tree is clean**

```bash
git status
```
Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Push to origin/develop**

```bash
git push origin develop
```
Expected: `develop -> develop` — GitHub Actions will auto-deploy to the dev portal.

---

## Verification Checklist (Manual, Dev Portal)

Open `https://d1f7pmzpwdrl1i.cloudfront.net` after deploy completes (~2 min).

**Labs tab (My Servers):**
- [ ] Type "pantm8877@gmail.com" in Submitted By → matching servers now appear (bug fix)
- [ ] Click Submitted By input → styled in-page dropdown appears with operator/admin email suggestions
- [ ] Arrow keys navigate options; Enter selects; Escape closes dropdown
- [ ] Clicking outside the input closes the dropdown
- [ ] With ≤10 servers: pagination bar is hidden
- [ ] With >10 servers (add test data if needed): Prev/Next + "Page X of Y · Z servers" appear
- [ ] Changing any dropdown filter resets to page 1

**Audit Log tab:**
- [ ] Click Instance ID input → styled in-page dropdown shows instance names
- [ ] Click User Email input (as admin) → styled in-page dropdown shows user emails
- [ ] Typing in either input filters dropdown suggestions
- [ ] Records show 10 per page; "Page 1 of N · M loaded" info is accurate
- [ ] Next → advances to page 2 from already-loaded data
- [ ] Prev → goes back to page 1
- [ ] Next on last loaded page (when more exist on server) → fetches next 50, advances page
- [ ] Filter change (action dropdown, clear button) resets to page 1
