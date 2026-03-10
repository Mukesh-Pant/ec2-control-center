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

  return {
    call,
    ec2Action,
    getAccounts,
  };

})();
