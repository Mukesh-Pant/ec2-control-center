/* ═══════════════════════════════════════════════
   Auth Module — Authorization Code + PKCE Flow
   ═══════════════════════════════════════════════ */

const Auth = (function () {

  // ─── PKCE Utilities ───

  function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64URLEncode(array);
  }

  async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(new Uint8Array(digest));
  }

  function base64URLEncode(buffer) {
    return btoa(String.fromCharCode.apply(null, buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ─── Login ───

  async function redirectToLogin() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    sessionStorage.setItem('pkce_verifier', verifier);

    const params = new URLSearchParams({
      client_id: CONFIG.CLIENT_ID,
      response_type: 'code',
      scope: 'email openid',
      redirect_uri: CONFIG.REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    window.location.replace(CONFIG.COGNITO_DOMAIN + '/oauth2/authorize?' + params.toString());
  }

  // ─── Token Exchange ───

  async function exchangeCodeForTokens(code) {
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) {
      redirectToLogin();
      return false;
    }

    try {
      const response = await fetch(CONFIG.COGNITO_DOMAIN + '/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CONFIG.CLIENT_ID,
          code: code,
          redirect_uri: CONFIG.REDIRECT_URI,
          code_verifier: verifier,
        }),
      });

      if (!response.ok) {
        console.error('Token exchange failed:', response.status);
        sessionStorage.removeItem('pkce_verifier');
        redirectToLogin();
        return false;
      }

      const data = await response.json();
      sessionStorage.removeItem('pkce_verifier');

      storeTokens(data);

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return true;

    } catch (err) {
      console.error('Token exchange error:', err);
      redirectToLogin();
      return false;
    }
  }

  // ─── Token Refresh ───

  async function refreshTokens() {
    const refreshToken = sessionStorage.getItem('refresh_token');
    if (!refreshToken) {
      redirectToLogin();
      return false;
    }

    try {
      const response = await fetch(CONFIG.COGNITO_DOMAIN + '/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CONFIG.CLIENT_ID,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        console.error('Token refresh failed:', response.status);
        sessionStorage.clear();
        redirectToLogin();
        return false;
      }

      const data = await response.json();
      // Refresh response doesn't include refresh_token, keep the existing one
      storeTokens(data, false);
      return true;

    } catch (err) {
      console.error('Token refresh error:', err);
      redirectToLogin();
      return false;
    }
  }

  // ─── Token Storage ───

  function storeTokens(data, storeRefresh = true) {
    sessionStorage.setItem('id_token', data.id_token);
    sessionStorage.setItem('access_token', data.access_token);
    if (storeRefresh && data.refresh_token) {
      sessionStorage.setItem('refresh_token', data.refresh_token);
    }
    sessionStorage.setItem('token_expiry', String(Date.now() + data.expires_in * 1000));

    // Decode user email from id_token
    try {
      const payload = JSON.parse(atob(data.id_token.split('.')[1]));
      sessionStorage.setItem('user_email', payload.email || payload['cognito:username'] || 'User');
    } catch (e) {
      sessionStorage.setItem('user_email', 'User');
    }
  }

  // ─── Session Guard ───

  async function init() {
    // Check for authorization code in URL
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      const ok = await exchangeCodeForTokens(code);
      if (!ok) return false;
    }

    // Check existing session
    const token = sessionStorage.getItem('id_token');
    const expiry = parseInt(sessionStorage.getItem('token_expiry') || '0', 10);

    if (!token || Date.now() > expiry) {
      // Try refresh
      if (sessionStorage.getItem('refresh_token')) {
        const ok = await refreshTokens();
        if (!ok) return false;
      } else {
        await redirectToLogin();
        return false;
      }
    }

    // Session is valid — boot the app
    document.body.classList.add('ready');

    var email      = sessionStorage.getItem('user_email') || '';
    var adminEmail = 'pantm8877@gmail.com';

    App.setUserInfo(email);
    App.setAdmin(email === adminEmail);
    App.setSessionExpiry(expiry);  // expiry declared as const above
    App.init();

    return true;
  }

  // ─── Getters ───

  function getToken() {
    return sessionStorage.getItem('id_token');
  }

  function getEmail() {
    return sessionStorage.getItem('user_email') || 'User';
  }

  function getExpiry() {
    return parseInt(sessionStorage.getItem('token_expiry') || '0', 10);
  }

  function isNearExpiry() {
    return (getExpiry() - Date.now()) < 600000; // 10 minutes
  }

  // ─── Logout ───

  function logout() {
    sessionStorage.clear();
    window.location.replace(
      CONFIG.COGNITO_DOMAIN + '/logout?client_id=' + CONFIG.CLIENT_ID +
      '&logout_uri=' + encodeURIComponent(CONFIG.REDIRECT_URI)
    );
  }

  // ─── Public API ───

  return {
    init,
    getToken,
    getEmail,
    getExpiry,
    isNearExpiry,
    refreshTokens,
    redirectToLogin,
    logout,
  };

})();
