import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const conversationHistoryEndpoint = '/api/v1/conversationHistory';

/**
 * Generates the conversation history request payload object
 * @param {Object} req - Express request object containing conversation history data in body
 * @returns {Object} Payload object with channelAddressIdentifier, conversationParticipants, and conversationEntries
 */
function generateConversationHistoryPayload(req) {
    return {
        "channelAddressIdentifier": req.body.channelAddressIdentifier,
        "conversationParticipants": req.body.participants.conversationParticipants,
        "conversationEntries": req.body.entries.conversationEntries
    };
}

/**
 * Sends a POST request to the Salesforce conversation history API
 * @param {Object} req - Express request object containing conversation history data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendConversationHistoryRequest(req, requestHeader) {
    
    requestHeader.headers.AuthorizationContextType = "CONVERSATIONCHANNELDEFINITION";
    
    const requestPayload = generateConversationHistoryPayload(req);
    const requestId = requestHeader.headers.RequestId;
    logger.info(`POST /conversationHistory API with requestId ${requestId} and request payload: `, requestPayload);
    const conversationHistoryApiUrl = generateApiUrl(settingsCache, conversationHistoryEndpoint);

    try {
        const response = await axios.post(
            conversationHistoryApiUrl,
            JSON.stringify(requestPayload),
            requestHeader
        );
        logger.info(`POST /conversationHistory API with requestId ${requestId} completed successfully: `, response.data);
        return response.data;
    } catch (error) {
        let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
        logger.error(`POST /conversationHistory API with requestId ${requestId} has error: `, responseData);
        return responseData;
    }
}

