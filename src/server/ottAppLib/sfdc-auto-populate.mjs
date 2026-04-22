import axios from 'axios';
import { getAccessToken } from './sfdc-auto-populate-access-token.mjs';
import { logger } from '../util.mjs';

const {
    SF_INSTANCE_URL,
    SF_AUTHORIZATION_CONTEXT,
    API_VERSION
} = process.env;

/**
 * Gets a Conversation Channel Definition record by its developer name from Salesforce.
 * @returns {Promise<Object|null>} The first record from the Salesforce query, or null if not found or on error.
 *                                  Returns null if required environment variables are missing.
 */
export async function getConversationChannelDefinition() {

  if(!API_VERSION || !SF_AUTHORIZATION_CONTEXT || !SF_INSTANCE_URL){
    logger.error(`Missing required environment variables. Check if the API_VERSION, SF_AUTHORIZATION_CONTEXT, and SF_INSTANCE_URL are correct in env file.`);
    return null;
  }

  const developerName = SF_AUTHORIZATION_CONTEXT;
  const accessToken = await getAccessToken();

  // Only include inbound acknowledgement & typing indicator for API_VERSION 63.0
  let query;
  if (API_VERSION < 63.0) {
    query = `SELECT Id, DeveloperName, RoutingOwner, ConsentOwner, ConversationVendorInfoId, CustomPlatformEvent, CustomEventTypeField, CustomEventPayloadField, NamespacePrefix FROM ConversationChannelDefinition WHERE DeveloperName = '${developerName}' ORDER BY DeveloperName ASC`;
  } else {
    query = `SELECT Id, DeveloperName, RoutingOwner, ConsentOwner, ConversationVendorInfoId, CustomPlatformEvent, CustomEventTypeField, CustomEventPayloadField, NamespacePrefix, IsInboundReceiptsEnabled, IsTypingIndicatorDisabled FROM ConversationChannelDefinition WHERE DeveloperName = '${developerName}' ORDER BY DeveloperName ASC`;
  }

  const requestHeader = getRequestHeader(accessToken);
  const ccdQueryUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${query}`;

  logger.info(`Query ConversationChannelDefinition Information by Developer Name: ${developerName}`);
  try {
    const response = await axios.get(ccdQueryUrl, requestHeader);
    if (response && response.data && response.data.records && response.data.records.length > 0) {
      logger.info("Query ConversationChannelDefinition response: ", response.data.records[0]);
      return response.data.records[0];
    } else {
      logger.error(`No records found in the ConversationChannelDefinition data with DeveloperName: ${developerName}. Check if SF_AUTHORIZATION_CONTEXT is correct in env file.`);
      return null;
    }
  } catch (error) {
    const errorData = error.response?.data || { message: error.message };
    logger.error("Query ConversationChannelDefinition response error: ", errorData);
    return null;
  }
}

/**
 * Gets an ExtConvParticipantIntegDef record by its developer name from Salesforce.
 * @returns {Promise<Object|null>} The first record from the Salesforce query, or null if not found or on error.
 *                                  Returns null if required environment variables are missing.
 */
export async function getExtConvParticipantIntegDef() {
  if (!API_VERSION || !SF_AUTHORIZATION_CONTEXT || !SF_INSTANCE_URL) {
    logger.error(`Missing required environment variables. Check if the API_VERSION, SF_AUTHORIZATION_CONTEXT, and SF_INSTANCE_URL are correct in env file.`);
    return null;
  }

  const developerName = SF_AUTHORIZATION_CONTEXT;
  const accessToken = await getAccessToken();

  let query;
  query = `SELECT Id,
                  DeveloperName,
                  CustomPlatformEvent,
                  CustomEventTypeField,
                  CustomEventPayloadField,
                  NamespacePrefix
           FROM ExtConvParticipantIntegDef
           WHERE DeveloperName = '${developerName}'
           ORDER BY DeveloperName ASC`;

  const requestHeader = getRequestHeader(accessToken);
  const extConvParticipantDefQueryUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${query}`;

  logger.info(`Query ExtConvParticipantIntegDef Information by Developer Name: ${developerName}`);
  try {
    const response = await axios.get(extConvParticipantDefQueryUrl,
        requestHeader);
    logger.info("Query ExtConvParticipantIntegDef response: ", response.data.records[0]);
    return response.data.records[0];
  } catch (error) {
    logger.error("Query ExtConvParticipantIntegDef response error: ", error);
    return null;
  }
}

/**
 * Gets a CustomMsgChannel record by its channel definition ID from Salesforce.
 * Note: CustomMsgChannel is only supported for API version 63.0 and above.
 * @param {string} channelDefinitionId - The ID of the channel definition
 * @returns {Promise<Object|null>} The response data from the Salesforce query, or null if not found or on error.
 *                                  Returns null if API version is less than 63.0 or required environment variables are missing.
 */
export async function getCustomMsgChannel(channelDefinitionId) {

  // CustomMsgChannel is only supported for v63.0 and above
  if(!API_VERSION || API_VERSION < 63.0 || !SF_INSTANCE_URL || !SF_AUTHORIZATION_CONTEXT){
    logger.error(`Missing required environment variables. Check if the API_VERSION, SF_INSTANCE_URL, and SF_AUTHORIZATION_CONTEXT are correct in env file.`);
    return null;
  }

  const accessToken = await getAccessToken();
  const query = `SELECT ChannelDefinitionId, HasInboundReceipts, HasTypingIndicator, Id, MessagingChannelId FROM CustomMsgChannel WHERE ChannelDefinitionId = '${channelDefinitionId}'`;

  const requestHeader = getRequestHeader(accessToken);
  const cmcQueryUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${query}`;
  
  logger.info(`Query CustomMsgChannel Information by Channel Definition ID: ${channelDefinitionId}`);
  try {
    const response = await axios.get(cmcQueryUrl, requestHeader);
    logger.info("Query CustomMsgChannel Information response: ", response.data.records[0]);
    return response.data;
  } catch (error) {
    const errorData = error.response?.data || { message: error.message };
    logger.error("Query CustomMsgChannel Information response error: ", errorData);
    return null;
  }
}

/**
 * Generates HTTP request headers for Salesforce API calls.
 * @param {string} accessToken - The Salesforce access token (session ID)
 * @returns {Object} Request headers object with Authorization and Content-Type
 */
function getRequestHeader(accessToken) {
  return {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }
  };
}
