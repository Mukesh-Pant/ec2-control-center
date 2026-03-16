/* ═══════════════════════════════════════════════
   Auth Module — Cognito SDK (SRP) Authentication
   Replaces PKCE Hosted UI with custom login page
   ═══════════════════════════════════════════════ */

const Auth = (function () {

  var userPool = null;
  var challengeUser = null;   // Held during NEW_PASSWORD_REQUIRED
  var pendingEmail = '';       // Email awaiting verification

  // ─── Pool / User helpers ───

  function _pool() {
    if (!userPool) {
      userPool = new AmazonCognitoIdentity.CognitoUserPool({
        UserPoolId: CONFIG.USER_POOL_ID,
        ClientId:   CONFIG.CLIENT_ID,
        Storage:    sessionStorage,
      });
    }
    return userPool;
  }

  function _cognitoUser(email) {
    return new AmazonCognitoIdentity.CognitoUser({
      Username: email,
      Pool:     _pool(),
      Storage:  sessionStorage,
    });
  }

  // ─── Session Storage (api.js compat keys) ───

  function _storeSession(session) {
    var idToken     = session.getIdToken();
    var accessToken = session.getAccessToken();
    var refreshTok  = session.getRefreshToken();

    sessionStorage.setItem('id_token',      idToken.getJwtToken());
    sessionStorage.setItem('access_token',  accessToken.getJwtToken());
    sessionStorage.setItem('refresh_token', refreshTok.getToken());
    sessionStorage.setItem('token_expiry',  String(idToken.getExpiration() * 1000));

    var payload = idToken.decodePayload();
    sessionStorage.setItem('user_email', payload.email || payload['cognito:username'] || 'User');
  }

  // ─── Login (SRP) ───

  function login(email, password) {
    return new Promise(function (resolve, reject) {
      var authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
        Username: email,
        Password: password,
      });
      var cognitoUser = _cognitoUser(email);

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: function (session) {
          _storeSession(session);
          resolve({ type: 'SUCCESS' });
        },
        onFailure: function (err) {
          reject(err);
        },
        newPasswordRequired: function () {
          challengeUser = cognitoUser;
          resolve({ type: 'NEW_PASSWORD_REQUIRED' });
        },
      });
    });
  }

  // ─── Complete New Password Challenge ───

  function completeNewPassword(newPassword) {
    return new Promise(function (resolve, reject) {
      if (!challengeUser) return reject(new Error('No pending challenge'));
      challengeUser.completeNewPasswordChallenge(newPassword, {}, {
        onSuccess: function (session) {
          _storeSession(session);
          challengeUser = null;
          resolve();
        },
        onFailure: function (err) { reject(err); },
      });
    });
  }

  // ─── Signup ───

  function signup(email, password) {
    return new Promise(function (resolve, reject) {
      var attrs = [
        new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'email', Value: email }),
      ];
      _pool().signUp(email, password, attrs, null, function (err, result) {
        if (err) return reject(err);
        pendingEmail = email;
        resolve(result);
      });
    });
  }

  function confirmSignup(email, code) {
    return new Promise(function (resolve, reject) {
      _cognitoUser(email).confirmRegistration(code, true, function (err, result) {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  function resendConfirmationCode(email) {
    return new Promise(function (resolve, reject) {
      _cognitoUser(email).resendConfirmationCode(function (err, result) {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // ─── Forgot / Reset Password ───

  function forgotPassword(email) {
    return new Promise(function (resolve, reject) {
      pendingEmail = email;
      _cognitoUser(email).forgotPassword({
        onSuccess: function () { resolve(); },
        onFailure: function (err) { reject(err); },
        inputVerificationCode: function () { resolve(); },
      });
    });
  }

  function confirmForgotPassword(email, code, newPassword) {
    return new Promise(function (resolve, reject) {
      _cognitoUser(email).confirmPassword(code, newPassword, {
        onSuccess: function () { resolve(); },
        onFailure: function (err) { reject(err); },
      });
    });
  }

  // ─── Token Refresh (returns true/false for api.js compat) ───

  async function refreshTokens() {
    try {
      var cognitoUser = _pool().getCurrentUser();
      if (!cognitoUser) return false;

      return await new Promise(function (resolve) {
        cognitoUser.getSession(function (err, session) {
          if (!err && session && session.isValid()) {
            _storeSession(session);
            resolve(true);
            return;
          }
          // Try explicit refresh
          if (session && session.getRefreshToken()) {
            cognitoUser.refreshSession(session.getRefreshToken(), function (err2, newSession) {
              if (err2 || !newSession) { resolve(false); return; }
              _storeSession(newSession);
              resolve(true);
            });
          } else {
            resolve(false);
          }
        });
      });
    } catch (e) {
      console.error('Token refresh error:', e);
      return false;
    }
  }

  // ─── Session Guard ───

  async function init() {
    // 1. Check existing tokens in sessionStorage
    var token  = sessionStorage.getItem('id_token');
    var expiry = parseInt(sessionStorage.getItem('token_expiry') || '0', 10);

    if (token && Date.now() < expiry) {
      _bootApp(expiry);
      return true;
    }

    // 2. Try SDK session restore
    try {
      var cognitoUser = _pool().getCurrentUser();
      if (cognitoUser) {
        var ok = await refreshTokens();
        if (ok) {
          expiry = parseInt(sessionStorage.getItem('token_expiry') || '0', 10);
          _bootApp(expiry);
          return true;
        }
      }
    } catch (e) { /* no valid session */ }

    // 3. No session — show login page
    _showAuthPage();
    return false;
  }

  function _bootApp(expiry) {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app').style.display = '';
    document.body.classList.add('ready');

    var email      = sessionStorage.getItem('user_email') || '';
    var adminEmail = 'pantm8877@gmail.com';

    App.setUserInfo(email);
    App.setAdmin(email === adminEmail);
    App.setSessionExpiry(expiry);
    App.init();
  }

  function _showAuthPage() {
    document.getElementById('auth-page').style.display = '';
    document.getElementById('app').style.display = 'none';
    document.body.classList.add('ready');
  }

  // ─── Getters (preserved for api.js) ───

  function getToken()     { return sessionStorage.getItem('id_token'); }
  function getEmail()     { return sessionStorage.getItem('user_email') || 'User'; }
  function getExpiry()    { return parseInt(sessionStorage.getItem('token_expiry') || '0', 10); }
  function isNearExpiry() { return (getExpiry() - Date.now()) < 600000; }

  // ─── Redirect / Logout ───

  function redirectToLogin() {
    sessionStorage.clear();
    window.location.reload();
  }

  function logout() {
    try {
      var cognitoUser = _pool().getCurrentUser();
      if (cognitoUser) cognitoUser.signOut();
    } catch (e) { /* ignore */ }
    sessionStorage.clear();
    window.location.reload();
  }

  // ─── Public API ───

  return {
    init, login, completeNewPassword,
    signup, confirmSignup, resendConfirmationCode,
    forgotPassword, confirmForgotPassword,
    refreshTokens, getToken, getEmail, getExpiry, isNearExpiry,
    redirectToLogin, logout,
    getPendingEmail: function () { return pendingEmail; },
  };

})();
