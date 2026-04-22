import axios from 'axios';
import {getAccessToken} from './sfdc-auth.mjs';
import NodeCache from "node-cache" ;
import { v4 as uuidv4} from 'uuid';
import { settingsCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

// AgentWorkCache will store mapping of workItemId and agentWorkId
const agentWorkCache = new NodeCache();

const agentWorkEndpoint = '/api/v1/agentWork';

/**
 * Sends a Salesforce create agent work request via Interaction Service api
 *
 * @param {string} orgId - The organization id for the login user
 * @param {string} authorizationContext - The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} conversationIdentifier - The Conversation Id for the conversation
 * @param {string} workItemId - Id of workItems like (MessagingSession, ..)
 * @param {string} agentActionVisibilities - JSON string of agent action visibilities
 * @param {string} userId - The user ID
 * @param {string} routingType - The routing type
 * @param {string} routingCorrelationId - The routing correlation ID
 * @param {boolean} useCache - Whether to use cache to avoid duplicate agent work creation
 * @param {boolean} isCapacityWeight - Whether to use capacity weight
 * @param {number} capacityNumber - The capacity number (weight or percentage)
 * @returns {Promise<Object>} Result object from interaction service with successful status or error code
 */
export async function agentWork(orgId, authorizationContext, conversationIdentifier, workItemId, 
  agentActionVisibilities, userId, routingType, routingCorrelationId, useCache, isCapacityWeight, capacityNumber) {
  // Agentwork creation should happen only one time so if it exist don't call this api
  // We are storing it in agentWorkCache and validating against it
  if (agentWorkCache.get(workItemId) && useCache){
    // If agentWork was already created once then you don't need to call this function to create agentwork again
    logger.info(`Agentwork was already created for this workItem: "${workItemId}" - AgentWorkId: "${agentWorkCache.get(workItemId)}"`);
    return;
  }
  
  const accessToken = await getAccessToken();
  const requestHeader = getAgentWorkRequestHeader(accessToken, orgId, authorizationContext);
  const requestId = requestHeader.headers.RequestId;
  
  const requestPayload = generateAgentWorkPayload(workItemId, conversationIdentifier, userId, agentActionVisibilities, routingType, routingCorrelationId, isCapacityWeight, capacityNumber, requestId);
  logger.info(`POST /agentWork API with requestId ${requestId} and request payload: `, requestPayload);
  const agentWorkApiUrl = generateApiUrl(settingsCache, agentWorkEndpoint);

  try {
    const response = await axios.post(
      agentWorkApiUrl,
      JSON.stringify(requestPayload),
      requestHeader
    );
    if (response.data !== null && response.data.agentWorkId){
      agentWorkCache.set(workItemId, response.data.agentWorkId);
    }
    logger.info(`POST /agentWork API with requestId ${requestId} completed successfully: `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`POST /agentWork API with requestId ${requestId} has error: `, responseData);
    return responseData;
  }
}

/**
 * Sends a Salesforce Patch agent work request via Interaction Service apis
 *
 * @param {string} orgId - The organization id for the login user
 * @param {string} authorizationContext - The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} authorizationContextType - The authorization context type
 * @param {Object} req - Express request object containing patch agent work data in body
 * @returns {Promise<Object>} Result object from interaction service with successful status or error code
 */
export async function patchAgentWork(orgId, authorizationContext, authorizationContextType, req) {

  const accessToken = await getAccessToken();
  const requestHeader = getPatchAgentWorkRequestHeader(accessToken, orgId, authorizationContext, authorizationContextType);
  const requestId = requestHeader.headers.RequestId;

  const requestPayload = generatePatchAgentWorkPayload(req);
  logger.info(`PATCH /agentWork API with requestId ${requestId} and request payload: `, requestPayload);
  const agentWorkApiUrl = generateApiUrl(settingsCache, agentWorkEndpoint);

  try {
    const response = await axios.patch(
      agentWorkApiUrl,
      JSON.stringify(requestPayload),
      requestHeader
    );
    logger.info(`PATCH /agentWork API with requestId ${requestId} completed successfully: `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`PATCH /agentWork API with requestId ${requestId} has error: `, responseData);
    return responseData;
  }
}

/**
 * Generates the agent work request payload object
 * @param {string} workItemId - Id of workItems like (MessagingSession, ..)
 * @param {string} conversationIdentifier - The Conversation Id for the conversation
 * @param {string} userId - The user ID
 * @param {string} agentActionVisibilities - JSON string of agent action visibilities
 * @param {string} routingType - The routing type
 * @param {string} routingCorrelationId - The routing correlation ID
 * @param {boolean} isCapacityWeight - Whether to use capacity weight
 * @param {number} capacityNumber - The capacity number (weight or percentage)
 * @param {string} requestId - The request ID for logging purposes
 * @returns {Object} Payload object for agent work request
 */
function generateAgentWorkPayload(workItemId, conversationIdentifier, userId, agentActionVisibilities, routingType, routingCorrelationId, isCapacityWeight, capacityNumber, requestId) {
  let agentWorkData = {};
  if (conversationIdentifier) {
    if (isCapacityWeight) {
      agentWorkData = {
        "userId": userId,
        "workItemId": workItemId,
        "capacityWeight": capacityNumber,
        "routingContext": {
            "conversationIdentifier": conversationIdentifier,
            "routingCorrelationId": routingCorrelationId,
            "routingType": routingType
        }    
      };
    } else {
      agentWorkData = {
        "userId": userId,
        "workItemId": workItemId,
        "capacityPercentage": capacityNumber,
        "routingContext": {
            "conversationIdentifier": conversationIdentifier,
            "routingCorrelationId": routingCorrelationId,
            "routingType": routingType
        }    
      };
    }
  } else {
    agentWorkData = {
      "userId": userId,
      "workItemId": workItemId,
    };    
  }

  if (agentActionVisibilities) {
    try {
      const agentActionVisibilitiesObj = JSON.parse(agentActionVisibilities);
      if (agentActionVisibilitiesObj.length > 0) {
        agentWorkData.agentActionVisibilities = agentActionVisibilitiesObj;
      }
    } catch (e) {
      logger.error(`POST /agentWork API with requestId ${requestId} has error: JSON.parse failed for agentActionVisibilities. Raw value: ${agentActionVisibilities}, Error: `, e);
    }
  }

  return agentWorkData;
}

/**
 * Generates the patch agent work request payload object
 * @param {Object} req - Express request object containing patch agent work data in body
 * @returns {Object} Payload object for patch agent work request
 */
function generatePatchAgentWorkPayload(req) {
  let agentWorkData = {};
  let data = req.body;

  if (data.participantId) {
    if (data.participantId.startsWith("005")) {
      agentWorkData = {
        "contextType": "Agent",
        "workId": data.workId,
        "status": data.agentWorkStatus
      };
    } else if (data.participantId.startsWith("1JZ")) {
      agentWorkData = {
        "contextType": "Chatbot",
        "workId": data.workId,
        "workItemId": data.workItemId,
        "botId": data.participantId,
        "status": data.agentWorkStatus
      };
    }
  } else {
    agentWorkData = {
      "contextType": data.contextType,
      "workId": data.workId,
      "status": data.status
    };
  }
  return agentWorkData;
}

function getAgentWorkRequestHeader(accessToken, orgId, authorizationContext) {
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

function getPatchAgentWorkRequestHeader(accessToken, orgId,
    authorizationContext, authorizationContextType) {
  return {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Accept": "*/*",
      "OrgId": orgId,
      "AuthorizationContext": authorizationContext,
      "AuthorizationContextType": authorizationContextType,
      "RequestId": uuidv4()
    }
  };
}

export { agentWorkCache };