'use strict';

/* ═══════════════════════════════════════════════════
   Customers — clients who pay us
   IIFE → Customers global
   ═══════════════════════════════════════════════════ */

const Customers = (function () {

  // ─── Seed data ────────────────────────────────────────────────────────
  var SEED = [
    {
      id:'c1', name:'Cloudmandap', country:'Nepal',
      contactName:'Ramesh Shrestha', contactEmail:'ramesh@cloudmandap.com', contactPhone:'+977-1-4567890',
      services:['Billing Management','Software Development'],
      currency:'USD', contractValue:12000, amountPaid:6000,
      nextDueDate:'2026-04-01', paymentForm:'Bank Transfer',
      agreementStart:'2025-07-01', agreementEnd:'2026-06-30',
      billingType:'recurring', billingFrequency:'monthly',
      notes:'Monthly EC2 billing management + custom portal',
      milestones:[],
      invoices:[
        {id:'inv-c1-1',issueDate:'2025-07-01',amount:1000,status:'paid',paidDate:'2025-07-05',notes:''},
        {id:'inv-c1-2',issueDate:'2025-08-01',amount:1000,status:'paid',paidDate:'2025-08-03',notes:''},
        {id:'inv-c1-3',issueDate:'2025-09-01',amount:1000,status:'paid',paidDate:'2025-09-04',notes:''},
        {id:'inv-c1-4',issueDate:'2025-10-01',amount:1000,status:'paid',paidDate:'2025-10-02',notes:''},
        {id:'inv-c1-5',issueDate:'2025-11-01',amount:1000,status:'paid',paidDate:'2025-11-06',notes:''},
        {id:'inv-c1-6',issueDate:'2025-12-01',amount:1000,status:'paid',paidDate:'2025-12-03',notes:''},
      ],
      payments:[
        {id:'pay-c1-1',date:'2025-07-05',amount:1000,notes:''},
        {id:'pay-c1-2',date:'2025-08-03',amount:1000,notes:''},
        {id:'pay-c1-3',date:'2025-09-04',amount:1000,notes:''},
        {id:'pay-c1-4',date:'2025-10-02',amount:1000,notes:''},
        {id:'pay-c1-5',date:'2025-11-06',amount:1000,notes:''},
        {id:'pay-c1-6',date:'2025-12-03',amount:1000,notes:''},
      ],
      signedBy:'Adarsh', accountManager:'Adarsh',
      contracts:[
        {id:'ctr-c1-1',name:'EC2 Control Portal License',description:'Annual SaaS portal license',startDate:'2025-07-01',endDate:'2026-06-30',value:12000,status:'active',tasks:[
          {id:'tsk-c1-1',name:'Monthly billing report',assignee:'Adarsh',dueDate:'2026-04-30',status:'in_progress',priority:'medium'},
          {id:'tsk-c1-2',name:'Q2 portal update',assignee:'Adarsh',dueDate:'2026-06-30',status:'todo',priority:'low'},
        ]},
      ],
      createdAt:'2025-07-01T00:00:00Z',
    },
    {
      id:'c2', name:'NRNGVL', country:'Nepal',
      contactName:'Bikash Gurung', contactEmail:'bikash@nrngvl.com', contactPhone:'+977-9801234567',
      services:['Domain Management','Consulting'],
      currency:'USD', contractValue:2400, amountPaid:1800,
      nextDueDate:'2026-03-28', paymentForm:'eSewa',
      agreementStart:'2025-04-01', agreementEnd:'2026-03-31',
      billingType:'retainer', billingFrequency:'monthly',
      notes:'Domain + DNS management retainer',
      signedBy:'Adarsh', accountManager:'Adarsh',
      milestones:[],
      invoices:[],
      payments:[
        {id:'pay-c2-1',date:'2025-04-05',amount:200,notes:''},
        {id:'pay-c2-2',date:'2025-05-03',amount:200,notes:''},
        {id:'pay-c2-3',date:'2025-06-04',amount:200,notes:''},
        {id:'pay-c2-4',date:'2025-07-02',amount:200,notes:''},
        {id:'pay-c2-5',date:'2025-08-05',amount:200,notes:''},
        {id:'pay-c2-6',date:'2025-09-03',amount:200,notes:''},
        {id:'pay-c2-7',date:'2025-10-04',amount:200,notes:''},
        {id:'pay-c2-8',date:'2025-11-06',amount:200,notes:''},
        {id:'pay-c2-9',date:'2025-12-04',amount:200,notes:''},
      ],
      contracts:[
        {id:'ctr-c2-1',name:'Domain & DNS Management',description:'Monthly domain registrations and DNS configuration',startDate:'2025-04-01',endDate:'2026-03-31',value:2400,status:'active',tasks:[
          {id:'tsk-c2-1',name:'Renew primary domain',assignee:'Adarsh',dueDate:'2026-03-25',status:'todo',priority:'high'},
        ]},
      ],
      createdAt:'2025-04-01T00:00:00Z',
    },
    {
      id:'c3', name:'Cleaffo', country:'India',
      contactName:'Priya Nair', contactEmail:'priya@cleaffo.io', contactPhone:'+91-9812345678',
      services:['Software Development'],
      currency:'USD', contractValue:15000, amountPaid:9000,
      nextDueDate:'2026-04-15', paymentForm:'SWIFT Transfer',
      agreementStart:'2025-10-01', agreementEnd:'2026-09-30',
      billingType:'milestone', billingFrequency:null,
      notes:'Custom SaaS platform development — 5 milestone project',
      signedBy:'Adarsh', accountManager:'Adarsh',
      milestones:[
        {id:'ms-c3-1',name:'Phase 1 \u2014 Requirements & Design',amount:3000,dueDate:'2025-11-30',paid:true, paidDate:'2025-11-28'},
        {id:'ms-c3-2',name:'Phase 2 \u2014 Backend Development',  amount:3000,dueDate:'2026-01-31',paid:true, paidDate:'2026-01-30'},
        {id:'ms-c3-3',name:'Phase 3 \u2014 Frontend Development', amount:3000,dueDate:'2026-03-15',paid:true, paidDate:'2026-03-12'},
        {id:'ms-c3-4',name:'Phase 4 \u2014 Testing & QA',         amount:3000,dueDate:'2026-04-15',paid:false,paidDate:null},
        {id:'ms-c3-5',name:'Phase 5 \u2014 Launch & Handover',    amount:3000,dueDate:'2026-05-31',paid:false,paidDate:null},
      ],
      invoices:[],
      payments:[
        {id:'pay-c3-1',date:'2025-11-28',amount:3000,notes:'Phase 1'},
        {id:'pay-c3-2',date:'2026-01-30',amount:3000,notes:'Phase 2'},
        {id:'pay-c3-3',date:'2026-03-12',amount:3000,notes:'Phase 3'},
      ],
      contracts:[
        {id:'ctr-c3-1',name:'SaaS Platform Development',description:'Full-stack development — 5 milestone delivery plan',startDate:'2025-10-01',endDate:'2026-05-31',value:15000,status:'active',tasks:[
          {id:'tsk-c3-1',name:'Phase 4 — Testing & QA',assignee:'Adarsh',dueDate:'2026-04-15',status:'todo',priority:'high'},
          {id:'tsk-c3-2',name:'Phase 5 — Launch & Handover',assignee:'Adarsh',dueDate:'2026-05-31',status:'todo',priority:'medium'},
          {id:'tsk-c3-3',name:'Deploy staging environment',assignee:'Adarsh',dueDate:'2026-04-01',status:'in_progress',priority:'high'},
        ]},
      ],
      createdAt:'2025-10-01T00:00:00Z',
    },
    {
      id:'c4', name:'Hajurbuwa', country:'Nepal',
      contactName:'Suresh Pradhan', contactEmail:'suresh@hajurbuwa.com', contactPhone:'+977-9851234567',
      services:['Billing Management','Consulting'],
      currency:'NPR', contractValue:600000, amountPaid:200000,
      nextDueDate:'2026-02-28', paymentForm:'Fonepay',
      agreementStart:'2025-11-01', agreementEnd:'2026-10-31',
      billingType:'recurring', billingFrequency:'monthly',
      notes:'Monthly billing consultation + cloud advisory',
      signedBy:'Adarsh', accountManager:'Adarsh',
      milestones:[],
      invoices:[],
      payments:[
        {id:'pay-c4-1',date:'2025-11-05',amount:50000,notes:''},
        {id:'pay-c4-2',date:'2025-12-04',amount:50000,notes:''},
        {id:'pay-c4-3',date:'2026-01-06',amount:50000,notes:''},
        {id:'pay-c4-4',date:'2026-02-03',amount:50000,notes:''},
      ],
      contracts:[
        {id:'ctr-c4-1',name:'Cloud Consulting Retainer',description:'Monthly cloud billing consultation and advisory',startDate:'2025-11-01',endDate:'2026-10-31',value:600000,status:'active',tasks:[
          {id:'tsk-c4-1',name:'Send overdue invoice reminder',assignee:'Adarsh',dueDate:'2026-04-05',status:'todo',priority:'high'},
        ]},
      ],
      createdAt:'2025-11-01T00:00:00Z',
    },
  ];

  // ─── Data layer ───────────────────────────────────────────────────────
  var STORAGE_KEY = 'ec2ctrl_customers';
  var _data = null;

  function _loadData() {
    if (_data) return;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      _data = raw ? JSON.parse(raw) : null;
    } catch (e) { _data = null; }
    if (!Array.isArray(_data) || !_data.length) {
      _data = JSON.parse(JSON.stringify(SEED));
      _persist();
    }
  }

  function _persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); }

  function _uuid(prefix) { return (prefix || 'x') + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8); }

  // ─── CRUD (public) ────────────────────────────────────────────────────

  function getAll() {
    _loadData();
    return _data.map(_hydrate);
  }

  function getById(id) {
    _loadData();
    var c = _data.find(function (x) { return x.id === id; });
    return c ? _hydrate(c) : null;
  }

  // Adds computed fields (amountDue, paymentStatus) without mutating stored data
  function _hydrate(c) {
    var amountDue = Math.max(0, c.contractValue - c.amountPaid);
    return Object.assign({}, c, {
      amountDue:     amountDue,
      paymentStatus: computePaymentStatus(c),
    });
  }

  function _addCustomer(fields) {
    var c = Object.assign({ id: _uuid('c'), milestones: [], invoices: [], payments: [], contracts: [], createdAt: new Date().toISOString() }, fields);
    _data.push(c);
    _persist();
    return c;
  }

  function _updateCustomer(id, fields) {
    var idx = _data.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return null;
    _data[idx] = Object.assign({}, _data[idx], fields);
    _persist();
    return _data[idx];
  }

  function _removeCustomer(id) {
    _data = _data.filter(function (x) { return x.id !== id; });
    _persist();
  }

  // ─── Payment status (public — used by FinNotifications) ───────────────

  function computePaymentStatus(c) {
    if (c.amountPaid >= c.contractValue) return 'paid';
    if (c.billingType === 'upfront' && c.amountPaid === 0) return 'upfront_pending';
    if (!c.nextDueDate) return c.amountPaid > 0 ? 'partial' : 'pending';
    var daysLeft = Math.ceil((new Date(c.nextDueDate) - new Date()) / 86400000);
    var warn = FinSettings.get().paymentWarningDays;
    if (daysLeft < 0)    return 'overdue';
    if (daysLeft <= warn) return 'due';
    return c.amountPaid > 0 ? 'partial' : 'pending';
  }

  // ─── Payment recording ────────────────────────────────────────────────

  function recordPayment(customerId, amount, date, notes) {
    var idx = _data.findIndex(function (x) { return x.id === customerId; });
    if (idx < 0) return;
    var pay = { id: _uuid('pay'), date: date, amount: amount, notes: notes || '' };
    _data[idx].payments = (_data[idx].payments || []).concat(pay);
    // Recompute amountPaid from payments sum
    _data[idx].amountPaid = _data[idx].payments.reduce(function (s, p) { return s + p.amount; }, 0);
    _persist();
  }

  // ─── Milestone mark-paid ──────────────────────────────────────────────

  function markMilestonePaid(customerId, milestoneId) {
    var idx = _data.findIndex(function (x) { return x.id === customerId; });
    if (idx < 0) return;
    var ms = (_data[idx].milestones || []).find(function (m) { return m.id === milestoneId; });
    if (!ms || ms.paid) return;
    ms.paid = true;
    ms.paidDate = new Date().toISOString().slice(0, 10);
    // Auto-record a payment for the milestone amount
    var pay = { id: _uuid('pay'), date: ms.paidDate, amount: ms.amount, notes: 'Milestone: ' + ms.name };
    _data[idx].payments = (_data[idx].payments || []).concat(pay);
    _data[idx].amountPaid = _data[idx].payments.reduce(function (s, p) { return s + p.amount; }, 0);
    _persist();
  }

  // ─── Invoice management ───────────────────────────────────────────────

  function addInvoice(customerId, fields) {
    var idx = _data.findIndex(function (x) { return x.id === customerId; });
    if (idx < 0) return;
    var inv = Object.assign({ id: _uuid('inv'), status: 'draft', paidDate: null, notes: '' }, fields);
    _data[idx].invoices = (_data[idx].invoices || []).concat(inv);
    _persist();
    return inv;
  }

  function updateInvoiceStatus(customerId, invoiceId, newStatus) {
    var idx = _data.findIndex(function (x) { return x.id === customerId; });
    if (idx < 0) return;
    var inv = (_data[idx].invoices || []).find(function (i) { return i.id === invoiceId; });
    if (!inv) return;
    inv.status = newStatus;
    if (newStatus === 'paid') {
      inv.paidDate = new Date().toISOString().slice(0, 10);
      // Auto-record payment
      var pay = { id: _uuid('pay'), date: inv.paidDate, amount: inv.amount, notes: 'Invoice paid' };
      _data[idx].payments = (_data[idx].payments || []).concat(pay);
      _data[idx].amountPaid = _data[idx].payments.reduce(function (s, p) { return s + p.amount; }, 0);
    }
    _persist();
  }

  // ─── Contract management ──────────────────────────────────────────────

  function addContract(customerId, fields) {
    var idx = _data.findIndex(function (x) { return x.id === customerId; });
    if (idx < 0) return;
    var ctr = Object.assign({ id: _uuid('ctr'), status: 'active' }, fields);
    _data[idx].contracts = (_data[idx].contracts || []).concat(ctr);
    _persist();
    return ctr;
  }

  function updateContractStatus(customerId, contractId, newStatus) {
    var idx = _data.findIndex(function (x) { return x.id === customerId; });
    if (idx < 0) return;
    var ctr = (_data[idx].contracts || []).find(function (c) { return c.id === contractId; });
    if (ctr) { ctr.status = newStatus; _persist(); }
  }

  // ─── Milestone management ─────────────────────────────────────────────

  function addMilestone(customerId, fields) {
    var idx = _data.findIndex(function (x) { return x.id === customerId; });
    if (idx < 0) return;
    var ms = Object.assign({ id: _uuid('ms'), paid: false, paidDate: null }, fields);
    _data[idx].milestones = (_data[idx].milestones || []).concat(ms);
    _persist();
    return ms;
  }

  // ─── Task CRUD ────────────────────────────────────────────────────────

  function addTask(customerId, contractId, fields) {
    var ci = _data.findIndex(function (x) { return x.id === customerId; });
    if (ci < 0) return;
    var ctr = (_data[ci].contracts || []).find(function (c) { return c.id === contractId; });
    if (!ctr) return;
    if (!ctr.tasks) ctr.tasks = [];
    ctr.tasks.push(Object.assign({ id: _uuid('tsk'), status: 'todo', priority: 'medium' }, fields));
    _persist();
  }

  function updateTaskStatus(customerId, contractId, taskId, status) {
    var ci = _data.findIndex(function (x) { return x.id === customerId; });
    if (ci < 0) return;
    var ctr = (_data[ci].contracts || []).find(function (c) { return c.id === contractId; });
    if (!ctr) return;
    var t = (ctr.tasks || []).find(function (t) { return t.id === taskId; });
    if (t) { t.status = status; _persist(); }
  }

  function removeTask(customerId, contractId, taskId) {
    var ci = _data.findIndex(function (x) { return x.id === customerId; });
    if (ci < 0) return;
    var ctr = (_data[ci].contracts || []).find(function (c) { return c.id === contractId; });
    if (!ctr) return;
    ctr.tasks = (ctr.tasks || []).filter(function (t) { return t.id !== taskId; });
    _persist();
  }

  // ─── UI state ─────────────────────────────────────────────────────────
  var _drawerCustId = null;
  var _search       = '';
  var _fStatus      = 'all';
  var _fBilling     = 'all';
  var _fCurrency    = 'all';
  var _editId       = null;

  // inline-add form state within drawer
  var _drawerAddPayOpen    = false;
  var _drawerAddInvOpen    = false;
  var _drawerAddMsOpen     = false;
  var _drawerAddCtrOpen    = false;
  var _drawerTaskFormOpen  = {};  // contractId → bool

  // ─── Helpers ──────────────────────────────────────────────────────────

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function _fmtDate(s) {
    if (!s) return '\u2014';
    var d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function _setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(val == null ? '\u2014' : val);
  }

  function _setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = (val == null ? '' : val);
  }

  function _getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // ─── Init / Tab ───────────────────────────────────────────────────────

  function init() { _loadData(); }

  function onTabActivated() { _render(); }

  // ─── Render ───────────────────────────────────────────────────────────

  function _render() {
    _renderStats();
    _renderTable();
  }

  function _renderStats() {
    var all      = getAll();
    var active   = all.filter(function (c) { return c.paymentStatus !== 'paid'; });
    var overdue  = all.filter(function (c) { return c.paymentStatus === 'overdue'; });
    var totalRec = all.reduce(function (s, c) { return s + FinSettings.toNpr(c.contractValue, c.currency); }, 0);
    var totalDue = all.reduce(function (s, c) { return s + FinSettings.toNpr(c.amountDue,     c.currency); }, 0);

    _setEl('cust-stat-receivable', 'NPR\u00a0' + Math.round(totalRec).toLocaleString('en-IN'));
    _setEl('cust-stat-outstanding','NPR\u00a0' + Math.round(totalDue).toLocaleString('en-IN'));
    _setEl('cust-stat-overdue',    overdue.length);
    _setEl('cust-stat-active',     active.length);
  }

  var STATUS_BADGE = {
    paid:            ['fm-badge--green',  'Paid'],
    overdue:         ['fm-badge--red',    'Overdue'],
    due:             ['fm-badge--amber',  'Due Soon'],
    partial:         ['fm-badge--blue',   'Partial'],
    upfront_pending: ['fm-badge--amber',  'Upfront Pending'],
    pending:         ['fm-badge--gray',   'Pending'],
  };

  function _payBadge(status) {
    var b = STATUS_BADGE[status] || ['fm-badge--gray', status];
    return '<span class="fm-badge ' + b[0] + '">' + b[1] + '</span>';
  }

  function _dueAmtClass(c) {
    if (c.paymentStatus === 'overdue') return 'fm-amt--red';
    if (c.paymentStatus === 'due')     return 'fm-amt--amber';
    if (c.paymentStatus === 'paid')    return 'fm-amt--green';
    return '';
  }

  function _getFiltered() {
    var q = _search.toLowerCase();
    return getAll().filter(function (c) {
      if (q && c.name.toLowerCase().indexOf(q) < 0 && c.country.toLowerCase().indexOf(q) < 0) return false;
      if (_fStatus   !== 'all' && c.paymentStatus !== _fStatus)   return false;
      if (_fBilling  !== 'all' && c.billingType   !== _fBilling)  return false;
      if (_fCurrency !== 'all' && c.currency      !== _fCurrency) return false;
      return true;
    });
  }

  function _renderTable() {
    var tbody = document.getElementById('cust-tbody');
    if (!tbody) return;
    var list = _getFiltered();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="fm-empty-cell"><div class="empty"><div class="empty-ico">\uD83E\uDDD1\u200D\uD83D\uDCBC</div><p class="empty-t">No customers found</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(_custRowHtml).join('');
  }

  function _custRowHtml(c) {
    var rowCls = c.paymentStatus === 'overdue' ? 'fm-row--red' : '';
    var svcs   = (c.services || []).slice(0, 2).map(function (s) { return '<span class="fm-svc-chip">' + _esc(s) + '</span>'; }).join('');
    if (c.services && c.services.length > 2) svcs += '<span class="fm-svc-chip more">+' + (c.services.length - 2) + '</span>';
    var dueAmt = FinSettings.fmtAmt(c.amountDue, c.currency);
    var dueDate = c.nextDueDate ? _fmtDate(c.nextDueDate) : '\u2014';

    return '<tr class="fm-row ' + rowCls + ' cust-row" onclick="Customers.openDrawer(\'' + _esc(c.id) + '\')">' +
      '<td><span class="fm-name">' + _esc(c.name) + '</span><span class="fm-country">' + _esc(c.country) + '</span></td>' +
      '<td><div class="fm-svcs">' + svcs + '</div></td>' +
      '<td class="fm-cell-amt">' + FinSettings.fmtWithNpr(c.contractValue, c.currency) + '</td>' +
      '<td class="fm-cell-amt">' + FinSettings.fmtAmt(c.amountPaid, c.currency) + '</td>' +
      '<td class="fm-cell-amt ' + _dueAmtClass(c) + '">' + dueAmt + '</td>' +
      '<td>' + _payBadge(c.paymentStatus) + '</td>' +
      '<td>' + dueDate + '</td>' +
      '<td>' + _esc(c.billingType.charAt(0).toUpperCase() + c.billingType.slice(1)) + '</td>' +
      '<td class="fm-cell-actions" onclick="event.stopPropagation()">' +
        '<button class="btn btn-xs btn-out" onclick="Customers.openEditModal(\'' + _esc(c.id) + '\')">Edit</button>' +
        '<button class="btn btn-xs btn-out fm-btn-del" onclick="Customers.confirmDelete(\'' + _esc(c.id) + '\')">Delete</button>' +
      '</td>' +
    '</tr>';
  }

  // ─── Filters ──────────────────────────────────────────────────────────

  function onSearch(val)           { _search    = val; _renderTable(); }
  function onFilterStatus(val)     { _fStatus   = val; _renderTable(); }
  function onFilterBillingType(val){ _fBilling  = val; _renderTable(); }
  function onFilterCurrency(val)   { _fCurrency = val; _renderTable(); }

  // ─── Customer Drawer ──────────────────────────────────────────────────

  function openDrawer(id) {
    var c = getById(id);
    if (!c) return;
    _drawerCustId    = id;
    _drawerAddPayOpen = false;
    _drawerAddInvOpen = false;
    _drawerAddMsOpen  = false;
    _drawerAddCtrOpen = false;
    _renderDrawer(c);
    document.getElementById('cust-drawer').classList.add('open');
    document.getElementById('cust-drawer-backdrop').classList.add('open');
  }

  function closeDrawer() {
    _drawerCustId = null;
    document.getElementById('cust-drawer').classList.remove('open');
    document.getElementById('cust-drawer-backdrop').classList.remove('open');
  }

  function _renderDrawer(c) {
    var wrap = document.getElementById('cust-drawer-body');
    if (!wrap) return;
    wrap.innerHTML = _drawerHtml(c);
  }

  function _drawerHtml(c) {
    var pct = c.contractValue > 0 ? Math.min(100, Math.round(c.amountPaid / c.contractValue * 100)) : 0;
    var contractsDue = Math.ceil((new Date(c.agreementEnd) - new Date()) / 86400000);

    var html = '';

    // ── Header strip ──
    html += '<div class="cust-dr-hd">' +
      '<div class="cust-dr-name">' + _esc(c.name) + '</div>' +
      '<div class="cust-dr-meta">' + _esc(c.country) + ' \u00b7 ' + _esc(c.billingType) + '</div>' +
    '</div>';

    // ── Contact ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-title">Contact</div>' +
      '<div class="cust-dr-grid">' +
        _drField('Name',  c.contactName  || '\u2014') +
        _drField('Email', c.contactEmail ? '<a href="mailto:' + _esc(c.contactEmail) + '">' + _esc(c.contactEmail) + '</a>' : '\u2014', true) +
        _drField('Phone', c.contactPhone || '\u2014') +
        _drField('Form',  c.paymentForm  || '\u2014') +
        _drField('Signed By', c.signedBy ? '<span class="cust-dr-signed">\u270d\ufe0f ' + _esc(c.signedBy) + '</span>' : '\u2014', true) +
        _drField('Account Manager', c.accountManager ? '<span class="cust-dr-signed">\uD83D\uDC64 ' + _esc(c.accountManager) + '</span>' : '\u2014', true) +
      '</div>' +
    '</div>';

    // ── Services ──
    var svcChips = (c.services || []).map(function (s) { return '<span class="fm-svc-chip">' + _esc(s) + '</span>'; }).join('');
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-title">Services Provided</div>' +
      '<div class="fm-svcs">' + (svcChips || '<span class="fm-muted">None listed</span>') + '</div>' +
    '</div>';

    // ── Payment summary ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-title">Payment Summary</div>' +
      '<div class="cust-dr-grid">' +
        _drField('Contract Value', FinSettings.fmtWithNpr(c.contractValue, c.currency), true) +
        _drField('Amount Paid',    FinSettings.fmtWithNpr(c.amountPaid,    c.currency), true) +
        _drField('Amount Due',     FinSettings.fmtWithNpr(c.amountDue,     c.currency), true) +
        _drField('Next Due Date',  _fmtDate(c.nextDueDate)) +
        _drField('Status',         _payBadge(c.paymentStatus), true) +
        _drField('Agreement', _fmtDate(c.agreementStart) + ' \u2013 ' + _fmtDate(c.agreementEnd) +
          (contractsDue >= 0 && contractsDue <= 60 ? ' <span class="fm-chip ' + (contractsDue <= 7 ? 'red' : 'amber') + '">' + contractsDue + 'd left</span>' : ''), true) +
      '</div>' +
      '<div class="cust-progress-wrap">' +
        '<div class="cust-progress-bar"><div class="cust-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="cust-progress-lbl">' + pct + '% paid \u00b7 ' + FinSettings.fmtAmt(c.amountPaid, c.currency) + ' of ' + FinSettings.fmtAmt(c.contractValue, c.currency) + '</div>' +
      '</div>' +
    '</div>';

    // ── Contracts / Projects ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-hd">' +
        '<div class="cust-dr-sec-title">Contracts &amp; Projects</div>' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddContract()">+ Add</button>' +
      '</div>' +
      '<div id="dr-add-ctr-form" style="display:none">' + _addContractForm() + '</div>' +
      '<div id="dr-contracts-list">' + _contractsHtml(c) + '</div>' +
    '</div>';

    // ── Milestones ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-hd">' +
        '<div class="cust-dr-sec-title">Milestones</div>' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddMilestone()">+ Add</button>' +
      '</div>' +
      '<div id="dr-add-ms-form" style="display:none">' + _addMilestoneForm() + '</div>' +
      '<div id="dr-milestones-list">' + _milestonesHtml(c) + '</div>' +
    '</div>';

    // ── Payment history ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-hd">' +
        '<div class="cust-dr-sec-title">Payment History</div>' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddPayment()">Record Payment</button>' +
      '</div>' +
      '<div id="dr-add-pay-form" style="display:none">' + _addPaymentForm() + '</div>' +
      '<div id="dr-payments-list">' + _paymentsHtml(c) + '</div>' +
    '</div>';

    // ── Invoices ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-hd">' +
        '<div class="cust-dr-sec-title">Invoices</div>' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddInvoice()">+ Invoice</button>' +
      '</div>' +
      '<div id="dr-add-inv-form" style="display:none">' + _addInvoiceForm() + '</div>' +
      '<div id="dr-invoices-list">' + _invoicesHtml(c) + '</div>' +
    '</div>';

    if (c.notes) {
      html += '<div class="cust-dr-section"><div class="cust-dr-sec-title">Notes</div><div class="cust-dr-notes">' + _esc(c.notes) + '</div></div>';
    }

    return html;
  }

  function _drField(label, value, isHtml) {
    return '<div class="cust-dr-field">' +
      '<div class="cust-dr-field-lbl">' + label + '</div>' +
      '<div class="cust-dr-field-val">' + (isHtml ? value : _esc(String(value || '\u2014'))) + '</div>' +
    '</div>';
  }

  // ── Sub-renders ──

  function _contractsHtml(c) {
    if (!c.contracts || !c.contracts.length) return '<div class="fm-muted-sm">No contracts on file</div>';
    return c.contracts.map(function (ctr) {
      var stCls  = { active: 'fm-badge--green', completed: 'fm-badge--gray', cancelled: 'fm-badge--red' }[ctr.status] || 'fm-badge--gray';
      var daysLeft = ctr.endDate ? Math.ceil((new Date(ctr.endDate) - new Date()) / 86400000) : null;
      var tasks = ctr.tasks || [];
      var tasksDone = tasks.filter(function (t) { return t.status === 'done'; }).length;
      return '<div class="cust-ctr-card">' +
        '<div class="cust-ctr-top">' +
          '<span class="cust-ctr-name">' + _esc(ctr.name) + '</span>' +
          '<span class="fm-badge ' + stCls + '">' + ctr.status + '</span>' +
        '</div>' +
        (ctr.description ? '<div class="cust-ctr-desc">' + _esc(ctr.description) + '</div>' : '') +
        '<div class="cust-ctr-meta">' +
          _fmtDate(ctr.startDate) + ' \u2013 ' + _fmtDate(ctr.endDate) +
          (daysLeft !== null && daysLeft >= 0 && daysLeft <= 60 ? ' <span class="fm-chip ' + (daysLeft <= 7 ? 'red' : 'amber') + '">' + daysLeft + 'd left</span>' : '') +
          ' \u00b7 ' + FinSettings.fmtAmt(ctr.value, c.currency) +
        '</div>' +
        (ctr.status === 'active' ? '<div class="cust-ctr-actions">' +
          '<button class="btn btn-xs btn-out" onclick="Customers.completeContract(\'' + _esc(c.id) + '\',\'' + _esc(ctr.id) + '\')">Mark Complete</button>' +
        '</div>' : '') +
        // ── Tasks section ──
        '<div class="cust-tasks-section">' +
          '<div class="cust-tasks-hd">' +
            '<span class="cust-tasks-lbl">Tasks' + (tasks.length ? ' \u00b7 ' + tasksDone + '/' + tasks.length + ' done' : '') + '</span>' +
            '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddTask(\'' + _esc(c.id) + '\',\'' + _esc(ctr.id) + '\')">+ Task</button>' +
          '</div>' +
          '<div id="dr-task-form-' + _esc(ctr.id) + '" style="display:none">' + _addTaskForm(c.id, ctr.id) + '</div>' +
          (tasks.length ? '<div class="cust-task-list">' + tasks.map(function (t) {
            var dotCls = t.status === 'done' ? 'done' : t.status === 'in_progress' ? 'in_progress' : '';
            var due    = t.dueDate ? _fmtDate(t.dueDate) : '';
            var overdue = t.status !== 'done' && t.dueDate && Math.ceil((new Date(t.dueDate) - new Date()) / 86400000) < 0;
            return '<div class="cust-task-row">' +
              '<div class="cust-task-dot ' + dotCls + '"></div>' +
              '<div class="cust-task-body">' +
                '<div class="cust-task-name' + (t.status === 'done' ? ' cust-task-name--done' : '') + '">' + _esc(t.name) + '</div>' +
                '<div class="cust-task-meta">' +
                  (t.assignee ? '\uD83D\uDC64\uFE0F ' + _esc(t.assignee) : '') +
                  (due ? ' \u00b7 ' + (overdue ? '<span style="color:var(--red)">' + due + ' overdue</span>' : due) : '') +
                  ' <span class="task-pri task-pri--' + (t.priority || 'medium') + '">' + (t.priority || 'medium') + '</span>' +
                  ' <span class="task-st task-st--' + t.status + '">' + t.status.replace('_',' ') + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="cust-task-actions">' +
                (t.status === 'todo'        ? '<button class="btn btn-xs btn-out" onclick="Customers.setTaskStatus(\'' + _esc(c.id) + '\',\'' + _esc(ctr.id) + '\',\'' + _esc(t.id) + '\',\'in_progress\')">Start</button>' : '') +
                (t.status === 'in_progress' ? '<button class="btn btn-xs btn-out" onclick="Customers.setTaskStatus(\'' + _esc(c.id) + '\',\'' + _esc(ctr.id) + '\',\'' + _esc(t.id) + '\',\'done\')">Done</button>' : '') +
                (t.status === 'done'        ? '<button class="btn btn-xs btn-out" onclick="Customers.setTaskStatus(\'' + _esc(c.id) + '\',\'' + _esc(ctr.id) + '\',\'' + _esc(t.id) + '\',\'todo\')">Reopen</button>' : '') +
                '<button class="btn btn-xs btn-out fm-btn-del" onclick="Customers.deleteTask(\'' + _esc(c.id) + '\',\'' + _esc(ctr.id) + '\',\'' + _esc(t.id) + '\')">\u00d7</button>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>' : '<div class="fm-muted-sm">No tasks yet</div>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _addTaskForm(custId, contractId) {
    return '<div class="dr-inline-form">' +
      '<div class="dr-inline-grid">' +
        '<div class="fg" style="padding:0;grid-column:1/-1"><label class="fl">Task Name</label><input class="finp" id="dr-task-name-' + _esc(contractId) + '" placeholder="e.g. Deploy staging"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Assignee</label><input class="finp" id="dr-task-assignee-' + _esc(contractId) + '" placeholder="Team member name"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Due Date</label><input class="finp" id="dr-task-due-' + _esc(contractId) + '" type="date"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Priority</label>' +
          '<select class="finp" id="dr-task-pri-' + _esc(contractId) + '">' +
            '<option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="dr-inline-actions">' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddTask(\'' + _esc(custId) + '\',\'' + _esc(contractId) + '\')">Cancel</button>' +
        '<button class="btn btn-xs btn-blue" onclick="Customers.submitTask(\'' + _esc(custId) + '\',\'' + _esc(contractId) + '\')">Add Task</button>' +
      '</div>' +
    '</div>';
  }

  function _milestonesHtml(c) {
    if (!c.milestones || !c.milestones.length) return '<div class="fm-muted-sm">No milestones defined</div>';
    return '<div class="cust-ms-list">' + c.milestones.map(function (ms) {
      var days = ms.dueDate ? Math.ceil((new Date(ms.dueDate) - new Date()) / 86400000) : null;
      var overdue = !ms.paid && days !== null && days < 0;
      return '<div class="cust-ms-row' + (overdue ? ' overdue' : '') + '">' +
        '<div class="cust-ms-check' + (ms.paid ? ' done' : '') + '">' + (ms.paid ? '\u2713' : '') + '</div>' +
        '<div class="cust-ms-body">' +
          '<div class="cust-ms-name">' + _esc(ms.name) + '</div>' +
          '<div class="cust-ms-meta">' +
            FinSettings.fmtAmt(ms.amount, c.currency) + ' \u00b7 Due ' + _fmtDate(ms.dueDate) +
            (ms.paid ? ' \u00b7 Paid ' + _fmtDate(ms.paidDate) : '') +
            (overdue ? ' <span class="fm-chip red">' + Math.abs(days) + 'd overdue</span>' : '') +
          '</div>' +
        '</div>' +
        (!ms.paid ? '<button class="btn btn-xs btn-out" onclick="Customers.payMilestone(\'' + _esc(c.id) + '\',\'' + _esc(ms.id) + '\')">Mark Paid</button>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  function _paymentsHtml(c) {
    var pays = (c.payments || []).slice().sort(function (a, b) { return b.date > a.date ? 1 : -1; });
    if (!pays.length) return '<div class="fm-muted-sm">No payments recorded</div>';
    return '<div class="cust-pay-list">' + pays.map(function (p) {
      return '<div class="cust-pay-row">' +
        '<div class="cust-pay-date">' + _fmtDate(p.date) + '</div>' +
        '<div class="cust-pay-amt">' + FinSettings.fmtAmt(p.amount, c.currency) + '</div>' +
        '<div class="cust-pay-note">' + _esc(p.notes || '') + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function _invoicesHtml(c) {
    var invs = (c.invoices || []).slice().sort(function (a, b) { return b.issueDate > a.issueDate ? 1 : -1; });
    if (!invs.length) return '<div class="fm-muted-sm">No invoices issued</div>';
    var ST = { draft:'fm-badge--gray', sent:'fm-badge--blue', paid:'fm-badge--green', cancelled:'fm-badge--red' };
    return '<div class="cust-inv-list">' + invs.map(function (inv) {
      return '<div class="cust-inv-row">' +
        '<div class="cust-inv-meta"><span class="cust-inv-date">' + _fmtDate(inv.issueDate) + '</span><span class="fm-badge ' + (ST[inv.status] || 'fm-badge--gray') + '">' + inv.status + '</span></div>' +
        '<div class="cust-inv-amt">' + FinSettings.fmtAmt(inv.amount, c.currency) + '</div>' +
        '<div class="cust-inv-actions">' +
          (inv.status === 'draft'     ? '<button class="btn btn-xs btn-out" onclick="Customers.setInvStatus(\'' + _esc(c.id) + '\',\'' + _esc(inv.id) + '\',\'sent\')">Send</button>' : '') +
          (inv.status === 'sent'      ? '<button class="btn btn-xs btn-out" onclick="Customers.setInvStatus(\'' + _esc(c.id) + '\',\'' + _esc(inv.id) + '\',\'paid\')">Mark Paid</button>' : '') +
          (inv.status !== 'cancelled' && inv.status !== 'paid' ? '<button class="btn btn-xs btn-out fm-btn-del" onclick="Customers.setInvStatus(\'' + _esc(c.id) + '\',\'' + _esc(inv.id) + '\',\'cancelled\')">Cancel</button>' : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // ── Inline add forms ──

  function _addPaymentForm() {
    return '<div class="dr-inline-form">' +
      '<div class="dr-inline-grid">' +
        '<div class="fg" style="padding:0"><label class="fl">Amount</label><input class="finp" id="dr-pay-amount" type="number" min="0" placeholder="0.00"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Date</label><input class="finp" id="dr-pay-date" type="date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
        '<div class="fg" style="padding:0;grid-column:1/-1"><label class="fl">Notes</label><input class="finp" id="dr-pay-notes" placeholder="Optional"/></div>' +
      '</div>' +
      '<div class="dr-inline-actions">' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddPayment()">Cancel</button>' +
        '<button class="btn btn-xs btn-blue" onclick="Customers.submitPayment()">Save</button>' +
      '</div>' +
    '</div>';
  }

  function _addInvoiceForm() {
    return '<div class="dr-inline-form">' +
      '<div class="dr-inline-grid">' +
        '<div class="fg" style="padding:0"><label class="fl">Issue Date</label><input class="finp" id="dr-inv-date" type="date" value="' + new Date().toISOString().slice(0,10) + '"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Amount</label><input class="finp" id="dr-inv-amount" type="number" min="0" placeholder="0.00"/></div>' +
        '<div class="fg" style="padding:0;grid-column:1/-1"><label class="fl">Notes</label><input class="finp" id="dr-inv-notes" placeholder="Optional"/></div>' +
      '</div>' +
      '<div class="dr-inline-actions">' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddInvoice()">Cancel</button>' +
        '<button class="btn btn-xs btn-blue" onclick="Customers.submitInvoice()">Issue</button>' +
      '</div>' +
    '</div>';
  }

  function _addMilestoneForm() {
    return '<div class="dr-inline-form">' +
      '<div class="dr-inline-grid">' +
        '<div class="fg" style="padding:0;grid-column:1/-1"><label class="fl">Milestone Name</label><input class="finp" id="dr-ms-name" placeholder="e.g. Phase 4 — Testing"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Amount</label><input class="finp" id="dr-ms-amount" type="number" min="0" placeholder="0.00"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Due Date</label><input class="finp" id="dr-ms-due" type="date"/></div>' +
      '</div>' +
      '<div class="dr-inline-actions">' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddMilestone()">Cancel</button>' +
        '<button class="btn btn-xs btn-blue" onclick="Customers.submitMilestone()">Add</button>' +
      '</div>' +
    '</div>';
  }

  function _addContractForm() {
    return '<div class="dr-inline-form">' +
      '<div class="dr-inline-grid">' +
        '<div class="fg" style="padding:0;grid-column:1/-1"><label class="fl">Contract / Project Name</label><input class="finp" id="dr-ctr-name" placeholder="e.g. Website Redesign v2"/></div>' +
        '<div class="fg" style="padding:0;grid-column:1/-1"><label class="fl">Description</label><input class="finp" id="dr-ctr-desc" placeholder="Brief description"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Start Date</label><input class="finp" id="dr-ctr-start" type="date"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">End Date</label><input class="finp" id="dr-ctr-end" type="date"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Value</label><input class="finp" id="dr-ctr-value" type="number" min="0" placeholder="0.00"/></div>' +
      '</div>' +
      '<div class="dr-inline-actions">' +
        '<button class="btn btn-xs btn-out" onclick="Customers.toggleAddContract()">Cancel</button>' +
        '<button class="btn btn-xs btn-blue" onclick="Customers.submitContract()">Add</button>' +
      '</div>' +
    '</div>';
  }

  // ─── Drawer toggle actions ────────────────────────────────────────────

  function _toggleDrawerForm(formId, flag, setterFn) {
    setterFn(!flag);
    var el = document.getElementById(formId);
    if (el) el.style.display = flag ? 'none' : '';
  }

  function toggleAddPayment() {
    _drawerAddPayOpen = !_drawerAddPayOpen;
    var el = document.getElementById('dr-add-pay-form');
    if (el) el.style.display = _drawerAddPayOpen ? '' : 'none';
  }

  function toggleAddInvoice() {
    _drawerAddInvOpen = !_drawerAddInvOpen;
    var el = document.getElementById('dr-add-inv-form');
    if (el) el.style.display = _drawerAddInvOpen ? '' : 'none';
  }

  function toggleAddMilestone() {
    _drawerAddMsOpen = !_drawerAddMsOpen;
    var el = document.getElementById('dr-add-ms-form');
    if (el) el.style.display = _drawerAddMsOpen ? '' : 'none';
  }

  function toggleAddContract() {
    _drawerAddCtrOpen = !_drawerAddCtrOpen;
    var el = document.getElementById('dr-add-ctr-form');
    if (el) el.style.display = _drawerAddCtrOpen ? '' : 'none';
  }

  function toggleAddTask(custId, contractId) {
    _drawerTaskFormOpen[contractId] = !_drawerTaskFormOpen[contractId];
    var el = document.getElementById('dr-task-form-' + contractId);
    if (el) el.style.display = _drawerTaskFormOpen[contractId] ? '' : 'none';
  }

  function submitTask(custId, contractId) {
    var name     = _getVal('dr-task-name-'     + contractId);
    var assignee = _getVal('dr-task-assignee-' + contractId);
    var due      = _getVal('dr-task-due-'      + contractId);
    var priority = _getVal('dr-task-pri-'      + contractId);
    if (!name) { App.showToast('Enter a task name', 'err'); return; }
    addTask(custId, contractId, { name: name, assignee: assignee, dueDate: due, priority: priority });
    App.showToast('Task added', 'ok');
    _drawerTaskFormOpen[contractId] = false;
    _refreshDrawer();
  }

  function setTaskStatus(custId, contractId, taskId, status) {
    updateTaskStatus(custId, contractId, taskId, status);
    _refreshDrawer();
  }

  function deleteTask(custId, contractId, taskId) {
    removeTask(custId, contractId, taskId);
    App.showToast('Task removed', 'ok');
    _refreshDrawer();
  }

  // ─── Drawer submit actions ────────────────────────────────────────────

  function submitPayment() {
    var amt  = parseFloat(_getVal('dr-pay-amount'));
    var date = _getVal('dr-pay-date');
    var note = _getVal('dr-pay-notes');
    if (isNaN(amt) || amt <= 0) { App.showToast('Enter a valid amount', 'err'); return; }
    if (!date) { App.showToast('Enter a date', 'err'); return; }
    recordPayment(_drawerCustId, amt, date, note);
    App.showToast('Payment recorded', 'ok');
    _drawerAddPayOpen = false;
    _refreshDrawer();
    _render();
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  function submitInvoice() {
    var date = _getVal('dr-inv-date');
    var amt  = parseFloat(_getVal('dr-inv-amount'));
    var note = _getVal('dr-inv-notes');
    if (isNaN(amt) || amt <= 0) { App.showToast('Enter a valid amount', 'err'); return; }
    addInvoice(_drawerCustId, { issueDate: date, amount: amt, notes: note });
    App.showToast('Invoice issued', 'ok');
    _drawerAddInvOpen = false;
    _refreshDrawer();
  }

  function submitMilestone() {
    var name = _getVal('dr-ms-name');
    var amt  = parseFloat(_getVal('dr-ms-amount'));
    var due  = _getVal('dr-ms-due');
    if (!name) { App.showToast('Enter a milestone name', 'err'); return; }
    if (isNaN(amt) || amt <= 0) { App.showToast('Enter a valid amount', 'err'); return; }
    addMilestone(_drawerCustId, { name, amount: amt, dueDate: due });
    App.showToast('Milestone added', 'ok');
    _drawerAddMsOpen = false;
    _refreshDrawer();
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  function submitContract() {
    var name  = _getVal('dr-ctr-name');
    var desc  = _getVal('dr-ctr-desc');
    var start = _getVal('dr-ctr-start');
    var end   = _getVal('dr-ctr-end');
    var val   = parseFloat(_getVal('dr-ctr-value'));
    if (!name) { App.showToast('Enter a contract name', 'err'); return; }
    addContract(_drawerCustId, { name, description: desc, startDate: start, endDate: end, value: isNaN(val) ? 0 : val });
    App.showToast('Contract added', 'ok');
    _drawerAddCtrOpen = false;
    _refreshDrawer();
  }

  function payMilestone(custId, msId) {
    markMilestonePaid(custId, msId);
    App.showToast('Milestone marked paid', 'ok');
    _refreshDrawer();
    _render();
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  function setInvStatus(custId, invId, status) {
    updateInvoiceStatus(custId, invId, status);
    App.showToast('Invoice ' + status, 'ok');
    if (status === 'paid') _render();
    _refreshDrawer();
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  function completeContract(custId, ctrId) {
    updateContractStatus(custId, ctrId, 'completed');
    App.showToast('Contract marked complete', 'ok');
    _refreshDrawer();
  }

  function _refreshDrawer() {
    if (!_drawerCustId) return;
    var c = getById(_drawerCustId);
    if (c) _renderDrawer(c);
  }

  // ─── Customer Add / Edit Modal ────────────────────────────────────────

  function openAddModal() {
    _editId = null;
    _clearCustForm();
    _setElRaw('cust-modal-title', 'Add Customer');
    _openOverlay('cust-overlay');
  }

  function openEditModal(id) {
    var c = getById(id);
    if (!c) return;
    _editId = id;
    _setElRaw('cust-modal-title', 'Edit Customer');
    _setVal('cust-m-name',       c.name);
    _setVal('cust-m-country',    c.country);
    _setVal('cust-m-contact',    c.contactName);
    _setVal('cust-m-email',      c.contactEmail);
    _setVal('cust-m-phone',      c.contactPhone);
    _setVal('cust-m-services',   (c.services || []).join(', '));
    _setVal('cust-m-currency',   c.currency);
    _setVal('cust-m-contract-v', c.contractValue);
    _setVal('cust-m-paid',       c.amountPaid);
    _setVal('cust-m-due-date',   c.nextDueDate);
    _setVal('cust-m-pay-form',   c.paymentForm);
    _setVal('cust-m-ag-start',   c.agreementStart);
    _setVal('cust-m-ag-end',     c.agreementEnd);
    _setVal('cust-m-billing',      c.billingType);
    _setVal('cust-m-freq',         c.billingFrequency || 'monthly');
    _setVal('cust-m-signed-by',    c.signedBy);
    _setVal('cust-m-account-mgr',  c.accountManager);
    _setVal('cust-m-notes',        c.notes);
    _onCustBillingChange();
    _openOverlay('cust-overlay');
  }

  function closeCustModal() {
    _closeOverlay('cust-overlay');
    _editId = null;
    var err = document.getElementById('cust-modal-err');
    if (err) err.textContent = '';
  }

  function _clearCustForm() {
    ['cust-m-name','cust-m-country','cust-m-contact','cust-m-email','cust-m-phone','cust-m-services',
     'cust-m-contract-v','cust-m-paid','cust-m-due-date','cust-m-pay-form','cust-m-signed-by','cust-m-account-mgr',
     'cust-m-ag-start','cust-m-ag-end','cust-m-notes']
    .forEach(function (id) { _setVal(id, ''); });
    _setVal('cust-m-currency', 'USD');
    _setVal('cust-m-billing',  'recurring');
    _setVal('cust-m-freq',     'monthly');
    var err = document.getElementById('cust-modal-err');
    if (err) err.textContent = '';
    _onCustBillingChange();
  }

  function onCustBillingChange() { _onCustBillingChange(); }

  function _onCustBillingChange() {
    var bt  = _getVal('cust-m-billing');
    var row = document.getElementById('cust-m-freq-row');
    if (row) row.style.display = (bt === 'recurring' || bt === 'retainer') ? '' : 'none';
  }

  function confirmCustSave() {
    var errEl = document.getElementById('cust-modal-err');
    if (errEl) errEl.textContent = '';
    function err(msg) { if (errEl) errEl.textContent = msg; }

    var name    = _getVal('cust-m-name');
    var country = _getVal('cust-m-country');
    var cv      = parseFloat(_getVal('cust-m-contract-v'));
    var paid    = parseFloat(_getVal('cust-m-paid') || '0');
    var billing = _getVal('cust-m-billing');
    var freq    = _getVal('cust-m-freq');
    var svcsRaw = _getVal('cust-m-services');
    var services = svcsRaw ? svcsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];

    if (!name)           { err('Customer name is required');     return; }
    if (!country)        { err('Country is required');           return; }
    if (isNaN(cv) || cv < 0) { err('Enter a valid contract value'); return; }

    var fields = {
      name, country,
      contactName:   _getVal('cust-m-contact'),
      contactEmail:  _getVal('cust-m-email'),
      contactPhone:  _getVal('cust-m-phone'),
      services,
      currency:      _getVal('cust-m-currency'),
      contractValue: cv,
      amountPaid:    isNaN(paid) ? 0 : paid,
      nextDueDate:   _getVal('cust-m-due-date'),
      paymentForm:   _getVal('cust-m-pay-form'),
      agreementStart: _getVal('cust-m-ag-start'),
      agreementEnd:  _getVal('cust-m-ag-end'),
      billingType:   billing,
      billingFrequency: (billing === 'recurring' || billing === 'retainer') ? freq : null,
      signedBy:      _getVal('cust-m-signed-by'),
      accountManager: _getVal('cust-m-account-mgr'),
      notes:         _getVal('cust-m-notes'),
    };

    if (_editId) { _updateCustomer(_editId, fields); App.showToast('Customer updated', 'ok'); }
    else         { _addCustomer(fields);              App.showToast('Customer added', 'ok'); }

    closeCustModal();
    _render();
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  function confirmDelete(id) {
    var c = getById(id);
    if (!c) return;
    if (!window.confirm('Delete customer "' + c.name + '"? This cannot be undone.')) return;
    _removeCustomer(id);
    App.showToast('Customer removed', 'ok');
    _render();
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  // ─── Shared helpers ───────────────────────────────────────────────────

  function _setElRaw(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
  function _openOverlay(id)   { var el = document.getElementById(id); if (el) el.classList.add('open'); }
  function _closeOverlay(id)  { var el = document.getElementById(id); if (el) el.classList.remove('open'); }

  // ─── Public ───────────────────────────────────────────────────────────

  return {
    init:                init,
    onTabActivated:      onTabActivated,
    getAll:              getAll,
    computePaymentStatus: computePaymentStatus,
    openDrawer:          openDrawer,
    closeDrawer:         closeDrawer,
    openAddModal:        openAddModal,
    openEditModal:       openEditModal,
    closeCustModal:      closeCustModal,
    confirmCustSave:     confirmCustSave,
    confirmDelete:       confirmDelete,
    onSearch:            onSearch,
    onFilterStatus:      onFilterStatus,
    onFilterBillingType: onFilterBillingType,
    onFilterCurrency:    onFilterCurrency,
    onCustBillingChange: onCustBillingChange,
    // Drawer actions
    toggleAddPayment:    toggleAddPayment,
    toggleAddInvoice:    toggleAddInvoice,
    toggleAddMilestone:  toggleAddMilestone,
    toggleAddContract:   toggleAddContract,
    toggleAddTask:       toggleAddTask,
    submitTask:          submitTask,
    setTaskStatus:       setTaskStatus,
    deleteTask:          deleteTask,
    submitPayment:       submitPayment,
    submitInvoice:       submitInvoice,
    submitMilestone:     submitMilestone,
    submitContract:      submitContract,
    payMilestone:        payMilestone,
    setInvStatus:        setInvStatus,
    completeContract:    completeContract,
  };

})();
