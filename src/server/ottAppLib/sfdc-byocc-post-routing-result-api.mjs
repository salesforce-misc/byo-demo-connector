import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const routingResultEndpoint = "/api/v1/routingResult";

/**
 * Generates the routing result request payload object
 * @param {Object} req - Express request object containing routing result data in body
 * @returns {Object} Payload object with conversationIdentifier, routingType, workItemId, success, externallyRouted, and errorMessage
 */
function generateRoutingResultPayload(req) {
  return {
    "conversationIdentifier" : req.body.conversationIdentifier,
    "routingType": req.body.routingType,
    "workItemId": req.body.workItemId,
    "success": req.body.success,
    "externallyRouted": req.body.externallyRouted,
    "errorMessage": req.body.errorMessage
  };
}

/**
 * Sends a POST request to the Salesforce routing result API
 * @param {Object} req - Express request object containing routing result data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendPostRoutingResultAPIRequest(req, requestHeader) {
    
  const requestPayload = generateRoutingResultPayload(req);
  const requestId = requestHeader.headers.RequestId;
  logger.info(`POST /routingResult API with requestId ${requestId} and request payload: `, requestPayload);
  const routingResultApiUrl = generateApiUrl(settingsCache, routingResultEndpoint);

  try {
    const response = await axios.post(
      routingResultApiUrl,
      JSON.stringify(requestPayload),
      requestHeader
    );
    logger.info(`POST /routingResult API with requestId ${requestId} completed successfully: `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`POST /routingResult API with requestId ${requestId} has error: `, responseData);
    return responseData;
  }
}