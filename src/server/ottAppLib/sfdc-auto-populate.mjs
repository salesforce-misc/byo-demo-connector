import axios from 'axios';
import { getAccessToken } from './sfdc-auto-populate-access-token.mjs';

const {
    SF_INSTANCE_URL,
    SF_AUTHORIZATION_CONTEXT,
    API_VERSION
} = process.env;

/**
* Function to get Conversation Channel Definitions from Salesforce.
* @returns {Promise<Object>} - The response data from the Salesforce query
* @throws {Error} - Throws an error if the API_VERSION environment variable is missing or if the request fails
*/
export async function getConversationChannelDefinitions() {
  console.log("\n====== Start getConversationChannelDefinitions");

  if(!API_VERSION){
    throw new Error('Missing API_VERSION environment variable');
  }

  const developerName = SF_AUTHORIZATION_CONTEXT;
  const accessToken = await getAccessToken();
  console.log(`\n====== AccessToken: ${accessToken}`);
  const query = `SELECT Id, DeveloperName, RoutingOwner, ConsentOwner, ConversationVendorInfoId, CustomPlatformEvent, CustomEventTypeField, CustomEventPayloadField, NamespacePrefix FROM ConversationChannelDefinition WHERE DeveloperName = '${developerName}' ORDER BY DeveloperName ASC`;

  const requestHeader = getCCDRequestHeader(accessToken);
  const ccdQueryUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${query}`;
  
  try {
    const response = await axios.get(ccdQueryUrl, requestHeader);
    console.log("\n====== getConversationChannelDefinitions request completed successfully");
    return response.data;
  } catch (error) {
    console.log("\n====== getConversationChannelDefinitions request Failed: ", error.response.data || error.message);
    throw error;
  }
}

function getCCDRequestHeader(accessToken) {
  return {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }
  };
}
