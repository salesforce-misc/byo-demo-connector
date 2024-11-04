import axios from 'axios';
import {getAccessToken} from './sfdc-auth.mjs';
import { v4 as uuidv4} from 'uuid';
import { settingsCache } from '../ottAppServer.mjs';
import { getTimeStampForLoglines } from '../util.mjs';

// Get config metadata from .env
const {
  SF_SCRT_INSTANCE_URL,
  SF_ORG_ID,
  SF_AUTHORIZATION_CONTEXT
} = process.env;
const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";

const acknowledgementEndpoint = '/api/v1/acknowledgement';
const appType = 'custom';
const role = 'EndUser';

export async function sendAcknowledgement(conversationIdentifier, conversationEntryIdentifier, acknowledgementType) {    
  let orgId = IS_LOCAL_CONFIG ? SF_ORG_ID : settingsCache.get("orgId");
  let authorizationContext = IS_LOCAL_CONFIG ? SF_AUTHORIZATION_CONTEXT : settingsCache.get("authorizationContext");
  const accessToken = await getAccessToken();

  let senderData = {
    "appType": appType,
    "subject": settingsCache.get("endUserClientIdentifier"),
    "role": role
  }

  let jsonData = {
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

  jsonData = JSON.stringify(jsonData);

  console.log(getTimeStampForLoglines() + `preparing jsonData to send acknowledgement request: `, jsonData);

  const requestHeader = getRequestHeader(accessToken, orgId, authorizationContext);
  const responseData = await axios.post(
    (IS_LOCAL_CONFIG ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + acknowledgementEndpoint,
    jsonData,
    requestHeader
  ).then(function (response) {    
    console.log(getTimeStampForLoglines() + `acknowledgement request completed successfully  `, response.data);
    return response.data;
  })
  .catch(function (error) {
    let responseData = error.response.data;
    console.log(getTimeStampForLoglines() + `acknowledgement request Failed: `, responseData);
    return error;
  });

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
