/* ═══════════════════════════════════════════════
   AuthUI Module — Login Page UI Controller
   Handles form interactions, validation, errors
   ═══════════════════════════════════════════════ */

const AuthUI = (function () {

  // ─── View Switching ───

  function showView(view) {
    var views = ['login', 'signup', 'verify', 'forgot', 'reset', 'newpass', 'pending'];
    views.forEach(function (v) {
      var el = document.getElementById('auth-' + v);
      if (el) el.style.display = (v === view) ? '' : 'none';
    });
    // Clear all error messages
    document.querySelectorAll('.auth-error').forEach(function (el) {
      el.textContent = '';
      el.style.display = 'none';
    });
    // Auto-focus first input in the visible view
    var card = document.getElementById('auth-' + view);
    if (card) {
      var firstInput = card.querySelector('input');
      if (firstInput) setTimeout(function () { firstInput.focus(); }, 100);
    }
  }

  // ─── Pending Approval Screen ───

  function showPendingApproval(email) {
    showView('pending');
    var emailEl = document.getElementById('pending-email-display');
    if (emailEl) emailEl.textContent = email || '';
  }

  // ─── Login ───

  async function login() {
    var email    = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var errEl    = document.getElementById('login-error');

    if (!email || !password) {
      _showError(errEl, 'Email and password are required.');
      return;
    }

    _setLoading('btn-login', true);

    try {
      var result = await Auth.login(email, password);
      if (result.type === 'NEW_PASSWORD_REQUIRED') {
        showView('newpass');
      } else {
        // SUCCESS — boot dashboard
        Auth.init();
      }
    } catch (err) {
      _showError(errEl, _friendlyError(err));
    } finally {
      _setLoading('btn-login', false);
    }
  }

  // ─── Signup ───

  async function signup() {
    var email    = document.getElementById('signup-email').value.trim();
    var password = document.getElementById('signup-password').value;
    var confirm  = document.getElementById('signup-confirm').value;
    var errEl    = document.getElementById('signup-error');

    if (!email || !password || !confirm) {
      _showError(errEl, 'All fields are required.');
      return;
    }
    if (password !== confirm) {
      _showError(errEl, 'Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      _showError(errEl, 'Password must be at least 8 characters.');
      return;
    }

    _setLoading('btn-signup', true);

    try {
      await Auth.signup(email, password);
      document.getElementById('verify-email-display').textContent = email;
      showView('verify');
    } catch (err) {
      _showError(errEl, _friendlyError(err));
    } finally {
      _setLoading('btn-signup', false);
    }
  }

  // ─── Verify Email ───

  async function confirmSignup() {
    var code  = document.getElementById('verify-code').value.trim();
    var errEl = document.getElementById('verify-error');
    var email = Auth.getPendingEmail() || document.getElementById('signup-email').value.trim();

    if (!code) {
      _showError(errEl, 'Please enter the verification code.');
      return;
    }

    _setLoading('btn-verify', true);

    try {
      await Auth.confirmSignup(email, code);
      showView('login');
      _showSuccess('login-error', 'Email verified! You can now sign in.');
    } catch (err) {
      _showError(errEl, _friendlyError(err));
    } finally {
      _setLoading('btn-verify', false);
    }
  }

  async function resendCode() {
    var email = Auth.getPendingEmail() || document.getElementById('signup-email').value.trim();
    var errEl = document.getElementById('verify-error');

    if (!email) {
      _showError(errEl, 'No email address to resend to.');
      return;
    }

    try {
      await Auth.resendConfirmationCode(email);
      _showSuccess(errEl, 'Verification code resent to ' + email);
    } catch (err) {
      _showError(errEl, _friendlyError(err));
    }
  }

  // ─── Forgot Password ───

  async function forgotPassword() {
    var email = document.getElementById('forgot-email').value.trim();
    var errEl = document.getElementById('forgot-error');

    if (!email) {
      _showError(errEl, 'Please enter your email address.');
      return;
    }

    _setLoading('btn-forgot', true);

    try {
      await Auth.forgotPassword(email);
      showView('reset');
    } catch (err) {
      _showError(errEl, _friendlyError(err));
    } finally {
      _setLoading('btn-forgot', false);
    }
  }

  // ─── Reset Password ───

  async function confirmResetPassword() {
    var code     = document.getElementById('reset-code').value.trim();
    var password = document.getElementById('reset-password').value;
    var errEl    = document.getElementById('reset-error');
    var email    = Auth.getPendingEmail() || document.getElementById('forgot-email').value.trim();

    if (!code || !password) {
      _showError(errEl, 'Code and new password are required.');
      return;
    }

    _setLoading('btn-reset', true);

    try {
      await Auth.confirmForgotPassword(email, code, password);
      showView('login');
      _showSuccess('login-error', 'Password reset! You can now sign in.');
    } catch (err) {
      _showError(errEl, _friendlyError(err));
    } finally {
      _setLoading('btn-reset', false);
    }
  }

  // ─── Force New Password (admin first login) ───

  async function completeNewPassword() {
    var password = document.getElementById('newpass-password').value;
    var errEl    = document.getElementById('newpass-error');

    if (!password) {
      _showError(errEl, 'Please enter a new password.');
      return;
    }

    _setLoading('btn-newpass', true);

    try {
      await Auth.completeNewPassword(password);
      Auth.init();
    } catch (err) {
      _showError(errEl, _friendlyError(err));
    } finally {
      _setLoading('btn-newpass', false);
    }
  }

  // ─── Password Visibility Toggle ───

  function togglePassword(inputId, btn) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    // Update icon
    var svg = btn.querySelector('svg');
    if (svg) {
      svg.innerHTML = isHidden
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  }

  // ─── Password Strength ───

  function updateStrength(password) {
    var bars = document.querySelectorAll('#signup-strength .str-bar');
    if (!bars.length) return;

    var score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    var colors = ['', '#dc2626', '#d97706', '#059669', '#059669'];
    bars.forEach(function (bar, i) {
      bar.style.background = (i < score) ? colors[score] : '#e2e8f0';
    });
  }

  // ─── Error / Success Helpers ───

  function _showError(el, msg) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.textContent = msg;
    el.className = 'auth-error';
    el.style.display = '';
  }

  function _showSuccess(el, msg) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.textContent = msg;
    el.className = 'auth-error auth-success';
    el.style.display = '';
  }

  function _friendlyError(err) {
    var msg = err.message || String(err);
    if (msg.includes('Incorrect username or password') || msg.includes('UserNotFoundException'))
      return 'Invalid email or password.';
    if (msg.includes('UserNotConfirmedException'))
      return 'Please verify your email first.';
    if (msg.includes('UsernameExistsException'))
      return 'An account with this email already exists.';
    if (msg.includes('InvalidPasswordException'))
      return 'Password must be 8+ chars with uppercase, lowercase, number, and symbol.';
    if (msg.includes('CodeMismatchException'))
      return 'Invalid verification code. Please try again.';
    if (msg.includes('ExpiredCodeException'))
      return 'Code expired. Please request a new one.';
    if (msg.includes('LimitExceededException'))
      return 'Too many attempts. Please wait a moment and try again.';
    if (msg.includes('InvalidParameterException'))
      return 'Please check your input and try again.';
    if (msg.includes('NotAuthorizedException'))
      return 'Invalid email or password.';
    return msg;
  }

  // ─── Button Loading State ───

  function _setLoading(btnId, loading) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    var text    = btn.querySelector('.auth-btn-text');
    var spinner = btn.querySelector('.auth-btn-spinner');
    if (text)    text.style.display    = loading ? 'none' : '';
    if (spinner) spinner.style.display = loading ? ''     : 'none';
  }

  // ─── Keyboard Handlers ───

  function _initKeyboard() {
    _onEnter('login-email',     login);
    _onEnter('login-password',  login);
    _onEnter('signup-email',    signup);
    _onEnter('signup-password', signup);
    _onEnter('signup-confirm',  signup);
    _onEnter('verify-code',     confirmSignup);
    _onEnter('forgot-email',    forgotPassword);
    _onEnter('reset-code',      confirmResetPassword);
    _onEnter('reset-password',  confirmResetPassword);
    _onEnter('newpass-password', completeNewPassword);

    // Password strength indicator
    var spInput = document.getElementById('signup-password');
    if (spInput) {
      spInput.addEventListener('input', function () { updateStrength(spInput.value); });
    }
  }

  function _onEnter(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') fn(); });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initKeyboard);
  } else {
    _initKeyboard();
  }

  // ─── Public API ───

  return {
    showView, showPendingApproval,
    login, signup, confirmSignup, resendCode,
    forgotPassword, confirmResetPassword, completeNewPassword,
    togglePassword, updateStrength,
  };

})();
