/* ═══════════════════════════════════════════════
   API Module — Fetch wrapper with auto-refresh
   ═══════════════════════════════════════════════ */

const API = (function () {

  /**
   * Make an authenticated API call.
   * @param {string} path - API path (e.g., '/ec2')
   * @param {string} method - HTTP method
   * @param {object|null} body - Request body (for POST)
   * @returns {Promise<Response>}
   */
  async function call(path, method, body) {
    // Auto-refresh if near expiry
    if (Auth.isNearExpiry()) {
      const ok = await Auth.refreshTokens();
      if (!ok) throw new Error('Session expired');
    }

    const token = Auth.getToken();
    if (!token) {
      Auth.redirectToLogin();
      throw new Error('No token');
    }

    const options = {
      method: method || 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const url = CONFIG.API_URL + path;
    const res = await fetch(url, options);

    if (res.status === 401) {
      sessionStorage.clear();
      App.showToast('Session expired. Redirecting...', 'err');
      setTimeout(function () { Auth.redirectToLogin(); }, 1500);
      throw new Error('Unauthorized');
    }

    return res;
  }

  /**
   * POST /ec2 with action body
   */
  async function ec2Action(body) {
    return call('/ec2', 'POST', body);
  }

  /**
   * GET /accounts
   */
  async function getAccounts() {
    return call('/accounts', 'GET', null);
  }

  /**
   * GET /audit  — event log
   * @param {object} params - { instanceId?, userEmail?, limit?, lastKey? }
   */
  async function getAuditLog(params) {
    var qs = [];
    if (params.instanceId) qs.push('instanceId=' + encodeURIComponent(params.instanceId));
    if (params.userEmail)  qs.push('userEmail='  + encodeURIComponent(params.userEmail));
    if (params.action)     qs.push('action='     + encodeURIComponent(params.action));
    if (params.accountId)  qs.push('accountId='  + encodeURIComponent(params.accountId));
    if (params.limit)      qs.push('limit='      + encodeURIComponent(params.limit));
    if (params.lastKey)    qs.push('lastKey='    + encodeURIComponent(JSON.stringify(params.lastKey)));
    return call('/audit' + (qs.length ? '?' + qs.join('&') : ''), 'GET', null);
  }

  /**
   * GET /audit/daily — per-day running hours + estimated cost
   * @param {string} instanceId
   * @param {number} days
   */
  async function getAuditDaily(instanceId, days) {
    return call(
      '/audit/daily?instanceId=' + encodeURIComponent(instanceId) +
      '&days=' + (days || 30),
      'GET', null
    );
  }

  /**
   * POST /accounts — account mutations (add, update, enable, disable, remove, test)
   */
  async function postAccounts(body) {
    return call('/accounts', 'POST', body);
  }

  /**
   * GET /pricing — live on-demand hourly rates
   * @param {string} region - AWS region code (e.g. 'ap-south-1')
   * @param {string[]} types - instance type list (e.g. ['t3.micro', 'm5.large'])
   */
  async function getPricing(region, types) {
    var qs = 'region=' + encodeURIComponent(region);
    if (types && types.length) qs += '&types=' + encodeURIComponent(types.join(','));
    return call('/pricing?' + qs, 'GET', null);
  }

  /**
   * GET /users — list all users with roles and account assignments (admin only)
   */
  async function getUsers() {
    return call('/users', 'GET', null);
  }

  /**
   * POST /users — setRole, grantAccount, revokeAccount, getPermissions (admin only)
   */
  async function postUsers(body) {
    return call('/users', 'POST', body);
  }

  /**
   * GET /backup — list backups for an instance
   * @param {string} instanceId
   * @param {string} accountId
   * @param {string} region
   */
  async function getBackups(instanceId, accountId, region) {
    return call('/backup?instanceId=' + encodeURIComponent(instanceId) +
      '&accountId=' + encodeURIComponent(accountId) +
      '&region=' + encodeURIComponent(region), 'GET', null);
  }

  /**
   * POST /backup — backup mutations (create, delete, restore)
   */
  async function postBackup(body) {
    return call('/backup', 'POST', body);
  }

  /**
   * POST /console-login — generate a federated AWS Console signin URL
   * @param {string} accountId - target AWS account ID
   * @param {string} region    - AWS region to open in console
   */
  async function postConsoleLogin(accountId, region) {
    return call('/console-login', 'POST', { accountId: accountId, region: region });
  }

  /**
   * GET /labs — list all labs
   */
  function getLabsList() {
    return call('/labs', 'GET', null);
  }

  /**
   * POST /labs — provision a new lab
   */
  function provisionLab(body) {
    return call('/labs', 'POST', body);
  }

  /**
   * DELETE /labs — delete a lab instance
   */
  function deleteLabInstance(body) {
    return call('/labs', 'DELETE', body);
  }

  /**
   * POST /labs/payment — upload/manage lab payment
   */
  function uploadLabPayment(body) {
    return call('/labs/payment', 'POST', body);
  }

  /**
   * GET /labs/keypair — get lab EC2 keypair
   */
  function getLabKeypair(labId) {
    return call('/labs/keypair?labId=' + encodeURIComponent(labId), 'GET', null);
  }

  /**
   * GET /labs/windows-password — get Windows RDP password
   */
  function getLabWindowsPassword(labId) {
    return call('/labs/windows-password?labId=' + encodeURIComponent(labId), 'GET', null);
  }

  /**
   * GET /labs/pricing — get lab pricing
   */
  function getLabPricing(params) {
    return call('/labs/pricing?' + new URLSearchParams(params).toString(), 'GET', null);
  }

  /**
   * GET /labs/network-options — get network options for a lab
   */
  function getLabNetworkOptions(accountId, region) {
    return call('/labs/network-options?accountId=' + encodeURIComponent(accountId) + '&region=' + encodeURIComponent(region), 'GET', null);
  }

  return {
    call,
    ec2Action,
    getAccounts,
    postAccounts,
    getAuditLog,
    getAuditDaily,
    getPricing,
    getUsers,
    postUsers,
    getBackups,
    postBackup,
    postConsoleLogin,
    getLabsList,
    provisionLab,
    deleteLabInstance,
    uploadLabPayment,
    getLabKeypair,
    getLabWindowsPassword,
    getLabPricing,
    getLabNetworkOptions,
  };

})();
