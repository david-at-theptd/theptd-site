/**
* JS that is unique to the index page (where you lookup your property)
*
* Allowed URL params:
* - code - an access code to pre-fill in the access modal
* - addr - an address to pre-fill the property lookup and auto lookup taxes
* - phone - a phone number to pre-fill in the signup step
*
* NOTE: Typically in jQuery we can make calls like $('div.class'), but in
* Wordpress that's not allowed to prevent library issues. We thus use
* jQuery('div.class') instead or manually declare $ (via `const $ = jQuery`).
*/

/**
* PluginData is set inline (see index.html) and should be an object containing
* a key nextUrl with a value corresponding to the full URL that is the next
* signup step.
*/
const NextUrl = PluginData.nextUrl || 'sign-up.html';

/**
* API Paths - UNCHANGED, same backend as the live site. GitHub Pages can't
* run PHP, so this calls propertytax123.com directly again (relying on its
* CORS settings for whatever domain this ends up deployed to) rather than
* going through the /api/ proxy.
*/
const AccessCodeUrl =
  'https://propertytax123.com/rackforms/output/forms/pt123/execValidateCode.php';

const SearchAddressUrl =
  'https://propertytax123.com/rackforms/output/forms/pt123/searchAddress.php';

const SavingsUrl =
  'https://propertytax123.com/rackforms/output/forms/pt123/execAutoComp.php';

const PinFromAddressUrl =
  'https://propertytax123.com/rackforms/output/forms/pt123/getPinFromAddress.php';

/**
* HTML Selectors
*/

// Forms & inputs
const AccessCodeFormSel = '#access-code-form';
const AccessCodeInputSel = '#access-code';
const AccessCodeErrSel = '#access-code-err';

const LookupFormSel = '#check-prop-form';
const AddressInputSel = '#addr-input';
const SignUpBtn = '.sign-up-btn';
const AddrLoaderSel = '#addr-loader';
const BackBtnSel = '.back-btn';

// Containers
const OverlaySel = '#overlay';
const SavingsContSel = '#savings-cont';
const NoSavingsContSel = '#no-savings-cont';

// Outputs - filled by BE data
const CurrentTaxOutSel = '.current-tax-out';
const PredictedTaxOutSel = '.predicted-out';
const ReassessmentYearsOutSel = '.reassess-years-out';
const SavingsOutSel = '.savings-out';
const TotalSavingsOutSel = '.savings-tot-out';

// Graph selectors
const CurrentBarSel = '#current-bar';
const FutureBarSel = '#future-bar';

// Common classes & selectors
const HiddenClass = 'hidden';
const LoadingSel = '.loading';

/**
* Error matchers - the FE searches BE error strings for these to handle these
* errors in unique ways
*/
const ClosedDeadlineMatchStr = 'is closed';

/**
* Global State
*/

// The full current address from the BE
var currentAddress;
var accessCode;
var fullAddress;

const DefaultSavingsErrorMsg =
  'Oh no, something went wrong pulling your potential savings! Try again later.';

var vueApp = new Vue({
  el: '#app-root',
  // Jekyll uses Liquid, which would interpret {{ }} on compile time, so we move
  // Vue to use (( )) instead
  delimiters: ["((", "))"],
  data: {
    isCalculating: false,

    errors: {
      address: false,
      isClosed: false,
      savings: false,
    },

    errorText: DefaultSavingsErrorMsg,
  }
});

jQuery(document).ready(function($) {
  // Clear all sessionStorage to ensure any old data is gone
  sessionStorage.clear();

  $(AccessCodeFormSel).submit(checkAccessCode);

  $(LookupFormSel).submit(checkTax);
  $(SignUpBtn).click(gotoSignup);
  $(BackBtnSel).click(backToLookup);

  $(AddressInputSel).keypress(function() {
    // Clear address on keypress, since that means user overwrote what came from
    // autocomplete
    currentAddress = null;
  });

  // Setup autocomplete
  $(AddressInputSel).autocomplete({
    source: SearchAddressUrl,
    minLength: 2,
    select: function(event, ui) {
      currentAddress = ui.item.value;
    }
  });

  // Load query params into the global queryParamsMap
  parseQueryParams();

  // If the URL contains an access code via ?code=SOMECODE, load it in and check
  // it
  if (queryParamsMap.code) {
    $(AccessCodeInputSel).val(queryParamsMap.code);
    $(AccessCodeFormSel).submit();
  }

  // If address is specified set the field and run lookup
  if (queryParamsMap.addr) {
    currentAddress = queryParamsMap.addr;

    $(AddressInputSel).val(currentAddress);
    $(LookupFormSel).submit();
  }
});

/**
* Shows or hides the access code overlay and disables tabbing in any other
* elements.
*/
function toggleOverlay(show = false) {
  const $ = jQuery;

  const MainInteractiveElemSel
    = '#page-content button, #page-content input, #page-content a';

  if (show) {
    $(OverlaySel).fadeIn();
  }
  else {
    $(OverlaySel).fadeOut();
  }

  toggleBodyFocusable(!show);
}

/**
* Call the BE to check the user access code and hide the overlay if it's
* correct.
*/
function checkAccessCode(submitEvent) {
  const $ = jQuery;

  submitEvent.preventDefault();

  accessCode = $(AccessCodeInputSel).val();

  // Store the code in sessionStorage to pass along with signup
  sessionStorage.setItem(SessionStorageKeys.AccessCode, accessCode);

  // Show the overlay loading spinner
  $(OverlaySel).find(LoadingSel).removeClass(HiddenClass);

  $.post(AccessCodeUrl, { code: accessCode })
    .done(parseAccessCodeResponse)
    .fail(showAccessCodeError);
}

/**
* Process the result from checking the access code
*/
function parseAccessCodeResponse(accessCodeData) {
  const $ = jQuery;

  var parsedData;

  try {
    parsedData = $.parseJSON(accessCodeData);
  }
  catch (error) {
    console.error('JSON parse error', error);
  }

  if (parsedData && parsedData[0].code_status === 'success') {
    $(AccessCodeErrSel).addClass(HiddenClass);
    toggleOverlay();
  }
  else {
    showAccessCodeError();
  }
}

function showAccessCodeError() {
  const $ = jQuery;

  $(AccessCodeErrSel).removeClass(HiddenClass);
  $(OverlaySel).find(LoadingSel).addClass(HiddenClass);
}

function backToLookup() {
  const $ = jQuery;

  $(SavingsContSel).slideUp();
  $(NoSavingsContSel).slideUp();
  $(LookupFormSel).slideDown();
}

/**
* Call the BE to check the tax value based on the current address - this
* function just pulls the property PIN though, which we need later
*/
function checkTax(submitEvent) {
  const $ = jQuery;

  if (submitEvent) {
    submitEvent.preventDefault();
  }

  // If the user didn't pick an address through autocomplete, return and show
  // an error
  if (!currentAddress) {
    vueApp.errors.address = true;

    return;
  }
  else {
    vueApp.errors.address = false;
  }

  fullAddress = currentAddress.substr(0, currentAddress.indexOf('('));
  console.log('Current Address:', currentAddress);
  console.log('Full Address:', fullAddress);

  var callIt = $.get(PinFromAddressUrl, { 'fullAddress': fullAddress })
    .done(processPropertyPin)
    .fail(showSavingsError);

  // Show address loader & hide any past errors
  vueApp.isCalculating = true;
  vueApp.errors.savings = false;
}

function processPropertyPin(propertyPinData) {
  var parsedData;

  try {
    parsedData = jQuery.parseJSON(propertyPinData);
  }
  catch (error) {
    console.error('JSON parse error', error);
  }

  if (!parsedData) {
    showSavingsError();
    return;
  }

  const response = parsedData[0];
  const addrPin = response.PIN_With_Dashes;
  const addrCounty = response.County_Name;

  const AddrData = {
    pin: addrPin,
    county: addrCounty,
    fullAddress: fullAddress
  };

  // Store address pin for signup steps
  sessionStorage.setItem(SessionStorageKeys.AddrData, JSON.stringify(AddrData));

  fetchSavings(addrPin, addrCounty);
}

/**
* Given the PIN for the user's property address and its county, fetch the
* potential tax savings.
*/
function fetchSavings(addrPin, addrCounty) {
  const $ = jQuery;

  const currentYear = (new Date()).getFullYear();

  const data = {
    companyId: 0,
    inputPIN: addrPin,
    inputCounty: addrCounty,
    inputUserId: '',
    inputYear: currentYear
  }

  var callIt = $.get(SavingsUrl, data)
    .done(processSavings)
    .fail(showSavingsError);
}

function processSavings(savingsData) {
  const $ = jQuery;

  var parsedData;

  try {
    parsedData = $.parseJSON(savingsData);
  }
  catch (error) {
    console.error('JSON parse error', error);
  }

  if (!parsedData) {
    showSavingsError();
    return;
  }

  const response = parsedData[0];

  if (response.error_message) {
    showSavingsError(response.error_message);
    return;
  }

  // Store the client PIN for later
  sessionStorage.setItem(SessionStorageKeys.ClientPin,
    response.cmd_client_pin_id);

  // Convert string with commas to integer (e.g. '6,093' -> 6093)
  const parsedCurrTax = parseInt(response.EstCurTax.replace(/,/g, ''))
  const parsedNewTax = parseInt(response.EstNewTax.replace(/,/g, ''))

  // Hide loader and any existing savings error
  vueApp.isCalculating = false;
  vueApp.errors.savings = false;

  const hasSavings = parsedNewTax > 0 && parsedNewTax < parsedCurrTax;

  // Store whether the user has potential savings to see if we ask for payment
  sessionStorage.setItem(SessionStorageKeys.HasSavings, hasSavings);

  // Show savings graph if we have tax data and the user will save money
  if (hasSavings) {
    showSavings(parsedCurrTax, parsedNewTax, response.yearsLeft);
  } else {
    showNoSavings();
  }
}

/**
* Show an error occurred with savings
*/
function showSavingsError(error) {
  var errorText = DefaultSavingsErrorMsg;

  if (typeof error === 'string') {
    errorText = error;

    // If the deadline is closed,
    if (errorText.includes(ClosedDeadlineMatchStr)) {
      showNoSavings(true);
      return;
    }
  }

  vueApp.isCalculating = false;
  vueApp.errors.savings = true;
  vueApp.errorMsg = errorText;
}

/**
* Show the user their potential savings based on our estimates of their current
* tax and predicted tax as well as the years till their next assessment.
*/
function showSavings(currentTax, predictedTax, yearsTillReasses) {
  const $ = jQuery;

  // Hide no savings message
  $(NoSavingsContSel).addClass(HiddenClass);

  // Hide lookup form
  $(LookupFormSel).slideUp();

  // if yearsTillReasses is 0, set it 1
  yearsTillReasses = yearsTillReasses || 1;

  // Computed values
  const savings = currentTax - predictedTax;
  const totalSavings = savings * yearsTillReasses;

  /**
  * NOTE: I use Number's toLocaleString to add commas.
  *
  * Ex: (1000).toLocaleString() yields "1,000" in the US, but this respects
  * language settings
  */
  $(CurrentTaxOutSel).text(currentTax.toLocaleString());
  $(PredictedTaxOutSel).text(predictedTax.toLocaleString());
  $(ReassessmentYearsOutSel).text(yearsTillReasses);
  $(SavingsOutSel).text(savings.toLocaleString());
  $(TotalSavingsOutSel).text(totalSavings.toLocaleString());

  $(SavingsContSel).removeClass(HiddenClass);
  $(SavingsContSel).hide();
  $(SavingsContSel).slideDown();

  graphSavings(currentTax, predictedTax);
}

/**
* Hide any old savings and show no savings message. Typically for just no
* savings but can also be for the deadline being closed.
*/
function showNoSavings(isClosed = false) {
  const $ = jQuery;

  vueApp.errors.isClosed = isClosed;

  // Hide lookup form
  $(LookupFormSel).slideUp();

  $(NoSavingsContSel).removeClass(HiddenClass);
  $(NoSavingsContSel).slideDown();
  $(SavingsContSel).addClass(HiddenClass);
}

/**
* Draw the savings graph
*/
function graphSavings(currentTax, predictedTax) {
  const $ = jQuery;

  const MaxHeight = 150; // the max-height in px we want the graph to be
  const GraphMult = MaxHeight / currentTax; // 1 / 30;

  setTimeout(() => {
    $(CurrentBarSel).height(currentTax * GraphMult);
    $(FutureBarSel).height(predictedTax * GraphMult);
  }, 300);
}

function gotoSignup(submitEvent) {
  submitEvent.preventDefault();

  sessionStorage.setItem(SessionStorageKeys.IsRegistrationOnly, vueApp.errors.isClosed);

  // Redirect to step 2 of signup
  location.href = NextUrl;
}
