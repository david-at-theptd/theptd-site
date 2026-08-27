/**
* The JS for the last sign up step, the signature step
*/

/**
* PluginData is set inline (see sign-up-signature.html) and should be an
* object containing a nextUrl, the URL to the next signup step, and a
* lookupUrl that is the URL to the property lookup step.
*/
const NextUrl = PluginData.nextUrl || 'confirmation.html';
const LookupUrl = PluginData.lookupUrl || '/';

/**
* API Paths - UNCHANGED, same backend as the live site
*/
const SignupUrl =
  'https://propertytax123.com/rackforms/output/forms/pt123/insertClient.php';

const ExpDateRegex = /^\d{2}\/\d{2}\/\d{4}$/; // Matches MM/DD/YYYY exactly
const ShortDateRegex = /^\d{2}\/\d{2}\/\d{2}$/; // Matches MM/DD/YY exactly
const TwoNamesRegex = /[a-zA-Z][a-zA-Z]\s[a-zA-Z][a-zA-Z]/; // Requires first and last name

/** The minimum number of points required for a valid drawn signature. This
just needs to filter out a literal single tap/click - real signatures, even
very quick or simple ones, clear this easily. (Lowered from the original 10,
which was rejecting legitimate short signatures and showing the same error
as a truly empty signature pad, making it look like a bug.) */
const MinSignaturePoints = 3;

/** The size we consider mobile, under which we clear the signature pad on
resize */
const MobileWidth = 800;

/**
* Local state vars
*/
var signatureCanvas;
var signaturePad;
var docsToShow;

// Store current signature pad width and height so we can tell if a resize
// should clear the signature. On mobile, vertical resizes happen all the time
// as the user scrolls and the browser hides the URL bar or as the keyboard is
// opened, but these won't change the dimensions of the signature pad
var currSignatureWidth;
var currSignatureHeight;

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

    // A string representing which overlay is being shown
    currOverlay: null,

    // The current document being shown in the overlay
    currDocument: null,

    documents: [],

    // The actual data form the <form>. Any key is allowed, but EXCEPT for
    // default values, these can be all set via the v-model attribute in HTML
    formData: {
      acceptLawyer: true
    },

    // Error object
    formErrors: {
      signature: false,
      signup: false,
      prevSteps: false
    },

    // Fields that aren't passed to the BE, like accepting terms
    otherFields: {
      agreeTerms: false,
      agreeFee: false
    },

    overlayOpen: false,

    // Whether we're currently submitting the form, which disables the submit
    // and shows the loading spinner
    submitting: false
  },
  // Expose functions to Vue
  methods: {
    clearSignature: clearSignature,
    closeOverlay: closeOverlay,
    drawTextSignature: drawTextSignature,
    formatDate: formatDate,
    formatDollars: formatDollars,
    openDisclosure: openDisclosure,
    openLawyerWarning: openLawyerWarning,
    openOverlay: openOverlay,
    openTerms: openTerms,
    undoSignatureStroke: undoSignatureStroke,
    usePtdLawyer: usePtdLawyer,
    validateAndSubmitForm: validateAndSubmitForm,
    viewDocument: viewDocument
  }
});

jQuery(document).ready(($) => {
  loadSignupData(); // declared in main.js
  loadDocs();

  if (!signupData) {
    vueApp.formErrors.prevSteps = true;
  }

  signatureCanvas = $('#signature-canvas')[0];

  // Instantiate a new SignaturePad object. Learn more here:
  // https://github.com/szimek/signature_pad#usage
  signaturePad = new SignaturePad(signatureCanvas, {
    minWidth: 1,
    maxWidth: 3,
  });

  // Load signature pad dimensions for tracking resize changes
  currSignatureWidth = signatureCanvas.offsetWidth;
  currScreenHeight = signatureCanvas.offsetHeight;

  resizeCanvas();
});

jQuery(window).resize((resizeEvent) => {
  handleResizeForSignature();
});

/**
* Handle a screen resize by checking if the signature pad changed sized, which
* requires resizing the canvas
*/
function handleResizeForSignature() {
  // If we haven't loaded the signature pad, there's nothing to handle
  if (!signatureCanvas) { return; }

  const newWidth = signatureCanvas.offsetWidth;
  const newHeight = signatureCanvas.offsetHeight;

  // Since the signature pad is only width locked and only on mobile, we only
  // need to resize it if the dimensions changed by more than 2px. This is to
  // account for jitter or tiny resizes which don't matter for the canvas
  if (Math.abs(newWidth - currSignatureWidth) > 2
    || Math.abs(newHeight - currSignatureHeight) > 2) {
    resizeCanvas();
  }

  currSignatureWidth = newWidth;
  currScreenHeight = newHeight;
}

/**
* Figure out which documents to show based on the user's county and set it in
* the Vue app.
*/
function loadDocs() {
  const county = signupData ? signupData.county : undefined;

  // Filter to only documents appropriate for the property by county
  vueApp.documents = DocsToSign.filter(doc => {
    if (doc.excludeCounty && county === doc.excludeCounty) {
      return false;
    }
    else if (doc.onlyCounty && county !== doc.onlyCounty) {
      return false;
    }
    else {
      return true;
    }
  });

  // Prepend the DocsPrefix to each doc's filename so it's a valid URL
  vueApp.documents.forEach(doc => doc.filename = DocsPrefix + doc.filename);
}

/**
* Adjust canvas coordinate space taking into account pixel ratio,
* to make it look crisp on mobile devices. This also causes canvas to be
* cleared.
*/
function resizeCanvas() {
  // When zoomed out to less than 100%, for some very strange reason,
  // some browsers report devicePixelRatio as less than 1
  // and only part of the canvas is cleared then.
  var ratio = Math.max(window.devicePixelRatio || 1, 1);
  signatureCanvas.width = signatureCanvas.offsetWidth * ratio;
  signatureCanvas.height = signatureCanvas.offsetHeight * ratio;
  signatureCanvas.getContext("2d").scale(ratio, ratio);

  // Clear the signature so signaturePad doesn't think there's still a valid
  // signature. Otherwise validation succeeds
  clearSignature(false);

  // Redraw the text signature so that they don't have to change the typed
  // signature field after a resize when their name has not changed
  drawTextSignature();
}

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

/**
* Undoes one stroke in the signature field - used in the HTML via Vue
*/
function undoSignatureStroke() {
  var data = signaturePad.toData();

  if (data) {
    data.pop(); // remove the last dot or line
    signaturePad.fromData(data);
  }
}

/**
* Clears the signature field - used in the HTML via Vue. By default this clears
* the typed signature so they can't type a signature, hit clear and then submit
* the form.
*/
function clearSignature(clearTyped = true) {
  signaturePad.clear();

  if (clearTyped) {
    vueApp.otherFields.typedSignature = null;
  }
}

function drawTextSignature(inputChangeEvent) {
  // If the field changed but is undefined or null, do nothing
  if (typeof vueApp.otherFields.typedSignature !== 'string') {
    return;
  }

  var context = signatureCanvas.getContext('2d');

  const width = signatureCanvas.clientWidth;
  const height = signatureCanvas.clientHeight;

  const windowWidth = window.outerWidth;

  const fontSizePx = 60;
  const fontFamily = 'Alex Brush'

  const leftPadding = 25;

  context.font = fontSizePx + 'px ' + fontFamily;
  context.clearRect(0, 0, width, height);

  // Draw the actual typed text
  context.fillText(
    vueApp.otherFields.typedSignature,
    leftPadding,
    height - fontSizePx * 0.9,
    width - leftPadding * 2);
}

function openOverlay(overlayKey) {
  vueApp.overlayOpen = true;
  vueApp.currOverlay = overlayKey;

  toggleBodyFocusable(false);
}

function closeOverlay() {
  vueApp.overlayOpen = false;

  toggleBodyFocusable(true);
}

function openDisclosure() {
  openOverlay('disclosure');
}

function openTerms() {
  openOverlay('terms');
}

function openLawyerWarning() {
  openOverlay('lawyer-warning');
}

function viewDocument(docToView) {
  vueApp.currDocument = docToView;
  openOverlay('document');
}

function usePtdLawyer() {
  vueApp.formData.acceptLawyer = true;

  closeOverlay();
}

function validateAndSubmitForm(submitEvent) {
  submitEvent.preventDefault();

  var anyErrors = false;

  if (this.otherFields.agreeFee && this.otherFields.agreeTerms) {
    this.formErrors.accept = false;
  }
  else {
    this.formErrors.accept = true;
    anyErrors = true;
  }

  // Above logic was causing problems when someone initially signed, then without clearing the signature pad
  // proceeded to type their signature. Split it out into two separate checks. David Jo - 3/23/2022
  this.formErrors.signature = false;

  if (!signaturePad.isEmpty() && !hasDrawnSignature()) {
    this.formErrors.signature = true;
    anyErrors = true;
    console.log('Invalid drawn signature');
  }

  if (vueApp.otherFields.typedSignature && !hasValidTypedSignature()) {
    this.formErrors.signature = true;
    anyErrors = true;
    console.log('Invalid typed signature');
  }

  if (signaturePad.isEmpty() && !vueApp.otherFields.typedSignature){
    this.formErrors.signature = true;
    anyErrors = true;
    console.log('Both signatures missing');
  }

  this.formErrors.any = anyErrors;

  // Clone the formErrors so that Vue detects changes, as otherwise internal
  // changes to an object don't trigger UI updates
  this.formErrors = Object.assign({}, this.formErrors);

  // If there's no errors and the previous steps are done, submit signup
  if (!anyErrors && signupData) {
    submitSignup();
  }
}

function hasDrawnSignature() {
  // Each stroke is a separate array of point groups, so we combine those to get
  // an array of all point groups, which we then count
  const pointGroupsCount = [].concat.apply([], signaturePad.toData()).length;
  return !signaturePad.isEmpty() && pointGroupsCount > MinSignaturePoints;
}

function hasValidTypedSignature(){
  const typedSignature = vueApp.otherFields.typedSignature;
  const matches = TwoNamesRegex.test(typedSignature);
  return !typedSignature=='' && matches;
}

/**
* Called by Vue
*/
function submitSignup() {
  vueApp.submitting = true;

  const dataToSubmit = Object.assign({}, vueApp.formData, signupData);

  dataToSubmit.signature = signaturePad.toDataURL();

  // Send over the client PIN ID from pulling savings on step 1
  dataToSubmit.cmd_client_pin_id =
    sessionStorage.getItem(SessionStorageKeys.ClientPin);

  // Also send the access code they used to unlock the site
  dataToSubmit.accessCode =
    sessionStorage.getItem(SessionStorageKeys.AccessCode);

  const isRegistrationOnly
    = sessionStorage.getItem(SessionStorageKeys.IsRegistrationOnly) === 'true';

  if (isRegistrationOnly) {
    dataToSubmit.registrationOnly = true;
  }

  // Prices in the UI are like '$121,300.00' and dates are like '02/01/2020'
  // while the BE wants these like '121300.00' and '2020-02-01' respectively
  if (dataToSubmit.appraisalAmt) {
    dataToSubmit.appraisalAmt = dataToSubmit.appraisalAmt.replace(/[$,]/g, '');
  }

  if (dataToSubmit.purchasePrice) {
    dataToSubmit.purchasePrice = dataToSubmit.purchasePrice.replace(/[$,]/g, '');
  }

  if (dataToSubmit.purchaseDate) {
    dataToSubmit.purchaseDate =
      dataToSubmit.purchaseDate.substring(6) /* year */ + '-' +
      dataToSubmit.purchaseDate.substring(0, 2) /* month */ + '-' +
      dataToSubmit.purchaseDate.substring(3, 5) /* day */
  }

  const wrappedData = { jsonData: JSON.stringify(dataToSubmit) };

  // Wrap in a jsonData key
  jQuery.post(SignupUrl, wrappedData)
    .done(handleSignupResponse)
    .fail(showSignupError);
}

/** Parse the BE signup response and check if the request succeeded */
function handleSignupResponse(response) {
  var parsedResponse;

  try {
    parsedResponse = jQuery.parseJSON(response);
  }
  catch (error) {
    // Parse errors are swallowed - the original always forces success below
  }

  // The signup only worked if we get a success back
  if (parsedResponse && parsedResponse[0][0] === 'success') {
    sessionStorage.setItem(
      SessionStorageKeys.SignupResponse,
      JSON.stringify(parsedResponse[0]));

    showSignupSuccess();
  }
  else {
    // Forcing success message due to some change preventing a valid JSON to come back
    sessionStorage.setItem(
      SessionStorageKeys.SignupResponse,
      'success');
    showSignupSuccess();
  }
}

/** Show signup success or redirect */
function showSignupSuccess() {
  vueApp.submitting = false;
  vueApp.formErrors.signup = false;

  // Redirect to the confirmation page
  location.href = NextUrl;
}

/** Show signup error */
function showSignupError() {
  vueApp.submitting = false;
  vueApp.formErrors.signup = true;
}
