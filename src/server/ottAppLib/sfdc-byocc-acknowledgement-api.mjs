import axios from 'axios';
import {getAccessToken} from './sfdc-auth.mjs';
import { v4 as uuidv4} from 'uuid';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

// Get config metadata from .env
const {
  SF_ORG_ID,
  SF_AUTHORIZATION_CONTEXT
} = process.env;
const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";

const acknowledgementEndpoint = '/api/v1/acknowledgement';
const appType = 'custom';
const role = 'EndUser';

/**
 * Generates the acknowledgement request payload object
 * @param {string} conversationIdentifier - The conversation identifier
 * @param {string} conversationEntryIdentifier - The conversation entry identifier to acknowledge
 * @param {string} acknowledgementType - The type of acknowledgement
 * @returns {Object} Payload object with sender, conversationIdentifier, and acknowledgements
 */
function generateAcknowledgementPayload(conversationIdentifier, conversationEntryIdentifier, acknowledgementType) {
  const senderData = {
    "appType": appType,
    "subject": settingsCache.get("endUserClientIdentifier"),
    "role": role
  };

  return {
    "sender": senderData,
    "conversationIdentifier": conversationIdentifier,
    "acknowledgements": [
        {
            "acknowledgementTimestamp": new Date().getTime(),
            "acknowledgementType": acknowledgementType,
            "acknowledgedConversationEntryIdentifier": conversationEntryIdentifier,
            "acknowledgmentCreatedConversationEntryIdentifier": uuidv4()
        }
    ]
  };
}

/**
 * Sends a POST request to the Salesforce acknowledgement API
 * @param {string} conversationIdentifier - The conversation identifier
 * @param {string} conversationEntryIdentifier - The conversation entry identifier to acknowledge
 * @param {string} acknowledgementType - The type of acknowledgement
 * @returns {Promise<Object>} Response data from the API call
 */
export async function sendAcknowledgement(conversationIdentifier, conversationEntryIdentifier, acknowledgementType) {    
  const orgId = IS_LOCAL_CONFIG ? SF_ORG_ID : settingsCache.get("orgId");
  const authorizationContext = IS_LOCAL_CONFIG ? SF_AUTHORIZATION_CONTEXT : settingsCache.get("authorizationContext");
  const accessToken = await getAccessToken();

  const requestPayload = generateAcknowledgementPayload(conversationIdentifier, conversationEntryIdentifier, acknowledgementType);
  const requestHeader = getRequestHeader(accessToken, orgId, authorizationContext);
  const requestId = requestHeader.headers.RequestId;
  logger.info(`POST /acknowledgement API with requestId ${requestId} and request payload: `, requestPayload);
  const acknowledgementApiUrl = generateApiUrl(settingsCache, acknowledgementEndpoint);

  try {
    const response = await axios.post(
      acknowledgementApiUrl,
      JSON.stringify(requestPayload),
      requestHeader
    );
    logger.info(`POST /acknowledgement API with requestId ${requestId} completed successfully: `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`POST /acknowledgement API with requestId ${requestId} has error: `, responseData);
    return responseData;
  }
}

function getRequestHeader(accessToken, orgId, authorizationContext) {
  return {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Accept": "*/*",
      "OrgId": orgId,
      "AuthorizationContext": authorizationContext,
      "RequestId": uuidv4()
    }
  };
}
