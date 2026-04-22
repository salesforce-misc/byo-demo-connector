import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const routeEndpoint = "/api/v1/route";

/**
 * Generates the route request payload object
 * @param {Object} req - Express request object containing route data in body
 * @param {string} requestId - The request ID for logging purposes
 * @returns {Object} Payload object with conversationIdentifier, routingType, and optionally routingInfo
 */
function generateRoutePayload(req, requestId) {
  const payload = {
    "conversationIdentifier" : req.body.conversationIdentifier,
    "routingType" : req.body.routingType
  };

  const routingInfoType = req.body.routingInfo;
  let routingInfo;

  if (routingInfoType === "FLOW") {
    routingInfo = {
      flow: {
        "flowId": req.body.flow,
        "queueId": req.body.fallBackQueue,
      }
    };

    if (req.body.routingAttributes) {
      try {
        const parsed = JSON.parse(req.body.routingAttributes);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
          routingInfo["routingAttributes"] = parsed;
        }
      } catch (e) {
        logger.error(`POST /route API with requestId ${requestId} has error: JSON.parse failed for routingAttributes. Raw value: ${req.body.routingAttributes}, Error: `, e);
      }
    }
  } else if (routingInfoType === "QUEUE") {
    routingInfo = {
      "queueId": req.body.queue
    };
  }

  if (routingInfo) {
    payload["routingInfo"] = routingInfo;
  }

  return payload;
}

/**
 * Sends a POST request to the Salesforce route API
 * @param {Object} req - Express request object containing route data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendPostRouteAPIRequest(req, requestHeader) {
    
  const requestId = requestHeader.headers.RequestId;
  const requestPayload = generateRoutePayload(req, requestId);
  logger.info(`POST /route API with requestId ${requestId} and request payload: `, requestPayload);
  const routeApiUrl = generateApiUrl(settingsCache, routeEndpoint);

  try {
    const response = await axios.post(
      routeApiUrl,
      JSON.stringify(requestPayload),
      requestHeader
    );
    logger.info(`POST /route API with requestId ${requestId} completed successfully: `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`POST /route API with requestId ${requestId} has error: `, responseData);
    return responseData;
  }
}