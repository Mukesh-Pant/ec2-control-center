# Design: Filter Comboboxes + Pagination
**Date:** 2026-04-02
**Branch:** develop
**Scope:** frontend/js/labs.js, frontend/js/audit.js, frontend/js/app.js, frontend/index.html, frontend/css/styles.css

---

## Problem Statement

Three bugs and one missing feature in the Labs ("My Servers") and Audit Log tabs:

1. **Submitted By filter returns 0 results** — field name mismatch: backend stores `userEmail`, frontend filters on `lab.callerEmail` (undefined).
2. **Combobox suggestions show as native browser dialog** — all three suggestion inputs use HTML `<datalist>` which renders via the browser's own unstyled UI. Needs a custom in-page styled dropdown.
3. **No pagination** — Labs renders all filtered rows at once; Audit Log uses a "Load more" cursor button. Both need 10-records-per-page Next/Previous navigation.

---

## Decisions

- **Combobox:** Shared `App.makeCombobox` utility (single implementation reused by both modules).
- **Audit pagination:** Accumulation model — fetch 50 at a time from server, accumulate in `_allEvents[]`, navigate 10/page client-side; auto-fetch next server batch when advancing past loaded data.
- **Labs pagination:** Pure client-side — all data already in `activeLabs[]`.
- **Pagination UI:** Same CSS classes (`.audit-pg-row`, `.btn-pg`, `.pg-info`) shared between both tabs.

---

## Change 1 — Bug Fix: Submitted By filter (`labs.js`)

**File:** `frontend/js/labs.js` — `_passesLabFilter` (line ~374)

```js
// Before (broken — callerEmail is always undefined):
if (_labFilters.submittedBy && !(lab.callerEmail || '').toLowerCase().includes(...))

// After (correct — matches backend field name):
if (_labFilters.submittedBy && !(lab.userEmail || '').toLowerCase().includes(...))
```

No other changes needed. The filter logic, comparison, and case-insensitive `includes()` are all correct.

---

## Change 2 — Custom Combobox Utility (`app.js`)

### API

```js
App.makeCombobox(inputId, getOptions)
// inputId    — string: DOM id of the text input
// getOptions — function() → string[]: returns current suggestion list
```

### Behavior

- **Init:** appends `<ul class="custom-cb-dropdown" id="{inputId}-cb">` as a child of `input.parentElement` (the `.audit-filter-input-wrap` div, which has `position: relative`). If a child with that id already exists (re-attach case), replaces it. **Must be inside the wrapper**, not a sibling — otherwise `position: absolute` on the dropdown won't anchor to the input.
- **Show:** on input `focus` or `input` event — calls `getOptions()`, filters by current input value (case-insensitive `includes`), renders up to 8 options. If 0 matches, shows `<li class="custom-cb-empty">No matches</li>`.
- **Hide:** on `Escape` key, on `blur` (150ms delay so clicks register), or on `document` click outside the wrapper.
- **Selection:** click or `Enter` on highlighted option → sets `input.value = option`, dispatches `new Event('input', {bubbles:true})` (so existing `oninput` handlers fire unchanged), closes dropdown.
- **Keyboard:** `ArrowDown`/`ArrowUp` move `.custom-cb-option--active`; `Enter` selects; `Escape` closes.
- **Re-attach safe:** Labs rebuilds its filter bar innerHTML on every `_renderLabsList()` call. After the rebuild, `App.makeCombobox` is called again — it finds and replaces the old dropdown div. No stale event listeners (old input element is discarded with the innerHTML replace).

### `index.html` changes

Remove `list=` attributes and `<datalist>` elements for audit inputs — no longer needed:
- `#audit-filter-instance`: remove `list="audit-instance-datalist"` + remove `<datalist id="audit-instance-datalist">`
- `#audit-filter-user`: remove `list="audit-user-list"` + remove `<datalist id="audit-user-list">`

### `labs.js` changes

- Remove `list="lbs-sb-list"` from the Submitted By input in `_renderFilterBar`
- Remove the `<datalist id="lbs-sb-list">` HTML from `_renderFilterBar`
- After `listEl.innerHTML = html` (both assignment points in `_renderLabsList`), call:
  ```js
  if (typeof Auth !== 'undefined' && Auth.getRole && Auth.getRole() === 'admin') {
    App.makeCombobox('lbs-filter-submittedby', function(){ return _labsUsers; });
  }
  ```
  (`isAdmin` is not in scope at this call site — must use `Auth.getRole()` directly.)

### `audit.js` changes

In `init()` (or `onTabActivated` after first load), after `_loadAuditUsers()` populates `_auditUsers`:
```js
App.makeCombobox('audit-filter-user',     function(){ return _auditUsers; });
App.makeCombobox('audit-filter-instance', function(){
  return (typeof Instances !== 'undefined' && Instances.getAll)
    ? Instances.getAll().map(function(i){ return i.name || i.instanceId; }).filter(Boolean)
    : [];
});
```

### New CSS (appended to `styles.css`)

```css
.custom-cb-dropdown {
  position: absolute; top: calc(100% + 2px); left: 0;
  min-width: 100%; max-height: 220px; overflow-y: auto;
  background: var(--white); border: 1.5px solid var(--bd);
  border-radius: var(--rsm); box-shadow: 0 4px 12px rgba(0,0,0,.1);
  z-index: 200; list-style: none; margin: 0; padding: 4px 0;
}
.custom-cb-option {
  padding: 7px 12px; font-size: 12.5px; color: var(--ink);
  cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.custom-cb-option:hover,
.custom-cb-option--active { background: var(--bdim); color: var(--blue); }
.custom-cb-empty {
  padding: 7px 12px; font-size: 12px; color: var(--ink4); cursor: default;
}
```

The input's parent wrapper (`.audit-filter-input-wrap`) already has `position: relative`, so the dropdown positions correctly without extra CSS.

---

## Change 3 — Audit Log Pagination

### New state variables

```js
var _allEvents = [];   // accumulates all fetched rows across server pages
var _auditPage  = 0;   // current display page (0-based)
var PAGE_SIZE   = 10;
```

### `loadEvents(reset)` changes

- If `reset === true`: `_allEvents = []; _auditPage = 0; lastKey = null;`
- Fetch from server (limit stays 50), push returned items into `_allEvents`
- After fetch: call `_renderAuditPage()` instead of building rows inline in `loadEvents`

### New `_renderAuditPage()`

```
start = _auditPage * PAGE_SIZE
end   = start + PAGE_SIZE
rows  = _allEvents.slice(start, end)
```

- Replaces `tbody` innerHTML with `rows.map(buildEventRow).join('')`
- Updates record count: `Z loaded` (where Z = `_allEvents.length`)
- Updates pagination bar state (see below)

### Pagination bar

Replaces `.audit-more-row` / `#btn-audit-more` in both HTML and JS:

```html
<div class="audit-pg-row">
  <button class="btn-pg" id="btn-audit-prev">← Prev</button>
  <span class="pg-info" id="audit-pg-info">Page 1 of 1 · 0 loaded</span>
  <button class="btn-pg" id="btn-audit-next">Next →</button>
</div>
```

**Prev button:** disabled when `_auditPage === 0`. Click: `_auditPage--; _renderAuditPage()`.

**Next button logic:**
- If `(_auditPage + 1) * PAGE_SIZE < _allEvents.length` → just `_auditPage++; _renderAuditPage()`
- Else if `lastKey` exists → `_auditPage++` first, then call `loadEvents(false)`. Since `loadEvents` appends to `_allEvents` and then calls `_renderAuditPage()`, it will render the already-incremented page once the fetch completes. Do **not** increment after the fetch — the render happens inside `loadEvents`.
- Else → disabled (no more data)

**Pg-info text:** `Page {_auditPage+1} of {Math.ceil(_allEvents.length / PAGE_SIZE)} · {_allEvents.length} loaded`

### New CSS

```css
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
.btn-pg:hover:not(:disabled) { background: var(--blue); color: #fff; }
.btn-pg:disabled { opacity: .4; cursor: default; }
.pg-info { font-size: 12px; color: var(--ink3); white-space: nowrap; }
```

---

## Change 4 — Labs Pagination

### New state variables

```js
var _labsPage    = 0;
var LAB_PAGE_SIZE = 10;
```

### `_setLabFilter` and `_clearLabFilters` changes

Both reset `_labsPage = 0` before calling `_renderLabsList()`.

### `_renderLabsList` changes

After computing `visible = activeLabs.filter(_passesLabFilter)`:

```js
var totalPages = Math.max(1, Math.ceil(visible.length / LAB_PAGE_SIZE));
_labsPage = Math.min(_labsPage, totalPages - 1);   // clamp on filter change
var pageItems = visible.slice(_labsPage * LAB_PAGE_SIZE, (_labsPage + 1) * LAB_PAGE_SIZE);
```

Render `pageItems` rows (instead of all `visible` rows).

Append pagination bar below `</table>` (only when `visible.length > LAB_PAGE_SIZE`):

```html
<div class="audit-pg-row">
  <button class="btn-pg" onclick="Labs._labsPageNav(-1)" {disabled if page=0}>← Prev</button>
  <span class="pg-info">Page {n} of {total} · {visible.length} servers</span>
  <button class="btn-pg" onclick="Labs._labsPageNav(1)" {disabled if last page}>Next →</button>
</div>
```

### New public function `_labsPageNav(delta)`

```js
function _labsPageNav(delta) {
  var visible    = activeLabs.filter(_passesLabFilter);
  var totalPages = Math.max(1, Math.ceil(visible.length / LAB_PAGE_SIZE));
  _labsPage = Math.max(0, Math.min(totalPages - 1, _labsPage + delta));
  _renderLabsList();
}
```

Exposed in the module `return {}`.

---

## Files Touched Summary

| File | Changes |
|------|---------|
| `frontend/js/app.js` | Add `App.makeCombobox(inputId, getOptions)` + expose in return object |
| `frontend/js/labs.js` | Fix `callerEmail→userEmail`; remove datalist; call `App.makeCombobox` after renders; add `_labsPage`, `_labsPageNav`, paginate `_renderLabsList` |
| `frontend/js/audit.js` | Add `_allEvents`, `_auditPage`, `_renderAuditPage`; call `App.makeCombobox` in init; replace load-more with pagination bar |
| `frontend/index.html` | Remove `list=` attrs and `<datalist>` elements from both audit filter inputs |
| `frontend/css/styles.css` | Add `.custom-cb-*`, `.audit-pg-row`, `.btn-pg`, `.pg-info` |

---

## Verification Checklist

- [ ] Labs: typing "pantm8877@gmail.com" in Submitted By shows matching servers
- [ ] Labs: typing in Submitted By shows styled in-page dropdown with operator/admin emails
- [ ] Audit: Instance ID/Name input shows styled in-page dropdown with instance suggestions
- [ ] Audit: User Email input shows styled in-page dropdown with user emails (admin only)
- [ ] Combobox: ArrowDown/ArrowUp/Enter/Escape keyboard navigation works
- [ ] Combobox: clicking outside closes the dropdown
- [ ] Audit: 10 records shown per page; Next/Previous buttons navigate correctly
- [ ] Audit: advancing past loaded records auto-fetches next batch from server
- [ ] Labs: 10 servers shown per page; filter changes reset to page 1
- [ ] Pagination bar hidden when total results ≤ 10
