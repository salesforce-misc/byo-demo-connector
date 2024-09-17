import axios from 'axios';
import { getAccessToken } from './sfdc-auto-populate-access-token.mjs';
import { getConversationChannelDefinitions } from './sfdc-auto-populate.mjs';

const {
    SF_INSTANCE_URL,
    SF_AUTHORIZATION_CONTEXT,
    CHANNEL_ADDRESS_IDENTIFIER,
    API_VERSION,
} = process.env;

/**
 * Validates the Conversation Channel Definition fields on the custom platform event.
 * This function checks if the CCD.Payload and CCD.EventType are valid custom fields.
 * 
 * @returns {Object} An object containing isValid (boolean) and reason (string) properties.
 */
export async function validateCCDFieldsOnPlatformEvent() {
    console.log("\n====== Start validateCCDFieldsOnPlatformEvent");

    try {
        const ccdData = await getConversationChannelDefinitions();

        if (!ccdData || !ccdData.records || ccdData.records.length === 0) {
            console.log("No records found in the CCD data");
            return { isValid: false, reason: "No Conversation Channel Definition records found. Please check your CCD configuration." };
        }

        const ccdDataRecord = ccdData.records[0];
        const customPlatformEvent = ccdDataRecord.CustomPlatformEvent;
        const customEventPayloadField = ccdDataRecord.CustomEventPayloadField;
        const customEventTypeField = ccdDataRecord.CustomEventTypeField;

        await validateFields(customEventPayloadField, customEventTypeField, customPlatformEvent);

        return { 
            isValid: true, 
            reason: "All custom fields (Payload and EventType) are valid on the platform event." 
        };
    } catch (error) {
        console.error('Error in validateCCDFieldsOnPlatformEvent:', error);
        return { 
            isValid: false, 
            reason: `Validation failed: ${error.message}. Please check your field configurations and Salesforce connection.` 
        };
    }
}

/**
 * Helper function to validate the existence of custom fields on the platform event.
 * 
 * @param {string} customEventPayloadField - The name of the custom payload field.
 * @param {string} customEventTypeField - The name of the custom event type field.
 * @param {string} customPlatformEvent - The name of the custom platform event.
 * @returns {boolean} True if both fields exist, false otherwise.
 */
async function validateFields(customEventPayloadField, customEventTypeField, customPlatformEvent) {
    const customPlatformEventDescribe = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/sobjects/${customPlatformEvent}/describe`;
    const accessToken = await getAccessToken();
    const requestHeader = getValidateCCDRequestHeader(accessToken);

    try {
        const response = await axios.get(customPlatformEventDescribe, requestHeader);
        console.log("\n====== validateCCDFieldsOnPlatformEvent request completed successfully");
        
        const fields = response.data.fields;
        const hasPayloadField = fields.some(field => field.name === customEventPayloadField);
        const hasTypeField = fields.some(field => field.name === customEventTypeField);

        if (!hasPayloadField || !hasTypeField) {
            let errorMessage = [];
            if (!hasPayloadField) {
                errorMessage.push(`Custom Event Payload Field '${customEventPayloadField}' not found in Platform Event`);
            }
            if (!hasTypeField) {
                errorMessage.push(`Custom Event Type Field '${customEventTypeField}' not found in Platform Event`);
            }
            throw new Error(errorMessage.join('. '));
        }

        return true;
    } catch (error) {
        console.log("\n====== validateCCDFieldsOnPlatformEvent request Failed: ", error.response?.data || error.message);
        throw error;
    }
}

/**
 * Validates the Conversation Vendor Info VendorType for the current page type.
 * 
 * @param {string} pageType - The type of page ('ccaas' or 'ott').
 * @returns {Object} An object containing isValid (boolean) and reason (string) properties.
 */
export async function validateConversationVendorInfo(pageType) {
    console.log("\n====== Start validateConversationVendorInfo");

    try {
        const accessToken = await getAccessToken();
        const requestHeader = getValidateCCDRequestHeader(accessToken);

        const query = `SELECT Id, DeveloperName, ConversationVendorInfo.VendorType 
                       FROM ConversationChannelDefinition 
                       WHERE DeveloperName = '${SF_AUTHORIZATION_CONTEXT}'`;
        const encodedQuery = encodeURIComponent(query);
        const url = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${encodedQuery}`;

        const response = await axios.get(url, requestHeader);
        const ccdData = response.data;

        if (!ccdData || !ccdData.records || ccdData.records.length === 0) {
            console.log("No records found in the CCD data");
            return { isValid: false, reason: "No Conversation Channel Definition records found. Please check your CCD configuration." };
        }

        const ccdDataRecord = ccdData.records[0];
        const cviVendorType = ccdDataRecord.ConversationVendorInfo.VendorType;

        if (pageType === 'ccaas') {
            return validateVendorType(cviVendorType, 'BringYourOwnContactCenter', 'CCaaS');
        } else if (pageType === 'ott') {
            return validateVendorType(cviVendorType, 'BringYourOwnChannelPartner', 'OTT');
        } else {
            return { isValid: false, reason: `Unknown page type: ${pageType}. Expected 'ccaas' or 'ott'.` };
        }
    } catch (error) {
        console.error('Error in validateConversationVendorInfo:', error);
        return { 
            isValid: false, 
            reason: `An error occurred during Conversation Vendor Info validation: ${error.message}. Please check your Salesforce connection and permissions.` 
        };
    }
}

/**
 * Helper function to validate the VendorType.
 * 
 * @param {string} actualType - The actual VendorType from the CCD.
 * @param {string} expectedType - The expected VendorType for the page.
 * @param {string} pageName - The name of the page (CCaaS or OTT).
 * @returns {Object} An object containing isValid (boolean) and reason (string) properties.
 */
function validateVendorType(actualType, expectedType, pageName) {
    const isValid = actualType === expectedType;
    const reason = isValid 
        ? `VendorType is valid for ${pageName}: ${actualType}`
        : `VendorType is invalid for ${pageName}. Expected: ${expectedType}, Actual: ${actualType}`;
    return { isValid, reason };
}

/**
 * Validates the Contact Center Channel for custom type.
 * 
 * @returns {Object} An object containing isValid (boolean) and reason (string) properties.
 */
export async function validateContactCenterChannelForCustomType() {
    console.log("\n====== Start validateContactCenterChannelForCustomType");

    const accessToken = await getAccessToken();
    const requestHeader = getValidateCCDRequestHeader(accessToken);

    try {
        // Step 1: Query MessagingChannel
        const messagingChannelQuery = `SELECT Id FROM MessagingChannel WHERE ChannelAddressIdentifier = '${CHANNEL_ADDRESS_IDENTIFIER}' AND MessageType = 'Custom'`;
        const messagingChannelUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${encodeURIComponent(messagingChannelQuery)}`;

        const messagingChannelResponse = await axios.get(messagingChannelUrl, requestHeader);
        
        if (messagingChannelResponse.data.totalSize === 0) {
            console.log('No MessagingChannel records found with Custom type and specified ChannelAddressIdentifier.');
            return { 
                isValid: false, 
                reason: `No matching MessagingChannel found for ChannelAddressIdentifier: ${CHANNEL_ADDRESS_IDENTIFIER} and MessageType: Custom` 
            };
        }

        const messagingChannelId = messagingChannelResponse.data.records[0].Id;

        // Step 2: Query ContactCenterChannel
        const contactCenterChannelQuery = `SELECT COUNT(Id) totalCount FROM ContactCenterChannel WHERE ChannelId = '${messagingChannelId}'`;
        const contactCenterChannelUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${encodeURIComponent(contactCenterChannelQuery)}`;

        const contactCenterChannelResponse = await axios.get(contactCenterChannelUrl, requestHeader);
        
        const totalCount = contactCenterChannelResponse.data.records[0].totalCount;

        if (totalCount > 0) {
            console.log('ChannelId exists in the ContactCenterChannel records. Validation successful.');
            return { isValid: true, reason: `Matching ContactCenterChannel found for MessagingChannel ID: ${messagingChannelId}` };
        } else {
            console.log('ChannelId does not exist in the ContactCenterChannel records. Validation failed.');
            return { 
                isValid: false, 
                reason: `No matching ContactCenterChannel found for MessagingChannel ID: ${messagingChannelId}. Please check your Contact Center Channel configuration.` 
            };
        }

    } catch (error) {
        console.error('Error during Contact Center Channel validation:', error);
        return { 
            isValid: false, 
            reason: `An error occurred during Contact Center Channel validation: ${error.message}. Please check your Salesforce connection and permissions.` 
        };
    }
}

/**
 * Helper function to get the request header for Salesforce API calls.
 * 
 * @param {string} accessToken - The Salesforce access token.
 * @returns {Object} The request header object.
 */
function getValidateCCDRequestHeader(accessToken) {
    return {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      }
    };
}

/**
 * Validates the SCRT2 permissions for the platform event.
 * 
 * @returns {Object} An object containing isValid (boolean) and reason (string) properties.
 */
export async function validateSCRT2PermissionsForPlatformEvent() {
    console.log("\n====== Start validateSCRT2PermissionsForPlatformEvent");

    const accessToken = await getAccessToken();
    const requestHeader = getValidateCCDRequestHeader(accessToken);

    try {
        // Step 1: Query PermissionSet for sfdc_scrt2
        const permissionSetQuery = "SELECT Id FROM PermissionSet WHERE Name = 'sfdc_scrt2'";
        const permissionSetUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${encodeURIComponent(permissionSetQuery)}`;

        const permissionSetResponse = await axios.get(permissionSetUrl, requestHeader);

        if (permissionSetResponse.data.totalSize === 0) {
            console.log('No PermissionSet record found for sfdc_scrt2.');
            return { isValid: false, reason: 'sfdc_scrt2 PermissionSet not found. Please check if the SCRT2 Permission Set is properly configured.' };
        }

        const parentId = permissionSetResponse.data.records[0].Id;

        // Step 2: Get the SObjectType (Platform Event name) from CCD
        const ccdData = await getConversationChannelDefinitions();
        if (!ccdData || !ccdData.records || ccdData.records.length === 0) {
            console.log("No records found in the CCD data");
            return { isValid: false, reason: "No Conversation Channel Definition records found. Please check your CCD configuration." };
        }
        const platformEventName = ccdData.records[0].CustomPlatformEvent;

        // Step 3: Query ObjectPermissions
        const objectPermissionsQuery = `SELECT PermissionsRead, PermissionsCreate 
                                        FROM ObjectPermissions 
                                        WHERE ParentId = '${parentId}' 
                                        AND SObjectType = '${platformEventName}'`;
        const objectPermissionsUrl = `${SF_INSTANCE_URL}/services/data/v${API_VERSION}/query/?q=${encodeURIComponent(objectPermissionsQuery)}`;

        const objectPermissionsResponse = await axios.get(objectPermissionsUrl, requestHeader);

        if (objectPermissionsResponse.data.totalSize === 0) {
            console.log('No ObjectPermissions record found for the specified criteria.');
            return { 
                isValid: false, 
                reason: `No matching ObjectPermissions found for PermissionSet: sfdc_scrt2 and SObjectType: ${platformEventName}. Please check the permission assignments.` 
            };
        }

        const permissions = objectPermissionsResponse.data.records[0];

        if (permissions.PermissionsRead && permissions.PermissionsCreate) {
            console.log('SCRT2 integration user permset is correctly assigned to the platform event.');
            return { isValid: true, reason: 'Required permissions (Read and Create) are set correctly for the SCRT2 integration user on the platform event.' };
        } else {
            console.log('SCRT2 integration user permset is not correctly assigned to the platform event.');
            return { 
                isValid: false, 
                reason: `PermissionsRead and/or PermissionsCreate are not set to true for the SCRT2 integration user on the platform event. Current permissions - Read: ${permissions.PermissionsRead}, Create: ${permissions.PermissionsCreate}` 
            };
        }

    } catch (error) {
        console.error('Error during SCRT2 permissions validation:', error);
        return { 
            isValid: false, 
            reason: `An error occurred during SCRT2 permissions validation: ${error.message}. Please check your Salesforce connection and permissions.` 
        };
    }
}