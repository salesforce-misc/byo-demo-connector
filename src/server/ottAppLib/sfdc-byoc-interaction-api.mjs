import FormData from 'form-data';
import fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from "uuid";
import { getAccessToken } from './sfdc-auth.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { settingsCache, convEntryIdsCache, conversationIdCache } from '../ottAppServer.mjs';
import { logger, generateApiUrl } from '../util.mjs';

const interactionsEndpoint = '/api/v1/interactions';

/**
 * Sends a SF inbound message to Salesforce via the BYOC REST API.
 *
 * @param {string} orgId - The organization id for the login user
 * @param {string} authorizationContext - The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} channelAddressIdentifier - The channel address identifier used for the inbound/outbound messaging
 * @param {string} endUserClientIdentifier - The end user client identifier used for the inbound/outbound messaging  
 * @param {Object} req - Express request object containing message data
 * @param {string} routingOwner - The routing owner
 * @param {string} autoCreateAgentWork - Whether to auto-create agent work
 * @returns {Promise<Object>} Result object from interaction service with successful status or error code
 */
export async function sendSFInboundMessageInteraction(orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, req) {
  let message = req.body.message;
  let attachment = req.file;
  let timestamp = req.body.timestamp;
  let messageType = req.body.messageType;
  let optionIdentifier = req.body.optionIdentifier;
  let inReplyToMessageId = req.body.inReplyToMessageId;

  // Send 'TypingStoppedIndicator' request before send the message in order to remove typing indicator if any
  sendSFInboundTypingIndicatorInteraction(orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, 'TypingStoppedIndicator');

  const accessToken = await getAccessToken();
  let jsonData = {};
  let formData = new FormData();
  let interactionType;
  const entryId = uuidv4();

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const __rootdir = __dirname + '/../../../';

  if (attachment === undefined) {
    // Handling according to the messageType
    if (messageType == "ChoicesResponseMessage") {
      jsonData = getSFInboundChoiceResponseMessageFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, optionIdentifier, inReplyToMessageId);
    } else if (messageType == "FormResponseMessage") {
      // TODO: Handle FormResponseMessage
    } else {
      jsonData = getSFInboundTextMessageFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, message);
    }
    interactionType = 'EntryInteraction';
  } else {
    // attachment.path value is something like: uploads/8b8ad9de6dfbef745dc0c0d4a3c89796
    formData.append('attachments', fs.createReadStream(__rootdir + attachment.path), attachment.originalname);
    jsonData = getSFInboundAttachmentMessageFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, message, attachment.size);
    interactionType = 'AttachmentInteraction';
  }

  formData.append('json', JSON.stringify(jsonData), { contentType: 'application/json' });

  const requestHeader = getInboundMessageRequestHeader(accessToken, orgId, authorizationContext);
  const requestId = requestHeader.headers.RequestId;

  // Node Cache does not support array, so have to put dummy empty string as placeholder
  convEntryIdsCache.set(entryId, '');

  logger.info(`POST /interactions API with requestId ${requestId} and interactionType: ${interactionType} and request payload: `, jsonData);
  const interactionsApiUrl = generateApiUrl(settingsCache, interactionsEndpoint);

  try {
    const response = await axios.post(
      interactionsApiUrl,
      formData,
      requestHeader
    );
    
    if (attachment) {
      let fileName = attachment.originalname;
      let parts = fileName.split('.');
      let length = parts.length;
      if (length > 1) {
        let extension = parts.pop();
        fileName = parts.join('.') + timestamp + '.' + extension;
      } else {
        fileName = fileName + timestamp;
      }

      // attachment.path value is something like: uploads/8b8ad9de6dfbef745dc0c0d4a3c89796
      let oldName = __rootdir + attachment.path;
      let newName = __rootdir + 'uploads/' + fileName;
      fs.rename(oldName, newName, () => {
        logger.info(`File rename success from "${oldName}" to "${newName}"`);
      });
    }

    logger.info(`POST /interactions API with requestId ${requestId} completed successfully for interactionType "${interactionType}": `, response.data);

    response.data['conversationEntryId'] = entryId;
    const interactionResponseData = response.data;
    if (interactionResponseData.conversationIdentifier && interactionResponseData.workItemIds && interactionResponseData.workItemIds[0]) {
      conversationIdCache.set(interactionResponseData.conversationIdentifier, {
        workItemId: interactionResponseData.workItemIds[0],
        timestamp: Date.now() // potentially useful in getting last n conversation identifiers
      });
    }
    
    return response.data;
  } catch (error) {
    // Remove the uploaded temp file
    if (attachment) {
      deleteUploadedTempFile(__rootdir + attachment.path);
    }

    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    sendSFInboundMessageDeliveryFailedInteraction(entryId, interactionType, orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, responseData.code);

    logger.error(`POST /interactions API with requestId ${requestId} has error for interactionType "${interactionType}": `, responseData);
    return responseData;
  }
}

/**
 * Sends a SF inbound TypingStartedIndicator to Salesforce via the BYOC REST API.
 *
 * @param {string} orgId - The organization id for the login user
 * @param {string} authorizationContext - The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} channelAddressIdentifier - The channel address identifier used for the inbound/outbound messaging
 * @param {string} endUserClientIdentifier - The end user client identifier used for the inbound/outbound messaging  
 * @param {string} entryType - The entry type (e.g., "TypingStartedIndicator", "TypingStoppedIndicator")
 * @returns {Promise<Object>} Result object from interaction service with successful status or error code
 */
export async function sendSFInboundTypingIndicatorInteraction(orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, entryType) {
  const accessToken = await getAccessToken();
  const jsonData = getSFInboundTypingIndicatorFormData(channelAddressIdentifier, endUserClientIdentifier, entryType);

  const requestHeader = getInboundMessageRequestHeader(accessToken, orgId, authorizationContext);
  const requestId = requestHeader.headers.RequestId;

  const formData = new FormData();
  formData.append('json', JSON.stringify(jsonData), { contentType: 'application/json' });

  logger.info(`POST /interactions API with requestId ${requestId} and entryType: ${entryType} and request payload: `, jsonData);
  const interactionsApiUrl = generateApiUrl(settingsCache, interactionsEndpoint);

  try {
    const response = await axios.post(
      interactionsApiUrl,
      formData,
      requestHeader
    );
    logger.info(`POST /interactions API with requestId ${requestId} completed successfully for entryType "${entryType}": `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`POST /interactions API with requestId ${requestId} has error for entryType "${entryType}": `, responseData);
    return responseData;
  }
}

/**
 * Sends a SF inbound MessageDeliveryFailed to Salesforce via the BYOC REST API.
 *
 * @param {string} entryId: The entryId for the failed message delivery
 * @param {string} orgId: The organization id for the login user
 * @param {string} authorizationContext: The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} channelAddressIdentifier: The channel address identifier used for the inbound/outbound messaging
 * @param {string} endUserClientIdentifier: The end user client identifier used for the inbound/outbound messaging  
 * @returns {object} result object from interaction service with successful status or error code
 */
/**
 * Sends a SF inbound MessageDeliveryFailed to Salesforce via the BYOC REST API.
 *
 * @param {string} entryId - The entryId for the failed message delivery
 * @param {string} interactionType - The interaction type
 * @param {string} orgId - The organization id for the login user
 * @param {string} authorizationContext - The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} channelAddressIdentifier - The channel address identifier used for the inbound/outbound messaging
 * @param {string} endUserClientIdentifier - The end user client identifier used for the inbound/outbound messaging  
 * @param {string} errorCode - The error code
 * @returns {Promise<Object>} Result object from interaction service with successful status or error code
 */
async function sendSFInboundMessageDeliveryFailedInteraction(entryId, interactionType, orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, errorCode) {
  const accessToken = await getAccessToken();
  const jsonData = getSFInboundMessageDeliveryFailedFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, errorCode);

  const requestHeader = getInboundMessageRequestHeader(accessToken, orgId, authorizationContext);
  const requestId = requestHeader.headers.RequestId;

  const formData = new FormData();
  formData.append('json', JSON.stringify(jsonData), { contentType: 'application/json' });

  logger.info(`POST /interactions API with requestId ${requestId} for MessageDeliveryFailed, entryId: "${entryId}" and request payload: `, jsonData);
  const interactionsApiUrl = generateApiUrl(settingsCache, interactionsEndpoint);

  try {
    const response = await axios.post(
      interactionsApiUrl,
      formData,
      requestHeader
    );
    logger.info(`POST /interactions API with requestId ${requestId} completed successfully for MessageDeliveryFailed: `, response.data);
    return response.data;
  } catch (error) {
    let responseData = error.response?.data || { message: error.message, code: error.code || 'UNKNOWN_ERROR' };
    logger.error(`POST /interactions API with requestId ${requestId} has error for MessageDeliveryFailed: `, responseData);
    return responseData;
  }
}

function getSFInboundTextMessageFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, message) {
  return {
    "to": channelAddressIdentifier,
    "from": endUserClientIdentifier,
    "interactions": [{
      "timestamp": 1688190840000,
      "interactionType": "EntryInteraction",
      "payload": {
        "id": entryId,
        "entryType": "Message",
        "abstractMessage": {
          "messageType": "StaticContentMessage",
          "id": entryId,
          "staticContent": {
            "formatType": "Text",
            "text": message
          }
        }
      }
    }]
  };
}

function getSFInboundChoiceResponseMessageFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, optionIdentifier, inReplyToMessageId) {
  return {
    "to": channelAddressIdentifier,
    "from": endUserClientIdentifier,
    "interactions": [{
      "timestamp": 1688190840000,
      "interactionType": "EntryInteraction",
      "payload": {
        "id": entryId,
        "entryType": "Message",
        "abstractMessage": {
          "messageType": "ChoicesResponseMessage",
          "id": entryId, 
          "inReplyToMessageId": inReplyToMessageId,
          "choicesResponse": {
            "formatType": "Selections",
            "selectedOptions": [{
                "optionIdentifier": optionIdentifier
              }
            ]
          }
        }
      }
    }]
  };
}

function getSFInboundAttachmentMessageFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, message, contentLength) {
  return {
    "to": channelAddressIdentifier,
    "from": endUserClientIdentifier,
    "interactions": [{
      "timestamp": 1688190840000,
      "interactionType": "AttachmentInteraction",
      "id": entryId,
      "attachmentIndex": 0,
      "contentLength": contentLength,
      "text": message
    }]
  };
}

function getSFInboundTypingIndicatorFormData(channelAddressIdentifier, endUserClientIdentifier, entryType) {
  const uuid = uuidv4();
  return {
    "to": channelAddressIdentifier,
    "from": endUserClientIdentifier,
    "interactions": [{
      "timestamp": 1688190840000,
      "interactionType": "EntryInteraction",
      "payload": {
        "id": uuid,
        "entryType": entryType,
        "timestamp": 1688190840000
      }
    }]
  };
}

function getSFInboundMessageDeliveryFailedFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, errorCode) {
  const uuid = uuidv4();
  return {
    "to": channelAddressIdentifier,
    "from": endUserClientIdentifier,
    "interactions": [{
      "timestamp": 1688190840000,
      "interactionType": "EntryInteraction",
      "payload": {
        "id": uuid,
        "failedConversationEntryIdentifier": entryId,
        "entryType": "MessageDeliveryFailed",
        "recipient": {
          "appType": "custom",
          "subject": endUserClientIdentifier,
          "role": "EndUser"
        },
        "errorCode": "" + errorCode
      }
    }]
  };
}

function getInboundMessageRequestHeader(accessToken, orgId, authorizationContext) {
  const uuid = uuidv4();
  return {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "multipart/form-data",
      "Accept": "application/json",
      "OrgId": orgId,
      "AuthorizationContext": authorizationContext,
      "RequestId": uuid
    }
  };
}

function append_object_to_FormData(formData, obj, key) {
  var i, k;
  for (i in obj) {
    k = key ? key + '[' + i + ']' : i;
    if (typeof obj[i] == 'object')
      append_object_to_FormData(formData, obj[i], k);
    else
      formData.append(k, obj[i]);
  }
}

function deleteUploadedTempFile(filePath) {
  fs.unlink(filePath, function (err) {
    if (err) {
      logger.info('File delete error: ', err);
    } else {
      logger.info('The file was deleted successfully');
    }
  });
}