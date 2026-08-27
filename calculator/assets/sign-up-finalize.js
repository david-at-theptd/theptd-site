/**
* The JS code for the 2nd signup step (excluding the homepage/intro)
*/

/**
* PluginData is set inline (see sign-up-finalize.html) and should be an object
* containing a nextUrl, the URL to the next signup step, and a lookupUrl that
* is the URL to the property lookup step.
*/
const NextUrl = PluginData.nextUrl || 'sign-up-signature.html';
const LookupUrl = PluginData.lookupUrl || '/';

/**
* API Paths
*/
const SignupUrl =
  'https://propertytax123.com/rackforms/output/forms/pt123/insertClient.php';

const ExpDateRegex = /^\d{2}\/\d{2}\/\d{4}$/; // Matches MM/DD/YYYY exactly
const ShortDateRegex = /^\d{2}\/\d{2}\/\d{2}$/; // Matches MM/DD/YY exactly

var vueApp = new Vue({
  el: '#app-root',
  // Jekyll uses Liquid, which would interpret {{ }} on compile time, so we move
  // Vue to use (( )) instead
  delimiters: ["((", "))"],
  data: {
    // Expose LookupUrl constant
    LookupUrl: LookupUrl,

    // Expose PriceShare constant from main.js
    PriceShare: PriceShare,

    // The actual data form the <form>. Any key is allowed, but EXCEPT for
    // default values, these can be all set via the v-model attribute in HTML
    formData: {},

    // Error object
    formErrors: {
      details: false,
      prevSteps: false
    },
  },
  // Expose functions to Vue
  methods: {
    formatDate: formatDate,
    formatDollars: formatDollars,
    validateAndSubmitForm: validateAndSubmitForm
  }
});

jQuery(document).ready(() => {
  loadSignupData(); // declared in main.js

  if (!signupData) {
    vueApp.formErrors.prevSteps = true;
  }
});

function formatDate(fieldKey) {
  const origValue = vueApp.formData[fieldKey];
  var parsedValue;

  // If empty or already matching our format, do nothing
  if (!origValue || ExpDateRegex.test(origValue)) {
    return;
  }

  // If a short date like 08/01/19, just add '20' to make it 08/01/2019
  if (ShortDateRegex.test(origValue)) {
    parsedValue = origValue.substring(0, 6) + '20' + origValue.substring(6);
  }
  // If 8 digits with no slashes, just add them (e.g. 08012018 -> 08/01/2020)
  else if (!origValue.includes('/') && origValue.length === 8) {
    parsedValue = origValue.substring(0, 2) + '/' + origValue.substring(2, 4) + '/'
      + origValue.substring(4);
  }
  // If 6 digits with no slashes, add them and assume the year is in the 2000s
  // (since it should be within the past three years)
  else if (!origValue.includes('/') && origValue.length === 6) {
    parsedValue = origValue.substring(0, 2) + '/' + origValue.substring(2, 4) + '/'
      + '20' + origValue.substring(4);
  }

  vueApp.formData[fieldKey] = parsedValue;
}

function formatDollars(fieldKey) {
  const origValue = vueApp.formData[fieldKey];

  if (!origValue) {
    return;
  }

  // Remove anything that's not a '.' or a digit
  cleanedValue = origValue.replace(/[^\d.]/g, '');

  var parsedValue = parseFloat(cleanedValue);

  // If there were no numeric characters, return an empty string
  if (isNaN(parsedValue)) {
    parsedValue = '';
  }
  else {
    parsedValue = '$' + parsedValue.toLocaleString();
  }

  vueApp.formData[fieldKey] = parsedValue;
}

function validateAndSubmitForm(submitEvent) {
  submitEvent.preventDefault();

  var anyErrors = false;

  // If the user was appraised recently, they have to specify the amount
  var appraisalPartiallyFilled = this.formData.appraisedRecently === 'Y'
    && !this.formData.appraisalAmt;

  // Similarly, if the purchased recently, they have to provide the date & amount
  var purchasePartiallyFilled = this.formData.purchasedRecently === 'Y'
    && !this.formData.purchasePrice
    && !this.formData.purchaseDate;

  if (this.formData.appraisedRecently
    && this.formData.over65
    && this.formData.primaryResidence
    && this.formData.purchasedRecently
    && this.formData.consideringSelling
    && !purchasePartiallyFilled
    && !appraisalPartiallyFilled) {
    this.formErrors.details = false;
  }
  else {
    this.formErrors.details = true;
    anyErrors = true;
  }

  this.formErrors.any = anyErrors;

  // Clone the formErrors so that Vue detects changes, as otherwise internal
  // changes to an object don't trigger UI updates
  this.formErrors = Object.assign({}, this.formErrors);

  console.log(Object.assign({}, vueApp.formData, signupData));

  // If there's no errors and the previous steps are done, submit signup
  if (!anyErrors && signupData) {
    continueSignup();
  }
}

/** Store new formData in sessionStorage & redirect to signature page */
function continueSignup() {
  const newSignupData = Object.assign({}, vueApp.formData, signupData);

  sessionStorage.setItem(
    SessionStorageKeys.SignupData,
    JSON.stringify(newSignupData));

  // Redirect to the last step of signup, the signature page
  location.href = NextUrl;
}
