import FormData from 'form-data';
import fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from "uuid";
import { getAccessToken } from './sfdc-auth.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { agentWork } from './sfdc-byocc-agentwork-api.mjs';
import { settingsCache, convEntryIdsCache } from '../ottAppServer.mjs';
import { getTimeStampForLoglines } from '../util.mjs';

// Import dotenv that loads the config metadata from .env
//require('dotenv').config();

// Get config metadata from .env
const {
  SF_SCRT_INSTANCE_URL, // OTT-needed
  USER_ID,
  CAPACITY_WEIGHT
} = process.env;
const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";
const routingType = "Initial";
/**
 * Sends a SF inbound message to Salesforce via the BYOC REST API.
 *
 * @param {string} orgId: The organization id for the login user
 * @param {string} authorizationContext: The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} channelAddressIdentifier: The channel address identifier used for the inbound/outbound messaging
 * @param {string} endUserClientIdentifier: The end user client identifier used for the inbound/outbound messaging  
 * @param {string} message: The inbound message sent from a end user client to Salesforce
 * @param {object} attachment: The attachment
 * @returns {object} result object from interaction service with successful status or error code
 */
export async function sendSFInboundMessageInteraction(orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, req, routingOwner, autoCreateAgentWork) {
  let message = req.body.message;
  let attachment = req.file;
  let timestamp = req.body.timestamp;
  let messageType = req.body.messageType;
  let optionIdentifier = req.body.optionIdentifier;
  let inReplyToMessageId = req.body.inReplyToMessageId;
  console.log(getTimeStampForLoglines() + `Start sendSFInboundMessageInteraction().\nmessage="${message}"\nattachment=${attachment}\ntimestamp=${timestamp}\nmessageType=${messageType}`);

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

  // Node Cache does not support array, so have to put dummy empty string as placeholder
  convEntryIdsCache.set(entryId, '');
  console.log('-------- add ', entryId, ' into convEntryIdsCache');

  const responseData = await axios.post(
    (IS_LOCAL_CONFIG ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + '/api/v1/interactions',
    formData,
    requestHeader
  ).then(function (response) {
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
        console.log(getTimeStampForLoglines() + `File rename success from "${oldName}" to "${newName}"`);
      });
    }

    fs.recipientUserName
    console.log(getTimeStampForLoglines() + `sendSFInboundMessageInteraction() success for interactionType "${interactionType}": `, response.data);
    checkAndCreateAgentWork(orgId, authorizationContext, routingOwner, response.data, autoCreateAgentWork);

    return response.data;
  })
    .catch(function (error) {
      // Remove the uploaded temp file
      if (attachment) {
        deleteUploadedTempFile(__rootdir + attachment.path);
      }

      let responseData = error.response.data;
      sendSFInboundMessageDeliveryFailedInteraction(entryId, interactionType, orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, responseData.code);

      console.log(getTimeStampForLoglines() + `sendSFInboundMessageInteraction() error for interactionType "${interactionType}": `, responseData);
      return error;
    });

  return responseData;
}

/**
 * Sends a SF inbound TypingStartedIndicator to Salesforce via the BYOC REST API.
 *
 * @param {string} orgId: The organization id for the login user
 * @param {string} authorizationContext: The AuthorizationContext which is ConversationChannelDefinition developer name for request authorization
 * @param {string} channelAddressIdentifier: The channel address identifier used for the inbound/outbound messaging
 * @param {string} endUserClientIdentifier: The end user client identifier used for the inbound/outbound messaging  
 * @returns {object} result object from interaction service with successful status or error code
 */
export async function sendSFInboundTypingIndicatorInteraction(orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, entryType) {
  console.log(getTimeStampForLoglines() + `Start sendSFInboundTypingIndicatorInteraction() with entryType: ${entryType}.`);
  const accessToken = await getAccessToken();
  let jsonData = getSFInboundTypingIndicatorFormData(channelAddressIdentifier, endUserClientIdentifier, entryType);

  const requestHeader = getInboundMessageRequestHeader(accessToken, orgId, authorizationContext);

  const formData = new FormData();
  formData.append('json', JSON.stringify(jsonData), { contentType: 'application/json' });

  const responseData = await axios.post(
    (IS_LOCAL_CONFIG ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + '/api/v1/interactions',
    formData,
    requestHeader
  ).then(function (response) {
    if (response && response.data) {
      console.log(getTimeStampForLoglines() + 'sendSFInboundTypingIndicatorInteraction() success: ', response.data);
    }

    return response;
  })
    .catch(function (error) {
      if (error && error.response && error.response.data) {
        let responseData = error.response.data;
        console.log(getTimeStampForLoglines() + 'sendSFInboundTypingIndicatorInteraction() error: ', responseData);
      }

      return error;
    });

  return responseData;
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
async function sendSFInboundMessageDeliveryFailedInteraction(entryId, interactionType, orgId, authorizationContext, channelAddressIdentifier, endUserClientIdentifier, errorCode) {
  console.log(getTimeStampForLoglines() + `Start sendSFInboundMessageDeliveryFailedInteraction() for interactionType: "${interactionType}" and entryId: "${entryId}".`);
  const accessToken = await getAccessToken();
  let jsonData = getSFInboundMessageDeliveryFailedFormData(entryId, channelAddressIdentifier, endUserClientIdentifier, errorCode);

  const requestHeader = getInboundMessageRequestHeader(accessToken, orgId, authorizationContext);

  const formData = new FormData();
  formData.append('json', JSON.stringify(jsonData), { contentType: 'application/json' });

  const responseData = await axios.post(
    (IS_LOCAL_CONFIG ? SF_SCRT_INSTANCE_URL : settingsCache.get("scrtUrl")) + '/api/v1/interactions',
    formData,
    requestHeader
  ).then(function (response) {
    console.log(getTimeStampForLoglines() + 'sendSFInboundMessageDeliveryFailedInteraction() success: ', response.data);
    return response.data;
  })
    .catch(function (error) {
      if (error && error.response && error.response.data) {
        console.log(getTimeStampForLoglines() + 'sendSFInboundMessageDeliveryFailedInteraction() error: ', error.response.data);
      }

      return error;
    });

  return responseData;
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
      console.log(getTimeStampForLoglines() + 'File delete error: ', err);
    } else {
      console.log(getTimeStampForLoglines() + 'The file was deleted successfully');
    }
  });
}

function checkAndCreateAgentWork(orgId, authorizationContext, routingOwner, interactionResponseData, autoCreateAgentWork) {

  let workItemId;
  let conversationIdentifier;

  if (interactionResponseData.workItemIds !== null && interactionResponseData.workItemIds[0] !== null) {
    workItemId = interactionResponseData.workItemIds[0];
  }

  if (interactionResponseData.conversationIdentifier !== null) {
    conversationIdentifier = interactionResponseData.conversationIdentifier;
    settingsCache.set("conversationIdentifier", conversationIdentifier);
    console.log(getTimeStampForLoglines() + "setting conversationIdentifier into cache!")
  }

  if (autoCreateAgentWork !== 'true') {
    console.log(getTimeStampForLoglines() + "agentwork will not be called as AUTO_CREATE_AGENT_WORK flag is set to false");
    return;
  }

  console.log(getTimeStampForLoglines() + "routingOwner:", routingOwner);
  if (routingOwner !== "Partner") {
    console.log(getTimeStampForLoglines() + "agentwork will not be called as routingOwner is not Partner");
    return;
  }

  console.log(getTimeStampForLoglines() + `workItemId:"${workItemId}"\n======= conversationIdentifier:"${conversationIdentifier}"`);
  if (workItemId !== null && conversationIdentifier !== null) {
    agentWork(orgId, authorizationContext, conversationIdentifier, workItemId, null, 
      (IS_LOCAL_CONFIG ? USER_ID : settingsCache.get("userId")), routingType, uuidv4(), true, true, CAPACITY_WEIGHT);
  }
}