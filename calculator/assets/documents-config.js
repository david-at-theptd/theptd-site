/**
* This file is specifically for configuring the PDF docs shown to a user that
* they are required to sign.
*/

/**
* PluginData is set inline (see sign-up-signature.html) and should be an
* object containing a key pluginUrl with a value corresponding to the path we
* need to prefix to a file name to get the file in our documents folder.
*/
const PluginUrl = PluginData.pluginUrl || '';

/*
*
* The array of documents that need to be signed. Each of these should have the
* following properties:
*
* - filename: string - the actual PDF filename in this directory
* - name: string - the human readable name to show when reviewing this document
* - onlyCounty: string
* - excludeCounty: string
*/
const DocsToSign = [{
  name: 'Cook County Board of Review Attorney Authorization',
  filename: 'Cook County Board of Review Form.pdf',
  onlyCounty: 'COOK'
}, {
  name: 'Standard Attorney Authorization Form',
  filename: 'Standard Attorney Authorization Form.pdf',
  excludeCounty: 'COOK'
}, {
  name: 'Our Agreement',
  filename: 'ThePTD_Residential_Agreement.pdf'
}]

/**
* The prefix to go from the signup root to the documents
*/
const DocsPrefix = PluginUrl + 'docs/';
