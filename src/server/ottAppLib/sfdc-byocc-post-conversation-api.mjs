import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const conversationEndpoint = '/api/v1/conversation';
const appType = 'custom';
const role = 'EndUser';

/**
 * Validates if the parsed value is a valid map/object
 * @param {any} parsed - The parsed value to validate
 * @returns {boolean} True if valid map, false otherwise
 */
function isValidMap(parsed) {
    return typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).length > 0;
}

/**
 * Generates the conversation request payload object
 * @param {Object} req - Express request object containing conversation data in body
 * @param {string} requestId - The request ID for logging purposes
 * @returns {Object} Payload object with channelAddressIdentifier, participants, and optionally routingAttributes
 */
function generateConversationPayload(req, requestId) {
    const payload = {
        "channelAddressIdentifier" : req.body.channelAddressIdentifier,
        "participants" : [
            {
                "subject" : req.body.endUserClientIdentifier,
                "role" : role,
                "appType" : appType
            }
        ]
    };

    if (req.body.routingAttributes) {
        try {
            const parsed = JSON.parse(req.body.routingAttributes);
            if (isValidMap(parsed)) {
                payload["routingAttributes"] = parsed;
            }
        } catch (e) {
            logger.error(`POST /conversation API with requestId ${requestId} has error: JSON.parse failed for routingAttributes. Raw value: ${req.body.routingAttributes}, Error: `, e);
        }
    }

    return payload;
}

/**
 * Sends a POST request to the Salesforce conversation API to create a conversation
 * @param {Object} req - Express request object containing conversation data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendConversationAPIRequest(req, requestHeader) {
    
    const requestId = requestHeader.headers.RequestId;
    const requestPayload = generateConversationPayload(req, requestId);
    logger.info(`POST /conversation API with requestId ${requestId} and request payload: `, requestPayload);
    const conversationApiUrl = generateApiUrl(settingsCache, conversationEndpoint);

    try {
        const response = await axios.post(
            conversationApiUrl,
            JSON.stringify(requestPayload),
            requestHeader
        );
        logger.info(`POST /conversation API with requestId ${requestId} completed successfully: `, response.data);
        return response.data;
    } catch (error) {
        let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
        logger.error(`POST /conversation API with requestId ${requestId} has error: `, responseData);
        return responseData;
    }
}

