import {getAccessToken} from './sfdc-auth.mjs';
import {sendConsentAPIRequest} from './sfdc-byocc-consent-api.mjs';
import {sendPostRouteAPIRequest} from './sfdc-byocc-post-route-api.mjs';
import {sendDeleteRouteAPIRequest} from './sfdc-byocc-delete-route-api.mjs';
import {sendPostRoutingResultAPIRequest} from './sfdc-byocc-post-routing-result-api.mjs';
import {sendPatchRegisterCapabilitiesAPIRequest} from'./sfdc-byocc-patch-register-capabilities-api.mjs';
import { v4 as uuidv4} from 'uuid';
import { agentWork } from './sfdc-byocc-agentwork-api.mjs';
import { settingsCache } from '../ottAppServer.mjs';

// Get config metadata from .env
const {
  SF_ORG_ID,
  SF_AUTHORIZATION_CONTEXT
} = process.env;
const IS_OTT = process.env.IS_OTT === "true";

export async function sendRunApiLabRequest(req) {
  
  let responseData = {};
  const accessToken = await getAccessToken();
  const requestHeader = getRequestHeader(accessToken, IS_OTT ? SF_ORG_ID : settingsCache.get("orgId"), IS_OTT ? SF_AUTHORIZATION_CONTEXT : settingsCache.get("authorizationContext"));

  console.log("\n====== Request body: ", req.body);
  console.log("\n====== Request header: ", requestHeader);

  if (!IS_OTT && !(accessToken && settingsCache.get("orgId") && settingsCache.get("authorizationContext") && settingsCache.get("scrtUrl"))) {
    console.log("======[Warn]  Please check if the user is in a Contact Center,  refresh your (1) Salesforce App and then (2)demo connector page to retrieve critical contact center data to start sending route request.======")
  } else {
    // run request base on the apiName in the request;
    switch (req.body.apiName){
      case "CONSENT": {
        console.log('\n====== Sending consent API patch request...');
        responseData = await sendConsentAPIRequest(req, requestHeader);
        console.log('\n====== Consent API patch request sent.');
        break;
      }
      case "POST_ROUTE": {
        console.log('\n====== Sending route API post request...');
        responseData = await sendPostRouteAPIRequest(req, requestHeader);
        console.log('\n====== Route API post request sent.');
        break;
      }
      case "DELETE_ROUTE": {
        console.log('\n====== Sending route API delete request...');
        responseData = await sendDeleteRouteAPIRequest(req, requestHeader);
        console.log('\n====== Route API delete request sent.');
        break;
      }
      case "POST_ROUTING_RESULT": {
        console.log('\n====== Sending Routing Result API post request...');
        responseData = await sendPostRoutingResultAPIRequest(req, requestHeader);
        console.log('\n====== Routing Result API post request sent.');
        break;
      }
      case 'PATCH_REGISTER_CAPABILITIES': {
        console.log('\n====== Sending Register Capabilities API patch request...');
        responseData = await sendPatchRegisterCapabilitiesAPIRequest(req, requestHeader);
        console.log('\n====== Register Capabilities API patch request was sent.');
        break;
      }
      case "POST_AGENT_WORK": {
        console.log('\n====== Sending Agent Work API post request...');
        responseData = await agentWork( SF_ORG_ID, SF_AUTHORIZATION_CONTEXT, req.body.conversationIdentifier, req.body.workItemId);
        console.log('\n====== Agent Work API post request sent.');
        break;
      }
    }
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