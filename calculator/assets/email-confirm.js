/**
* Email confirmation on sign up page 1.
*
* Emails the customer a 6-digit code, checks it with the API, and remembers
* the signed token that the final submit must carry. This is separate from the
* copy of the signed agreement that is emailed after signing up.
*
* The API enforces all of this; the checks here are only for a smooth
* experience.
*/

const SendEmailCodeUrl = 'https://theptd-api.azurewebsites.net/sendEmailCode.php';
const VerifyEmailCodeUrl = 'https://theptd-api.azurewebsites.net/verifyEmailCode.php';
const ResendCooldownSeconds = 30;
const OfficePhone = '(312) 488-9050';

const EmailConfirmSel = {
  emailInput: '#email-input',
  startBox: '#email-confirm-start',
  entryBox: '#email-confirm-entry',
  target: '#email-confirm-target',
  codeInput: '#email-code-input',
  codeError: '#email-code-err',
  confirmedBox: '#email-confirmed',
  confirmedAddress: '#email-confirmed-address',
  requiredError: '#email-confirm-required-err',
  sendBtn: '#email-send-btn',
  resendBtn: '#email-resend-btn',
  verifyBtn: '#email-verify-btn',
  changeBtn: '#email-change-btn'
};

/** The signed challenge from the last "send code", and the email it was sent to */
var emailChallenge = null;
var emailChallengeFor = null;
var resendTimer = null;

function normalizeEmailAddress(email) {
  return String(email || '').trim().toLowerCase();
}

/** Reads the saved confirmation ({ email, token }) if it hasn't expired */
function readEmailConfirmation() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SessionStorageKeys.EmailConfirmation));
    if (!saved || !saved.token || !saved.email) { return null; }

    // The token's payload carries its expiry, so an expired one isn't offered
    const payload = saved.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const expires = JSON.parse(atob(payload)).x;
    return expires * 1000 > Date.now() ? saved : null;
  }
  catch (error) {
    return null;
  }
}

/** True if this exact email address has been confirmed in this session */
function isEmailConfirmed(email) {
  const saved = readEmailConfirmation();
  return Boolean(saved) && saved.email === normalizeEmailAddress(email);
}

jQuery(document).ready(function($) {
  $(EmailConfirmSel.sendBtn).click(sendEmailCode);
  $(EmailConfirmSel.resendBtn).click(sendEmailCode);
  $(EmailConfirmSel.verifyBtn).click(verifyEmailCode);
  $(EmailConfirmSel.changeBtn).click(function() {
    resetEmailConfirmation();
    $(EmailConfirmSel.emailInput).focus();
  });

  // Enter in the code box confirms the code rather than submitting the form
  $(EmailConfirmSel.codeInput).on('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      verifyEmailCode();
    }
  });

  // Changing the address invalidates anything sent to or confirmed for another one
  $(EmailConfirmSel.emailInput).on('input change', onEmailEdited);
  onEmailEdited();
});

function onEmailEdited() {
  const $ = jQuery;
  const current = normalizeEmailAddress($(EmailConfirmSel.emailInput).val());

  if (isEmailConfirmed(current)) {
    showEmailConfirmed(current);
  }
  else if (emailChallengeFor && emailChallengeFor !== current) {
    resetEmailConfirmation();
  }
  else if (!emailChallengeFor) {
    // Nothing sent yet: make sure the "send code" state is what shows
    $(EmailConfirmSel.confirmedBox).addClass(HiddenClass);
    $(EmailConfirmSel.startBox).removeClass(HiddenClass);
  }
}

function resetEmailConfirmation() {
  const $ = jQuery;

  emailChallenge = null;
  emailChallengeFor = null;
  clearInterval(resendTimer);

  $(EmailConfirmSel.codeInput).val('');
  $(EmailConfirmSel.codeError).addClass(InlineHiddenClass);
  $(EmailConfirmSel.entryBox).addClass(HiddenClass);
  $(EmailConfirmSel.confirmedBox).addClass(HiddenClass);
  $(EmailConfirmSel.startBox).removeClass(HiddenClass);
  setSendButtonsBusy(false);
}

function showEmailCodeEntry(email) {
  const $ = jQuery;

  $(EmailConfirmSel.target).text(email);
  $(EmailConfirmSel.requiredError).addClass(InlineHiddenClass);
  $(EmailConfirmSel.startBox).addClass(HiddenClass);
  $(EmailConfirmSel.confirmedBox).addClass(HiddenClass);
  $(EmailConfirmSel.entryBox).removeClass(HiddenClass);
  $(EmailConfirmSel.codeInput).val('').focus();
}

function showEmailConfirmed(email) {
  const $ = jQuery;

  $(EmailConfirmSel.confirmedAddress).text(email);
  $(EmailConfirmSel.startBox).addClass(HiddenClass);
  $(EmailConfirmSel.entryBox).addClass(HiddenClass);
  $(EmailConfirmSel.confirmedBox).removeClass(HiddenClass);
  $(EmailConfirmSel.requiredError).addClass(InlineHiddenClass);
}

function setSendButtonsBusy(isBusy) {
  const $ = jQuery;
  $(EmailConfirmSel.sendBtn).prop('disabled', isBusy).text(isBusy ? 'Sending…' : 'Email me a confirmation code');
}

function showEmailCodeError(message) {
  jQuery(EmailConfirmSel.codeError).text(message).removeClass(InlineHiddenClass);
}

/** Keeps "Send a new code" disabled for a short cooldown after each send */
function startResendCooldown() {
  const $ = jQuery;
  const btn = $(EmailConfirmSel.resendBtn);
  var remaining = ResendCooldownSeconds;

  clearInterval(resendTimer);
  btn.prop('disabled', true).text('Send a new code (' + remaining + 's)');

  resendTimer = setInterval(function() {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendTimer);
      btn.prop('disabled', false).text('Send a new code');
    }
    else {
      btn.text('Send a new code (' + remaining + 's)');
    }
  }, 1000);
}

function sendEmailCode() {
  const $ = jQuery;
  const email = normalizeEmailAddress($(EmailConfirmSel.emailInput).val());

  if (!validateEmail(email)) {
    // Reuse the form's own email error message
    $(Email.errorSel).removeClass(InlineHiddenClass);
    $(EmailConfirmSel.emailInput).focus();
    return;
  }
  $(Email.errorSel).addClass(InlineHiddenClass);

  setSendButtonsBusy(true);
  $(EmailConfirmSel.codeError).addClass(InlineHiddenClass);

  $.post(SendEmailCodeUrl, { email: email })
    .done(function(response) {
      emailChallenge = response.challenge;
      emailChallengeFor = email;
      showEmailCodeEntry(email);
      startResendCooldown();
    })
    .fail(function(xhr) {
      const error = xhr.responseJSON && xhr.responseJSON.error;
      // The start box is still showing if this is the first send; otherwise the
      // entry box is, so show the message where the customer is looking
      const message = error === 'rate_limited'
        ? 'Too many codes were requested. Please wait a little while and try again, or call us at ' + OfficePhone + '.'
        : error === 'invalid_email'
          ? 'Please enter a valid email address first.'
          : "We couldn't send the email right now. Please check the address and try again, or call us at " + OfficePhone + '.';

      $(EmailConfirmSel.entryBox).removeClass(HiddenClass);
      $(EmailConfirmSel.startBox).addClass(HiddenClass);
      showEmailCodeError(message);
    })
    .always(function() {
      setSendButtonsBusy(false);
    });
}

function verifyEmailCode() {
  const $ = jQuery;
  const email = normalizeEmailAddress($(EmailConfirmSel.emailInput).val());
  const code = String($(EmailConfirmSel.codeInput).val()).replace(/\D/g, '');

  if (!emailChallenge || emailChallengeFor !== email) {
    showEmailCodeError('Please request a new code first.');
    return;
  }
  if (code.length !== 6) {
    showEmailCodeError('Enter the 6-digit code from the email.');
    return;
  }

  $(EmailConfirmSel.verifyBtn).prop('disabled', true).text('Checking…');
  $(EmailConfirmSel.codeError).addClass(InlineHiddenClass);

  $.post(VerifyEmailCodeUrl, { email: email, code: code, challenge: emailChallenge })
    .done(function(response) {
      sessionStorage.setItem(
        SessionStorageKeys.EmailConfirmation,
        JSON.stringify({ email: email, token: response.token }));

      emailChallenge = null;
      emailChallengeFor = null;
      clearInterval(resendTimer);
      showEmailConfirmed(email);
    })
    .fail(function(xhr) {
      const error = xhr.responseJSON && xhr.responseJSON.error;

      if (error === 'expired_code') {
        showEmailCodeError('That code has expired. Please send a new one.');
      }
      else if (error === 'too_many_attempts') {
        emailChallenge = null;
        showEmailCodeError('Too many attempts. Please send a new code.');
      }
      else if (error === 'invalid_code') {
        showEmailCodeError("That code doesn't match. Please check it and try again.");
      }
      else {
        showEmailCodeError("We couldn't check that code right now. Please try again, or call us at " + OfficePhone + '.');
      }
    })
    .always(function() {
      $(EmailConfirmSel.verifyBtn).prop('disabled', false).text('Confirm');
    });
}
