import axios from 'axios';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXml = promisify(parseString);

const {
  SF_INSTANCE_URL,
  SF_SUBJECT,
  SF_PASSWORD,
  API_VERSION
} = process.env;

/**
* Function to get Salesforce access token using SOAP API
* @returns {Promise<string>} - The Salesforce session ID (access token)
* @throws {Error} - Throws an error if required environment variables are missing or if the request fails
*/
export async function getAccessToken() {

  if (!SF_INSTANCE_URL || !SF_SUBJECT || !SF_PASSWORD || !API_VERSION) {
    throw new Error('Missing required environment variables');
  }

  // Construct te SOAP API URL and SOAP envelope
  const soapUrl = `${SF_INSTANCE_URL}/services/Soap/u/${API_VERSION}`;
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8" ?><env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><n1:login xmlns:n1="urn:partner.soap.sforce.com"><n1:username>${SF_SUBJECT}</n1:username><n1:password>${SF_PASSWORD}</n1:password></n1:login></env:Body></env:Envelope>`;

  try {
    // Make the SOAP request to Salesforce
    const response = await axios.post(soapUrl, soapEnvelope, {
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': 'login'
      },
    });

    // Parse the XML response.
    const result = await parseXml(response.data);

    if (result['soapenv:Envelope'] && 
        result['soapenv:Envelope']['soapenv:Body'] && 
        result['soapenv:Envelope']['soapenv:Body'][0] && 
        result['soapenv:Envelope']['soapenv:Body'][0]['loginResponse']) {
      return result['soapenv:Envelope']['soapenv:Body'][0]['loginResponse'][0]['result'][0]['sessionId'][0];
    } else {
      throw new Error('Unexpected response structure from Salesforce');
    }
  } catch (error) {
    console.error('Error getting Salesforce access token');
    throw error;
  }
}