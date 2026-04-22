import { getAccessToken } from './sfdc-auth.mjs';
import { sendConsentAPIRequest } from './sfdc-byocc-consent-api.mjs';
import { sendPostRouteAPIRequest } from './sfdc-byocc-post-route-api.mjs';
import { sendDeleteRouteAPIRequest } from './sfdc-byocc-delete-route-api.mjs';
import { sendPostRoutingResultAPIRequest } from './sfdc-byocc-post-routing-result-api.mjs';
import { sendPatchRegisterCapabilitiesAPIRequest } from'./sfdc-byocc-patch-register-capabilities-api.mjs';
import { sendConversationHistoryRequest } from './sfdc-byocc-post-conversation-history-api.mjs';
import { sendConversationAPIRequest } from './sfdc-byocc-post-conversation-api.mjs';
import { sendPostParticipantAPIRequest } from './sfdc-byocc-post-participant-api.mjs';
import { sendPostMessagingSessionAPIRequest } from './sfdc-byocc-post-messaging-session-api.mjs';
import { v4 as uuidv4} from 'uuid';
import { agentWork, patchAgentWork } from './sfdc-byocc-agentwork-api.mjs';
import { settingsCache } from '../ottAppServer.mjs';
import { getTimeStampForLoglines, logger } from '../util.mjs';

//Get config metadata from .env
const {
  SF_ORG_ID,
  SF_AUTHORIZATION_CONTEXT
} = process.env;
const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";

export async function sendRunApiLabRequest(req) {
  
  let responseData = {};
  const accessToken = await getAccessToken();
  const requestHeader = getRequestHeader(accessToken, IS_LOCAL_CONFIG ? SF_ORG_ID : settingsCache.get("orgId"), IS_LOCAL_CONFIG ? SF_AUTHORIZATION_CONTEXT : settingsCache.get("authorizationContext"));

  if (!IS_LOCAL_CONFIG && !(accessToken && settingsCache.get("orgId") && settingsCache.get("authorizationContext") && settingsCache.get("scrtUrl"))) {
    logger.error("[Warn] Please check if the user is in a Contact Center, refresh your (1) Salesforce App and then (2)demo connector page to retrieve critical contact center data to start sending route request.");
    return;
  } 
  // run request base on the apiName in the request;
  switch (req.body.apiName){
    case "CONSENT": {
      responseData = await sendConsentAPIRequest(req, requestHeader);
      break;
    }
    case "POST_ROUTE": {
      responseData = await sendPostRouteAPIRequest(req, requestHeader);
      break;
    }
    case "DELETE_ROUTE": {
      responseData = await sendDeleteRouteAPIRequest(req, requestHeader);
      break;
    }
    case "POST_ROUTING_RESULT": {
      responseData = await sendPostRoutingResultAPIRequest(req, requestHeader);
      break;
    }
    case 'PATCH_REGISTER_CAPABILITIES': {
      responseData = await sendPatchRegisterCapabilitiesAPIRequest(req, requestHeader);
      break;
    }
    case "POST_AGENT_WORK": {
      const isCapacityWeight = !!req.body.capacityWeight;
      const capacityNumber = req.body.capacityWeight || req.body.capacityPercentage;
      responseData = await agentWork(SF_ORG_ID, SF_AUTHORIZATION_CONTEXT, req.body.conversationIdentifier, req.body.workItemId, req.body.agentActionVisibilities, req.body.userId, req.body.routingType, req.body.routingCorrelationId, false, isCapacityWeight, capacityNumber);
      break;
    }
    case "PATCH_AGENT_WORK": {
      responseData = await patchAgentWork(SF_ORG_ID, SF_AUTHORIZATION_CONTEXT, "ConversationChannelDefinition", req);
      break;
    }
    case "POST_CONVERSATION_HISTORY": {
      responseData = await sendConversationHistoryRequest(req, requestHeader);
      break;
    }
    case "POST_CONVERSATION": {
      responseData = await sendConversationAPIRequest(req, requestHeader);
      break;
    }
    case "POST_PARTICIPANT": {
      responseData = await sendPostParticipantAPIRequest(req, requestHeader);
      break;
    }
    case "POST_MESSAGING_SESSION": {
      responseData = await sendPostMessagingSessionAPIRequest(req, requestHeader);
      break;
    }
  }
  return responseData;
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