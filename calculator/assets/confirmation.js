/**
* The JS for the signup confirmation page, which shows the signed documents
*/

/**
* PluginData is set inline (see confirmation.html) and should be an object
* containing a lookupUrl that is the URL to the property lookup step.
*/
const LookupUrl = PluginData.lookupUrl || '/';

var vueApp = new Vue({
  el: '#app-root',
  // Jekyll uses Liquid, which would interpret {{ }} on compile time, so we move
  // Vue to use (( )) instead
  delimiters: ["((", "))"],
  data: {
    // Expose LookupUrl constant
    LookupUrl: LookupUrl,

    /**
    * An array of documents to let the user view - should each be objects
    * containing name and url properties.
    */
    finalDocuments: [],

    signupData: {},

    errors: {
      noConfirmation: false
    }
  }
});

jQuery(document).ready(() => {
  //loadFinalDocuments();

  // Load signupData so we can show contact info and the property address
  loadSignupData();

  vueApp.signupData = signupData;
});

function loadFinalDocuments() {
  const storedDataStr =
    sessionStorage.getItem(SessionStorageKeys.SignupResponse);

  // If we don't have any stored signup data, show an error and don't try
  // parsing
  if (!storedDataStr) {
    vueApp.errors.noConfirmation = true;
    return;
  }

  try {
    parsedResponse = jQuery.parseJSON(storedDataStr);
  }
  catch (error) {
    console.error('Error parsing signup response JSON!', error);
  }

  // Check for each possible document and added it to the finalDocuments if we
  // have a URL for it
  if (parsedResponse.authorization_url) {
    vueApp.finalDocuments.push({
      name: 'Attorney Authorization',
      url: parsedResponse.authorization_url
    });
  }

  if (parsedResponse.agreement_url) {
    vueApp.finalDocuments.push({
      name: 'Our Agreement',
      url: parsedResponse.agreement_url
    });
  }
}
