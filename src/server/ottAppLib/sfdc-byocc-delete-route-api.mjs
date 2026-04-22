import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const deleteRouteEndpoint = "/api/v1/route";

/**
 * Generates the delete route request payload object
 * @param {Object} req - Express request object containing route data in body
 * @returns {Object} Payload object with conversationIdentifier and optionally cancelReason
 */
function generateDeleteRoutePayload(req) {
  const payload = {
    "conversationIdentifier" : req.body.conversationIdentifier
  };

  if (req.body.cancelReason != 'None') {
    payload["cancelReason"] = req.body.cancelReason;
  }

  return payload;
}

/**
 * Sends a DELETE request to the Salesforce route API to delete a route
 * @param {Object} req - Express request object containing route data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendDeleteRouteAPIRequest(req, requestHeader) {
    
  const requestPayload = generateDeleteRoutePayload(req);
  const requestId = requestHeader.headers.RequestId;
  logger.info(`DELETE /route API with requestId ${requestId} and request payload: `, requestPayload);
  const deleteRouteApiUrl = generateApiUrl(settingsCache, deleteRouteEndpoint);

  try {
    const response = await axios.delete(
      deleteRouteApiUrl,
      {
        data: requestPayload,
        headers: requestHeader.headers
      }
    );
    logger.info(`DELETE /route API with requestId ${requestId} completed successfully: `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`DELETE /route API with requestId ${requestId} has error: `, responseData);
    return responseData;
  }
}