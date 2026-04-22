import axios from "axios";
import { settingsCache } from "../ottAppServer.mjs";
import { logger, generateApiUrl } from "../util.mjs";

const messagingSessionEndpoint = "/api/v1/messagingSession";

/**
 * Generates the messaging session request payload object
 * @param {Object} req - Express request object containing messaging session data in body
 * @returns {Object} Payload object with channelAddressIdentifier, conversationIdentifier, endUserClientId, operation, operationBy, and optionally sessionId
 */
function generateMessagingSessionPayload(req) {
    const payload = {
        "channelAddressIdentifier": req.body.channelAddressIdentifier,
        "conversationIdentifier": req.body.conversationIdentifier,
        "endUserClientId": req.body.endUserClientId,
        "operation": req.body.operation,
        "operationBy": req.body.operationBy
    };
    
    if (req.body.operation === "Inactivate") {
        payload["sessionId"] = req.body.sessionId;
    }

    return payload;
}

/**
 * Sends a POST request to the Salesforce messaging session API
 * @param {Object} req - Express request object containing messaging session data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendPostMessagingSessionAPIRequest(req, requestHeader) {
    
    const requestPayload = generateMessagingSessionPayload(req);
    const requestId = requestHeader.headers.RequestId;
    logger.info(`POST /messagingSession API with requestId ${requestId} and request payload: `, requestPayload);
    const messagingSessionApiUrl = generateApiUrl(settingsCache, messagingSessionEndpoint);

    try {
        const response = await axios.post(
            messagingSessionApiUrl,
            JSON.stringify(requestPayload),
            requestHeader
        );
        logger.info(`POST /messagingSession API with requestId ${requestId} completed successfully: `, response.data);
        return response.data;
    } catch (error) {
        let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
        logger.error(`POST /messagingSession API with requestId ${requestId} has error: `, responseData);
        return responseData;
    }
}