import axios from 'axios';
import {getAccessToken} from './sfdc-auth.mjs';
import NodeCache from "node-cache" ;
import { v4 as uuidv4} from 'uuid';
import { settingsCache } from '../ottAppServer.mjs';
import { getTimeStampForLoglines } from '../util.mjs';

// Get config metadata from .env
const {
  SF_SCRT_INSTANCE_URL, //OTT-needed
  USER_ID, //OTT-needed
  CAPACITY_WEIGHT
} = process.env;
const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";
// AgentWorkCache will store mapping of workItemId and agentWorkId
const agentWorkCache = new NodeCache();
const responseCache = new NodeCache();

const agentWorkApiUrl = '/api/v1/agentWork';
const routingCorrelationId = "123";
const routingType = "Initial";
/**
 * Sends a Salesforce create agent work request via Interaction Service api
 *
 * @param {string} orgId: The organization id for the login user
 * @param {string} authorizationContext: The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} conversationIdentifier: The Conversation Id for the conversation
 * @param {string} workItemId: Id of workItems like (MessagingSession, ..)
 * @returns {object} result object from interaction service with successful status or error code
 */
export async function agentWork(orgId, authorizationContext, conversationIdentifier, workItemId, agentActionVisibilities) {
  // Agentwork creation should happen only one time so if it exist don't call this api
  // We are storing it in agentWorkCache and validating against it
  if (agentWorkCache.get(workItemId)){
    // If agentWork was already created once then you don't need to call this funciton to create agentwork again
    console.log(getTimeStampForLoglines() + `Agentwork was already creaed for this workItem: "${workItemId}" - AgentWorkId: "${agentWorkCache.get(workItemId)}"`);
    return;
  }
  
  console.log(getTimeStampForLoglines() + `Start agentWork\nconversationIdentifier="${conversationIdentifier}"\nworkItemId="${workItemId}"`);
  
  const accessToken = await getAccessToken();
  let jsonData = {};

  jsonData = getAgentWorkData(workItemId, conversationIdentifier, IS_LOCAL_CONFIG ? USER_ID : settingsCache.get("userId"), agentActionVisibilities);
  jsonData = JSON.stringify(jsonData);
  console.log(getTimeStampForLoglines() + `agentWork request payload: "${jsonData}"`);
  const requestHeader = getAgentWorkRequestHeader(accessToken, orgId, authorizationContext);
  const responseData = await axios.post(
    (IS_LOCAL_CONFIG ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + agentWorkApiUrl,
    jsonData,
    requestHeader
  ).then(function (response) {
    if (response.data !== null && response.data.agentWorkId){
      agentWorkCache.set(workItemId, response.data.agentWorkId);
    }
    
    console.log(getTimeStampForLoglines() + `agentWork request completed successfully  `, response.data);
    return response.data;
  })
  .catch(function (error) {
    let responseData = error.response.data;
    console.log(getTimeStampForLoglines() + `agentWork request Failed: `, responseData);
    responseCache.set("message", responseData.message);
    responseCache.set("code", responseData.code);
    return responseData;
  });

  return responseData;
}

function getAgentWorkData(workItemId, conversationIdentifier, userId, agentActionVisibilities) {
  let agentWorkData = {};
  if (conversationIdentifier) {
    agentWorkData = {
      "userId": userId,
      "workItemId": workItemId,
      "capacityWeight": CAPACITY_WEIGHT,
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
    };    
  }

  if (agentActionVisibilities) {
    let agentActionVisibilitiesObj = JSON.parse(agentActionVisibilities);
    if (agentActionVisibilitiesObj.length > 0) {
      agentWorkData.agentActionVisibilities = agentActionVisibilitiesObj;
    }
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

// Function to get a value from the cache
export function getResponseCache(key) {
  return responseCache.get(key);
}

export { agentWorkCache };