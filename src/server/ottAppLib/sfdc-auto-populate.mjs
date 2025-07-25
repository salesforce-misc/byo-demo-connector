import axios from 'axios';
import { getAccessToken } from './sfdc-auto-populate-access-token.mjs';
import { getTimeStampForLoglines } from '../util.mjs';

const {
    SF_INSTANCE_URL,
    SF_AUTHORIZATION_CONTEXT,
    API_VERSION
} = process.env;

/**
 * Function to get Conversation Channel Definition record by its developer name from Salesforce.
 * @returns {Promise<Object>} - The response data from the Salesforce query with following sample payload
 *  {
 *   "attributes": {
 *     "type": "ConversationChannelDefinition",
 *     "url": "/services/data/v63.0/sobjects/ConversationChannelDefinition/11vSG000000015lYAA"
 *   },
 *   "Id": "11vSG000000015lYAA",
 *   "DeveloperName": "BYOCC_Channel_Definition",
 *   "RoutingOwner": "Partner",
 *   "ConsentOwner": "Partner",
 *   "ConversationVendorInfoId": "0m8SG00000000rFYAQ",
 *   "CustomPlatformEvent": "sdb6byo__BYOCC_Event__e",
 *   "CustomEventTypeField": "sdb6byo__EventType__c",
 *   "CustomEventPayloadField": "sdb6byo__Payload__c",
 *   "NamespacePrefix": "sdb6byo"
 * }
 *
 * @throws {Error} - Throws an error if the API_VERSION environment variable is missing or if the request fails
*/
export async function getConversationChannelDefinitions() {
  console.log(getTimeStampForLoglines() + "Start getConversationChannelDefinitions");

  if(!API_VERSION){
    return null;
  }

  const developerName = SF_AUTHORIZATION_CONTEXT;
  const accessToken = await getAccessToken();
  console.log(getTimeStampForLoglines() + `AccessToken: ${accessToken}`);

  // only include inbound acknowledgement & typing indicator for API_VERSION 63.0
  let query;
  if (API_VERSION < 63.0) {
    query = `SELECT Id, DeveloperName, RoutingOwner, ConsentOwner, ConversationVendorInfoId, CustomPlatformEvent, CustomEventTypeField, CustomEventPayloadField, NamespacePrefix FROM ConversationChannelDefinition WHERE DeveloperName = '${developerName}' ORDER BY DeveloperName ASC`;
  } else {
    query = `SELECT Id, DeveloperName, RoutingOwner, ConsentOwner, ConversationVendorInfoId, CustomPlatformEvent, CustomEventTypeField, CustomEventPayloadField, NamespacePrefix, IsInboundReceiptsEnabled, IsTypingIndicatorDisabled FROM ConversationChannelDefinition WHERE DeveloperName = '${developerName}' ORDER BY DeveloperName ASC`;
  }

  const requestHeader = getRequestHeader(accessToken);
  const ccdQueryUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${query}`;
  console.log(getTimeStampForLoglines() + '----- CCD query URL: ', ccdQueryUrl);

  try {
    const response = await axios.get(ccdQueryUrl, requestHeader);
    console.log(getTimeStampForLoglines() + "getConversationChannelDefinitions request completed successfully");
    return response.data;
  } catch (error) {
    console.log(getTimeStampForLoglines() + "getConversationChannelDefinitions request Failed: ", error.response.data || error.message);
    return null;
  }
}

export async function getCustomMsgChannel(ccdId) {
  console.log(getTimeStampForLoglines() + "Start getCustomMsgChannel");

  // CustomMsgChannel is only supported for v63.0 and above
  if(!API_VERSION || API_VERSION < 63.0){
    return null;
  }

  const accessToken = await getAccessToken();
  console.log(getTimeStampForLoglines() + `AccessToken: ${accessToken}`);
  const query = `SELECT ChannelDefinitionId, HasInboundReceipts, HasTypingIndicator, Id, MessagingChannelId FROM CustomMsgChannel WHERE ChannelDefinitionId = '${ccdId}'`;

  const requestHeader = getRequestHeader(accessToken);
  const cmcQueryUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${query}`;
  
  try {
    const response = await axios.get(cmcQueryUrl, requestHeader);
    console.log(getTimeStampForLoglines() + "getCustomMsgChannel request completed successfully");
    return response.data;
  } catch (error) {
    console.log(getTimeStampForLoglines() + "getCustomMsgChannel request Failed: ", error.response.data || error.message);
    return null;
  }
}

function getRequestHeader(accessToken) {
  return {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }
  };
}
