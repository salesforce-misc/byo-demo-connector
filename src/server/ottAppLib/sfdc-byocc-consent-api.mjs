import axios from 'axios';
import NodeCache from "node-cache" ;
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const consentEndpoint = "/api/v1/consent";

/**
 * Generates the consent request payload object
 * @param {Object} req - Express request object containing consent data in body
 * @returns {Object} Payload object with endUserClientId, channelAddressIdentifier, and consentStatus
 */
function generateConsentPayload(req) {
  return {
    "endUserClientId" : req.body.endUserClientIdentifier,
    "channelAddressIdentifier" : req.body.channelAddressIdentifier,
    "consentStatus" : req.body.consentStatus
  };
}

/**
 * Sends a PATCH request to the Salesforce consent API to update consent status
 * @param {Object} req - Express request object containing consent data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendConsentAPIRequest(req, requestHeader) {
    
  const requestPayload = generateConsentPayload(req);
  const requestId = requestHeader.headers.RequestId;
  logger.info(`PATCH /consent API with requestId ${requestId} and request payload: `, requestPayload);
  const consentApiUrl = generateApiUrl(settingsCache, consentEndpoint);

  try {
    const response = await axios.patch(
      consentApiUrl,
      JSON.stringify(requestPayload),
      requestHeader
    );
    logger.info(`PATCH /consent API with requestId ${requestId} completed successfully: `, response.data);      
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`PATCH /consent API with requestId ${requestId} has error: `, responseData);
    return responseData;
  }
}