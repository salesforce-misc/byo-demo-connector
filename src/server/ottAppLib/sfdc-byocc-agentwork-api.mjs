import axios from 'axios';
import {getAccessToken} from './sfdc-auth.mjs';
import NodeCache from "node-cache" ;
import { v4 as uuidv4} from 'uuid';
import { settingsCache } from '../ottAppServer.mjs';

// Get config metadata from .env
const {
  SF_SCRT_INSTANCE_URL, //OTT-needed
  USER_ID, //OTT-needed
  CAPACITY_WEIGHT
} = process.env;
const IS_OTT = process.env.IS_OTT === "true";
// AgentWorkCache will store mapping of workItemId and agentWorkId
const agentWorkCache = new NodeCache();

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
export async function agentWork(orgId, authorizationContext, conversationIdentifier, workItemId) {
  // Agentwork creation should happen only one time so if it exist don't call this api
  // We are storing it in agentWorkCache and validating against it
  if (agentWorkCache.get(workItemId)){
    // If agentWork was already created once then you don't need to call this funciton to create agentwork again
    console.log(`\n====== Agentwork was already creaed for this workItem: "${workItemId}" - AgentWorkId: "${agentWorkCache.get(workItemId)}"`);
    return;
  }
  
  console.log(`\n====== Start agentWork\nconversationIdentifier="${conversationIdentifier}"\nworkItemId="${workItemId}"`);
  
  const accessToken = await getAccessToken();
  let jsonData = {};

  jsonData = getAgentWorkData(workItemId, conversationIdentifier, IS_OTT ? USER_ID : settingsCache.get("userId"));
  jsonData = JSON.stringify(jsonData);
  const requestHeader = getAgentWorkRequestHeader(accessToken, orgId, authorizationContext);
  const responseData = await axios.post(
    (IS_OTT ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + agentWorkApiUrl,
    jsonData,
    requestHeader
  ).then(function (response) {
    if (response.data !== null && response.data.agentWorkId){
      agentWorkCache.set(workItemId, response.data.agentWorkId);
    }
    
    console.log(`\n====== agentWork request completed successfully  `, response.data);
    return response.data;
  })
  .catch(function (error) {

    let responseData = error.response.data;

    console.log(`\n====== agentWork request Failed: `, responseData);
    return error;
  });

  return responseData;
}

function getAgentWorkData(workItemId, conversationIdentifier, userId) {
  if (conversationIdentifier) {
    return {
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
    return {
      "userId": userId,
      "workItemId": workItemId,
    };    
  }
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

export { agentWorkCache };