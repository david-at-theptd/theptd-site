/**
* JS that is shared between all registration pages
*
* NOTE: Typically in jQuery we can make calls like $('div.class'), but in
* Wordpress that's not allowed to prevent library issues. We thus use
* jQuery('div.class') instead or manually declare $ (via `const $ = jQuery`).
*/

/**
* The share of what the user saves in the first year that we charge.
*
* For example, a value of '1/3' would output across pages like "our fee is only
* 1/3 of what we save you in the first year!"
*/
const PriceShare = '1/2';

/**
* Keys for writing into sessionStorage, so each page knows how to read from the
* previous page's data.
*/
const SessionStorageKeys = {
  /** The string access code the user used to access the site */
  AccessCode: 'access-code',

  /**
  * Object with keys pin: string, county: string, fullAddress: string,
  * This is the form data from step 1.
  *
  * NOTE: Must not overlap with SignupData since they get merged on step 2.
  */
  AddrData: 'addr-data',

  /** A string of numbers that is the client pin */
  ClientPin: 'client-pin',

  /** A string boolean ('true' or 'false') */
  HasSavings: 'has-savings',

  /**
  * A string boolean ('true' or 'false') - set to true if this signup is for a
  * deadline that has passed
  */
  IsRegistrationOnly: 'is-registration-only',

  /**
  * Object with keys:
  * acceptedTexts: boolean, pin: string,
  * email: string, firstName: string, lastName: string, phone: string
  *
  * AND the keys from AddrData
  */
  SignupData: 'signup-data',

  /**
  * The stringified signup response, which contains links to the final merged
  * PDF documents
  */
  SignupResponse: 'signup-response'
}

/**
* Global Vars
*/

// The current date as a string (e.g. 8/5/2020)
let currentDateStr;

// The data from any previous signup steps
let signupData;

// An object mapping query params to their values
let queryParamsMap;

jQuery(document).ready(($) => {
  // Set current copyright year in the footer
  const currTime = new Date();
  const currentYear = currTime.getFullYear();

  currentDateStr =
    `${currTime.getMonth() + 1}/${currTime.getDate()}/${currentYear}`;

  $('.curr-year').text(currentYear);

  $('button.tooltip').click(toggleTooltip);
});

function parseQueryParams() {
  const queryParmStr = window.location.search.substr(1); // strip '?'
  const paramsArr = queryParmStr.split('&');

  queryParamsMap = {};

  paramsArr.forEach(paramPair => {
    paramKeyAndVal = paramPair.split('=');

    // Run URI decoding to convert special chars (e.g. "%20" -> " ")
    queryParamsMap[paramKeyAndVal[0]] = decodeURIComponent(paramKeyAndVal[1]);
  })
}

function toggleTooltip() {
  jQuery(this).find('.tooltip-text').toggleClass('hidden');
}

/**
* Toggle whether the body is tabbable, which makes the overlay the only thing
* in the tab order, making it a focus trap
*/
function toggleBodyFocusable(focusable = false) {
  const $ = jQuery;

  // All interactive elements not ion the overlay
  const MainInteractiveElemSel
    = '.cont-wrapper button, .cont-wrapper input, .cont-wrapper a, .cont-wrapper textarea';

  if (!focusable) {
    $(MainInteractiveElemSel).attr('tabindex', '-1');
  }
  else {
    $(MainInteractiveElemSel).attr('tabindex', null);
  }
}

/**
* Try to pull and parse signupData from previos steps from storage
*/
function loadSignupData() {
  const $ = jQuery;
  const signupDataStr = sessionStorage.getItem(SessionStorageKeys.SignupData);

  try {
    signupData = $.parseJSON(signupDataStr);
  }
  catch (error) {
    console.error('Signup data JSON parse error', error);
  }
}
