/**
* JS that is unique to the sign up page 1
*
* NOTE: Typically in jQuery we can make calls like $('div.class'), but in
* Wordpress that's not allowed to prevent library issues. We thus use
* jQuery('div.class') instead or manually declare $ (via `const $ = jQuery`).
*/

/**
* API Paths - UNCHANGED, same backend as the live site
*/
const PreFillUrl =
  'https://propertytax123.com/rackforms/output/forms/pt123/execPreFill.php';

/**
* PluginData is set inline (see sign-up.html) and should be an object
* containing a nextUrl, the URL to the next signup step, and a lookupUrl that
* is the URL to the property lookup step.
*/
const NextUrl = PluginData.nextUrl || 'sign-up-finalize.html';
const LookupUrl = PluginData.lookupUrl || '/';

/** The address data from the previous page */
var addressData;

var vueApp = new Vue({
  el: '#app-root',
  // Jekyll uses Liquid, which would interpret {{ }} on compile time, so we move
  // Vue to use (( )) instead
  delimiters: ["((", "))"],
  data: {
    // Expose LookupUrl constant
    LookupUrl: LookupUrl,

    // Whether we're fetching the client data
    isFetchingClient: false,
  }
});

/**
* HTML Selectors
*/

// General form selectors
const FormPt1Sel = '#form-pt-1';
const FormHiddenClass = '-hide';

/**
* Input objects with input selector, validator function and error selector,
* so we can validate them all at once
*/
const FirstName = {
  inputSel: '#fname-input',
  errorSel: '#fname-err',
  validator: validateFilled
};

const LastName = {
  inputSel: '#lname-input',
  errorSel: '#lname-err',
  validator: validateFilled
};

const Addr = {
  inputSel: '#addr-input',
  errorSel: '#addr-err',
  validator: validateFilled
};

const AddrPin = {
  inputSel: '#pin-input',
  errorSel: '#pin-err',
  validator: validateFilled
};

const Phone = {
  inputSel: '#phone-input',
  errorSel: '#phone-err',
  validator: validatePhone
};

const Email = {
  inputSel: '#email-input',
  errorSel: '#email-err',
  validator: validateEmail
};

// Create an array of inputs to loop over
const Inputs = [ FirstName, LastName, Addr, AddrPin, Phone, Email ];

// Errors
const NoAddressErrSel = '#no-address-err';
const FieldsMissingErrSel = '#fields-missing-err';

// Common classes
const HiddenClass = 'hidden';
const InlineHiddenClass = '-hidden';

jQuery(document).ready(function($) {
  $(FormPt1Sel).submit(continueSignup);

  // Load query params like id
  parseQueryParams();

  if (queryParamsMap.id) {
    fetchPrefillData(queryParamsMap.id);
  }
  // If no client ID, this should be step 2 of sign up
  else {
    // Read address PIN from sessionStorage and set it to the PIN input. If this
    // is not present, throw an error, since we need it
    try {
      const addressDataStr = sessionStorage.getItem(SessionStorageKeys.AddrData);
      addressData = $.parseJSON(addressDataStr);
    }
    catch (error) {
      console.error('Failed to parse addressData from storage', error);
      return;
    }

    fillAdressData();
  }
});

/**
* Fetch the client pre-fill with an UUID by ID (UUIDPrefix-ID)
*/
function fetchPrefillData(idWithUuid) {
  vueApp.isFetchingClient = true;

  jQuery.get(PreFillUrl, {
    sms_key_id: idWithUuid,
    id: idWithUuid.split('-')[1],
  })
    .done(parsePrefillResponse)
    .fail(error => {
      console.error('Client fetch failed!', error);
      vueApp.isFetchingClient = false;
    });
}

function parsePrefillResponse(response) {
  try {
    const clientData = jQuery.parseJSON(response)[0];

    addressData = {
      pin: clientData.PIN,
      county: clientData.County,
      fullAddress: clientData.FullAddress,
    };

    if (clientData.phone) {
      jQuery(Phone.inputSel).val(clientData.phone);
    }

    sessionStorage.setItem(SessionStorageKeys.ClientPin, clientData.id);
  }
  catch (error) {
    console.error('JSON parse error', error);
  }

  vueApp.isFetchingClient = false;
  fillAdressData();
}

/**
* Fill the adress and address pin input
*/
function fillAdressData() {
  const $ = jQuery;

  if (addressData && addressData.pin) {
    $(AddrPin.inputSel).val(addressData.pin);
    $(Addr.inputSel).val(addressData.fullAddress);
  }
  else {
    $(NoAddressErrSel).removeClass(HiddenClass);
  }
}

/**
* Validate the form, and if it's valid, go to the second signup page after
* storing the data in sessionStorage.
*/
function continueSignup(submitEvent) {
  const $ = jQuery;

  submitEvent.preventDefault();

  var formValues = {
    pin: addressData ? addressData.pin : '',
    email: $(Email.inputSel).val(),
    firstName: $(FirstName.inputSel).val(),
    lastName: $(LastName.inputSel).val(),
    phone: $(Phone.inputSel).val()
  };

  // Add addressData into formValues for simplicity
  Object.assign(formValues, addressData);

  const isFormValid = Inputs.map(input => {
    const value = $(input.inputSel).val();
    const inputValid = input.validator(value);

    if (inputValid) {
      $(input.errorSel).addClass(InlineHiddenClass);
    }
    else {
      $(input.errorSel).removeClass(InlineHiddenClass);
    }

    return inputValid;
  }).every(isValid => isValid === true);

  if (isFormValid) {
    sessionStorage.setItem(
      SessionStorageKeys.SignupData,
      JSON.stringify(formValues));

    // Redirect to step 3 of signup
    location.href = NextUrl;
  }
  else {
    $(FieldsMissingErrSel).removeClass(HiddenClass);
  }
}

function validateEmail(email) {
  var emailRegex = /^([\w-\.]+@([\w-]+\.)+[\w-]{2,4})?$/;

  return Boolean(email) && emailRegex.test(email);
}

function validatePhone(phone) {
  var phoneRegex = /^\d{10}$/; // Confirm 10 digits ONLY

  return Boolean(phone) && phoneRegex.test(phone);
}

function validateFilled(input) {
  return Boolean(input);
}
