import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const capabilitiesEndpoint = "/api/v1/capabilities";

/**
 * Generates the register capabilities request payload object
 * @param {Object} req - Express request object containing capabilities data in body
 * @returns {Object} Payload object from request body
 */
function generateRegisterCapabilitiesPayload(req) {
  return req.body;
}

/**
 * Sends a PATCH request to the Salesforce register capabilities API
 * @param {Object} req - Express request object containing capabilities data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendPatchRegisterCapabilitiesAPIRequest(req, requestHeader) {
    
  const requestPayload = generateRegisterCapabilitiesPayload(req);
  const requestId = requestHeader.headers.RequestId;
  logger.info(`PATCH /capabilities API with requestId ${requestId} and request payload: `, requestPayload);
  const capabilitiesApiUrl = generateApiUrl(settingsCache, capabilitiesEndpoint);

  try {
    const response = await axios.patch(
      capabilitiesApiUrl,
      JSON.stringify(requestPayload),
      requestHeader
    );
    logger.info(`PATCH /capabilities API with requestId ${requestId} completed successfully: `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`PATCH /capabilities API with requestId ${requestId} has error: `, responseData);
    return responseData;
  }
}