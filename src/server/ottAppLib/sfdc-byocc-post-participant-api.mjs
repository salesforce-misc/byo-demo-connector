/**
 * Sends a SF participant to Salesforce via the REST API.
 */
import axios from 'axios';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const participantEndpoint = '/api/v1/participant';

/**
 * Generates the participant request payload object
 * @param {Object} req - Express request object containing participant data in body
 * @returns {Object} Payload object with conversationIdentifier, participants, and operation
 */
function generateParticipantPayload(req) {
    return {
        "conversationIdentifier" : req.body.conversationIdentifier,
        "participants" : req.body.participants,
        "operation" : req.body.operation
    };
}

/**
 * Sends a POST request to the Salesforce participant API
 * @param {Object} req - Express request object containing participant data
 * @param {Object} requestHeader - HTTP headers for the API request
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendPostParticipantAPIRequest(req, requestHeader) {
    
    const requestPayload = generateParticipantPayload(req);
    const requestId = requestHeader.headers.RequestId;
    logger.info(`POST /participant API with requestId ${requestId} and request payload: `, requestPayload);
    const participantApiUrl = generateApiUrl(settingsCache, participantEndpoint);

    try {
        const response = await axios.post(
            participantApiUrl,
            JSON.stringify(requestPayload),
            requestHeader
        );
        logger.info(`POST /participant API with requestId ${requestId} completed successfully: `, response.data);
        return response.data;
    } catch (error) {
        let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
        logger.error(`POST /participant API with requestId ${requestId} has error: `, responseData);
        return responseData;
    }
}