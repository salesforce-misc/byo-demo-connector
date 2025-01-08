/*
 * NodeJS Server for ottApp
 * @author james.wang
 */
import express from 'express';
import customEnv from 'custom-env';
import messagingConstants from "./messagingConstants.mjs";
import multer from 'multer';
import {getEventSchema, subscribe, parseEvent, connectToPubSubApi} from './ottAppLib/sfdc-pub-sub-api.mjs';
import {sendSFInboundMessageInteraction, sendSFInboundTypingIndicatorInteraction} from './ottAppLib/sfdc-byoc-interaction-api.mjs';
import { sendAcknowledgement } from './ottAppLib/sfdc-byocc-acknowledgement-api.mjs';
import {sendRunApiLabRequest} from './ottAppLib/sfdc-byocc-lab-api.mjs';
import {getAccessToken} from './ottAppLib/sfdc-auth.mjs';
import { getConversationChannelDefinitions, getCustomMsgChannel } from './ottAppLib/sfdc-auto-populate.mjs';
import { validateCCDFieldsOnPlatformEvent, validateConversationVendorInfo, validateContactCenterChannelForCustomType, validateSCRT2PermissionsForPlatformEvent } from './ottAppLib/sfdc-health-check.mjs';
import path from 'path';
import cors from 'cors';
import NodeCache from "node-cache" ;
import {fileURLToPath} from 'url';
import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({ extended: false });
const jsonParser = bodyParser.json();
import { getTimeStampForLoglines } from './util.mjs';

customEnv.env();

// Get config metadata from .env
const {
  SF_AUTHORIZATION_CONTEXT,
  SF_PUB_SUB_TOPIC_NAME,
  SF_PUB_SUB_CUSTOM_EVENT_PAYLOAD_FIELD,
  SF_PUB_SUB_CUSTOM_EVENT_TYPE_FIELD,
  SF_ORG_ID,
  CHANNEL_ADDRESS_IDENTIFIER,
  END_USER_CLIENT_IDENTIFIER,
  SF_SUBJECT,
  USER_ID,
  AUTO_CREATE_AGENT_WORK,
  SF_INSTANCE_URL,
  SF_SCRT_INSTANCE_URL,
  API_VERSION,
  IS_OTT
} = process.env;

const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";
console.log(getTimeStampForLoglines() + "Using local config : " + IS_LOCAL_CONFIG);
// cache settings in node cache
export const settingsCache = new NodeCache();
export const convEntryIdsCache = new NodeCache();

// Set the following non-dynamical data below from .env to the settingsCache:
settingsCache.set("authorizationContext", SF_AUTHORIZATION_CONTEXT);
settingsCache.set("customPlatformEvent", SF_PUB_SUB_TOPIC_NAME);
settingsCache.set("customEventPayloadField", SF_PUB_SUB_CUSTOM_EVENT_PAYLOAD_FIELD);
settingsCache.set("customEventTypeField", SF_PUB_SUB_CUSTOM_EVENT_TYPE_FIELD);
settingsCache.set("channelAddressIdentifier", CHANNEL_ADDRESS_IDENTIFIER);
settingsCache.set("endUserClientIdentifier", END_USER_CLIENT_IDENTIFIER);
settingsCache.set("autoCreateAgentWork", AUTO_CREATE_AGENT_WORK);
settingsCache.set("orgId", SF_ORG_ID);
settingsCache.set("instanceUrl", SF_INSTANCE_URL);
settingsCache.set("scrtUrl", SF_SCRT_INSTANCE_URL);
settingsCache.set("userId", USER_ID);
settingsCache.set("userName", SF_SUBJECT);
settingsCache.set("IS_OTT", IS_OTT);

// function to dynamically fetch conversation channel definition values and set in the settingsCache
async function fetchAndCacheCCDValues() {
  try {
    const isOTT = settingsCache.get("IS_OTT") === 'true';

    if (!isOTT) {
      // Set the following dynamically fetched CCD data below to the settingsCache:
      //    - devName
      //    - routingOwner
      //    - consentOwner
      //    - custom event
      //    - custom event payload field
      //    - custom event type field
      //    - partner support BYO inbound acknowledgements
      //    - partner support BYO typing indicators
      //    - salesforce setup supports BYO inbound acknowledgements
      //    - salesforce setup supports BYO typing indicators
      const ccdData = await getConversationChannelDefinitions();
      if(ccdData && ccdData.records && ccdData.records.length  > 0){
        const ccdDataRecord = ccdData.records[0];
        settingsCache.set("authorizationContext", ccdDataRecord.DeveloperName);
        settingsCache.set("customPlatformEvent", `/event/${ccdDataRecord.CustomPlatformEvent}`);
        settingsCache.set("customEventPayloadField", ccdDataRecord.CustomEventPayloadField);
        settingsCache.set("customEventTypeField", ccdDataRecord.CustomEventTypeField);
        settingsCache.set("routingOwner", ccdDataRecord.RoutingOwner);
        settingsCache.set("consentOwner", ccdDataRecord.ConsentOwner);
        settingsCache.set("isInboundReceiptsPartnerEnabled", ccdDataRecord.IsInboundReceiptsEnabled);
        settingsCache.set("isTypingIndicatorPartnerEnabled", !ccdDataRecord.IsTypingIndicatorDisabled);
  
        if (ccdDataRecord.Id) {
          settingsCache.set("ccdId", ccdDataRecord.Id);
          const cmcData = await getCustomMsgChannel(ccdDataRecord.Id);
          if (cmcData && cmcData.records && cmcData.records.length > 0) {
            const cmcDataRecord = cmcData.records[0];
            settingsCache.set("isInboundReceiptsSalesforceEnabled", cmcDataRecord.HasInboundReceipts);
            settingsCache.set("isTypingIndicatorSalesforceEnabled", cmcDataRecord.HasTypingIndicator);
          } else {
            // set CMC default values
            settingsCache.set("isInboundReceiptsSalesforceEnabled", false);
            settingsCache.set("isTypingIndicatorSalesforceEnabled", true);
          }
        }
  
        console.log(getTimeStampForLoglines() + 'CCD values cached successfully');
      } else {
        console.log(getTimeStampForLoglines() + "No records found in the CCD data");
      }
    }

    // Calling the PubSub API after getting the ccd fields and custom platform event
    console.log(getTimeStampForLoglines() + `connectToPubSubApi() `);
    let sfdcPubSubClient = await connectToPubSubApi();
    subscribeToSfInteractionEvent(sfdcPubSubClient);    
  } catch (error) {
    console.error('Error fetching CCD values:', error);
  }
}

export async function initOttApp(expressApp) {

  expressApp.use(cors());
  fetchAndCacheCCDValues();

  // Init upload dir
  const upload = multer({ dest: 'uploads/' });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const UPLOADS_DIR = '/../../uploads';
  expressApp.use('/uploads', express.static(__dirname + UPLOADS_DIR));
  console.log(getTimeStampForLoglines() + 'uplaod dir: ', __dirname + UPLOADS_DIR);

  // ========== Endpoint definitions start. ==========
  // Register app endpoint to load index.html page
  expressApp.get('/', (_req, res) => {
    // Load index.html page
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  // Register sendmessage endpoint
  expressApp.post('/sendmessage', upload.single('attachment'), (req, res) => {
      const responseData = handleSendmessage(req);
      res.json(responseData); 
  });

  // Register apiLab endpoint
  expressApp.post('/apiLab', jsonParser, (req, res) => {
    try{
      console.log(getTimeStampForLoglines() + "ottAppServer apiLab call");
      console.dir(req.body);
      switch (req.body.apiName) {
        case 'CONSENT':
          req.body = {
            // fields value from UI
            "apiName": req.body.apiName,
            "consentStatus": req.body.consentStatus,
            // fields value from cache
            "endUserClientIdentifier": settingsCache.get(
                "endUserClientIdentifier"),
            "channelAddressIdentifier": settingsCache.get(
                "channelAddressIdentifier")
          }
          break;
        case 'POST_ROUTE':
          req.body = {
            // fields value from UI
            "apiName": req.body.apiName,
            "conversationIdentifier": req.body.conversationIdentifier,
            "routingType": req.body.routingType,
            "routingInfo": req.body.routingInfo,
            "flow": req.body.flow,
            "fallBackQueue": req.body.fallBackQueue,
            "routingAttributes": req.body.routingAttributes,
            "queue": req.body.queue,
          }
          break;
        case 'DELETE_ROUTE':
          req.body = {
            // fields value from UI
            "apiName": req.body.apiName,
            "conversationIdentifier": req.body.conversationIdentifier,
          }
          break;
        case 'POST_ROUTING_RESULT':
          req.body = {
            // fields value from UI
            "apiName": req.body.apiName,
            "conversationIdentifier": req.body.conversationIdentifier,
            "workItemId":req.body.workItemId,
            "success": req.body.success,
            "externallyRouted": req.body.externallyRouted,
            "errorMessage":req.body.errorMessage
          }
          break;
        case 'POST_AGENT_WORK':
            if (req.body.interactionRequest === "CAPACITY_PERCENTAGE") {
              req.body = {
                // fields value from UI
                "apiName": req.body.apiName,
                "userId": req.body.userId,
                "workItemId": req.body.workItemId,
                "interactionRequest": req.body.interactionRequest,
                "capacityPercentage": req.body.capacityPercentage,
                "conversationIdentifier": req.body.conversationIdentifier,
                "routingType": req.body.routingType,
                "routingCorrelationId": req.body.routingCorrelationId,
                "agentActionVisibilities": req.body.agentActionVisibilities
              };
            } else if (req.body.interactionRequest === "CAPACITY_WEIGHT") {
              req.body = {
                // fields value from UI
                "apiName": req.body.apiName,
                "userId": req.body.userId,
                "workItemId": req.body.workItemId,
                "interactionRequest": req.body.interactionRequest,
                "capacityWeight": req.body.capacityWeight,
                "conversationIdentifier": req.body.conversationIdentifier,
                "routingType": req.body.routingType,
                "routingCorrelationId": req.body.routingCorrelationId,
                "agentActionVisibilities": req.body.agentActionVisibilities
              };
            } else {
              req.body = {
                // fields value from UI
                "apiName": req.body.apiName,
                "userId": req.body.userId,
                "workItemId": req.body.workItemId,
                "interactionRequest": req.body.interactionRequest,
                "agentActionVisibilities": req.body.agentActionVisibilities
              };
            }
            break;
      }
      sendRunApiLabRequest(req).then(response =>{
        res.json(response);
      });
    } catch {
      console.error("Error handling /apiLab request:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Register setcallcenterconfig endpoint
  expressApp.post('/setcallcenterconfig', jsonParser, (req, res) => {
    console.log(getTimeStampForLoglines() + "/setcallcenterconfig request:", req);
    settingsCache.set("authorizationContext", req.body.authorizationContext);
    settingsCache.set("userId", req.body.userId);
    settingsCache.set("userName", req.body.userName);
    settingsCache.set("customEventPayloadField", req.body.customEventPayloadField);
    settingsCache.set("customPlatformEvent", `/event/${req.body.customPlatformEvent}`);
    settingsCache.set("customEventTypeField", req.body.customEventTypeField);
    settingsCache.set("routingOwner", req.body.routingOwner);
    settingsCache.set("instanceUrl", `https://${req.body.instanceUrl}`);
    settingsCache.set("scrtUrl", req.body.scrtUrl);
    settingsCache.set("orgId", req.body.orgId);
    res.send('{"status": 200}');
  });

  // Register sendsettings endpoint
  expressApp.post('/sendsettings', jsonParser, (req, res) => {
    console.log(getTimeStampForLoglines() + "/sendsettings request:", req);
    settingsCache.set("authorizationContext", req.body.authorizationContext);
    settingsCache.set("channelAddressIdentifier", req.body.channelAddressIdentifier);
    settingsCache.set("endUserClientIdentifier", req.body.endUserClientIdentifier);
    settingsCache.set("customEventPayloadField", req.body.customEventPayloadField);
    settingsCache.set("routingOwner", req.body.routingOwner);
    settingsCache.set("customEventTypeField", req.body.customEventTypeField);
    settingsCache.set("autoCreateAgentWork", AUTO_CREATE_AGENT_WORK);
    settingsCache.set("userId", req.body.userId);

    res.send('{"status": 200}');
  });

  // Register CCD endpoint
  expressApp.get('/getConversationChannelDefinitions', async (req, res) => {
    try {
      console.log(getTimeStampForLoglines() + "/getConversationChannelDefinitions request:", req);
      const ccdData = await getConversationChannelDefinitions();
      res.json(ccdData);
    } catch (error) {
      console.error('Error fetching ConversationChannelDefinitions:', error);
      res.status(500).json({ error: 'Failed to fetch ConversationChannelDefinitions' });
    }
  });

  // Register CMC endpoint
  expressApp.post('/getCustomMsgChannels', async (req, res) => {
    try {
      console.log(getTimeStampForLoglines() + "/getCustomMsgChannel request with ccdId: ", req.body.ccdId);
      const cmcData = await getCustomMsgChannel(req.body.ccdId);
      res.json(cmcData);
    } catch (error) {
      console.error('Error fetching CustomMsgChannels:', error);
      res.status(500).json({ error: 'Failed to fetch CustomMsgChannels' });
    }
  });

  // Register health check validation tests endpoint
  expressApp.get('/runAllValidationTests', async (req, res) => {
    console.log(getTimeStampForLoglines() + "Received request for /runAllValidationTests");
    try {
        const pageType = req.query.pageType;

        if (pageType !== 'ccaas' && pageType !== 'ott') {
            throw new Error('Invalid page type');
        }

        const results = {
            ccdFields: await validateCCDFieldsOnPlatformEvent(),
            conversationVendorInfo: await validateConversationVendorInfo(pageType),
            contactCenterChannel: await validateContactCenterChannelForCustomType(),
            scrt2Permissions: await validateSCRT2PermissionsForPlatformEvent()
        };

        res.json({
            success: true,
            results: results
        });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

  // Register getsettings endpoint
  expressApp.get('/getsettings', urlencodedParser, (req, res) => {
    const responseData = {
      authorizationContext: settingsCache.get("authorizationContext"),
      channelAddressIdentifier: CHANNEL_ADDRESS_IDENTIFIER,
      endUserClientIdentifier: END_USER_CLIENT_IDENTIFIER,
      customPlatformEvent: settingsCache.get("customPlatformEvent"),
      customEventPayloadField: settingsCache.get("customEventPayloadField"),
      customEventTypeField: settingsCache.get("customEventTypeField"),
      sfSubject: settingsCache.get("userName"),
      routingOwner: settingsCache.get("routingOwner"),
      autoCreateAgentWork : AUTO_CREATE_AGENT_WORK,
      userId : settingsCache.get("userId"),
      isOTT : IS_OTT
    };

    let authorizationContext = settingsCache.get("authorizationContext");
    let channelAddressIdentifier = settingsCache.get("channelAddressIdentifier");
    let endUserClientIdentifier = settingsCache.get("endUserClientIdentifier");
    let customPlatformEvent = settingsCache.get("customPlatformEvent");
    let customEventPayloadField = settingsCache.get("customEventPayloadField");
    let customEventTypeField = settingsCache.get("customEventTypeField");
    let routingOwner = settingsCache.get("routingOwner");
    let autoCreateAgentWork = settingsCache.get("autoCreateAgentWork");
    let userId = settingsCache.get("userId");
    let isOTT = settingsCache.get("isOTT");

    if (authorizationContext) {
      responseData.authorizationContext = authorizationContext;
    }
    if (channelAddressIdentifier) {
      responseData.channelAddressIdentifier = channelAddressIdentifier;
    }
    if (endUserClientIdentifier) {
      responseData.endUserClientIdentifier = endUserClientIdentifier;
    }
    if (customPlatformEvent) {
      responseData.customPlatformEvent = customPlatformEvent;
    }    
    if (customEventPayloadField) {
      responseData.customEventPayloadField = customEventPayloadField;
    }
    if (customEventTypeField) {
      responseData.customEventTypeField = customEventTypeField;
    }
    if (routingOwner) {
      responseData.routingOwner = routingOwner;
    }
    if (autoCreateAgentWork != null) {
      responseData.autoCreateAgentWork = autoCreateAgentWork;
    }
    if (userId){
      responseData.userId = userId;
    }
    if (isOTT){
      responseData.isOTT = isOTT;
    }   
    
    res.json(responseData);
  });
  //register endpoint to get IS_LOCAL_CONFIG
  expressApp.get('/is-local-config', async (_req, res) => {
    res.send(IS_LOCAL_CONFIG);
  });

  expressApp.get('/replyMessage', (req, res) => {
    if (sendMessageTimeoutId) {
      clearTimeout(sendMessageTimeoutId);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    sendMessageAtInterval(100, res);
  });

  // Register endpoint to refresh SFDC access token
  expressApp.get('/refresh-sfdc-access-token', async (_req, res) => {
    const accessToken = await getAccessToken(true);

    res.send(accessToken);
  });

  expressApp.get('/subscribe-to-interaction-event', async (_req, res) => {
    subscribeToSfInteractionEvent(sfdcPubSubClient);

    res.send('Subscribed to the Interaction event.');
  });

  expressApp.get('/connect-and-subscribe', async (_req, res) => {
    let sfdcPubSubClient = await connectToPubSubApi();
    subscribeToSfInteractionEvent(sfdcPubSubClient);

    res.send('Connected to PubSub and Subscribed to the Interaction event.');
  });

  expressApp.post('/setOrgMode', async (_req, res) => {
    settingsCache.set('orgMode', _req.body.orgMode);
    console.log(getTimeStampForLoglines() + "OTT SERVER settingsCache.set('orgMode') : " + _req.body.orgMode);
    res.send({success:true});
  });

  expressApp.get('/getOrgMode', async (_req, res) => {
    let cachedOrgMode = settingsCache.get('orgMode');
    console.log(getTimeStampForLoglines() + "OTT SERVER settingsCache.get('orgMode') : " + cachedOrgMode);

    // If cachedOrgMode is invalid, it means that setDemoConnectorMode() in remote-control/main.js hasn't been triggered. Just set MESSAGING_ONLY orgMode by default.
    if (!cachedOrgMode) {
      cachedOrgMode = 'MESSAGING_ONLY';
      settingsCache.set('orgMode', cachedOrgMode);
    }

    res.send({orgMode: cachedOrgMode});
  });

  expressApp.get('/getApiVersion', (req, res) => {
    res.send(API_VERSION);
  });

  expressApp.get('/convEntryIds', async (_req, res) => {
    res.send(convEntryIdsCache.keys());
  });
  
  // ========== Endpoint definitions end. ==========

  // Calling PubSub API in fetchAndCacheCCDValues() function to prevent race conditions
  // Init SF Pub/Sub Api and subscribe outbound message event
  // console.log(getTimeStampForLoglines() + `connectToPubSubApi() `);
  // let sfdcPubSubClient = await connectToPubSubApi();
  // subscribeToSfInteractionEvent(sfdcPubSubClient);
}
 
// Register custom event to send reply message
let repliedMessages = [];
let msgId = 1;
let sendMessageTimeoutId;

function sendMessageAtInterval(interval, res) {
  while (repliedMessages.length) {
    let msg = repliedMessages.shift();

    console.log(getTimeStampForLoglines() + `reply message from message queue: `, msg);

    res.write(`event: replymsg\n`);
    res.write(`data: ${msg}\n`);
    res.write(`id: ${msgId}\n\n`);
    msgId++;
  }
  sendMessageTimeoutId = setTimeout(sendMessageAtInterval.bind(null, interval, res), interval);
}

// Event handler
function handleSendmessage(req) {
  let responseData = {};
  let interactionType = req.body.interactionType;
  let entryType = req.body.entryType;

  // return and warn if non-ott doesn't have all the critical data
  if (!IS_LOCAL_CONFIG && !(settingsCache.get("orgId") && settingsCache.get("authorizationContext") && settingsCache.get("channelAddressIdentifier") && settingsCache.get("endUserClientIdentifier") && settingsCache.get("scrtUrl"))) {
    console.log(getTimeStampForLoglines() + "[Warn] Please check if the user is in a Contact Center, and refresh your (1) Salesforce App and then (2)demo connector page to retrieve critical contact center data to start sending messages.");
    return responseData;
  }

  if (interactionType === 'AttachmentInteraction' || (interactionType === 'EntryInteraction' && entryType === 'Message')) {
    responseData = sendSFInboundMessageInteraction(settingsCache.get("orgId"), settingsCache.get("authorizationContext"), settingsCache.get("channelAddressIdentifier"), settingsCache.get("endUserClientIdentifier"), req, settingsCache.get("routingOwner"), settingsCache.get("autoCreateAgentWork"));
  } else if (interactionType === 'EntryInteraction' && entryType === 'TypingStartedIndicator') {
    responseData = sendSFInboundTypingIndicatorInteraction(settingsCache.get("orgId"), settingsCache.get("authorizationContext"), settingsCache.get("channelAddressIdentifier"), settingsCache.get("endUserClientIdentifier"), entryType);
  }
  return responseData;
}

async function subscribeToSfInteractionEvent(sfdcPubSubClient) {
  try {
    // sfdcPubSsubClient can be null while only using phone
    if (!sfdcPubSubClient) {
      return;
    }
    console.log(getTimeStampForLoglines() + `start subscribeToSfInteractionEvent()`);

    const subscription = subscribe(sfdcPubSubClient, settingsCache.get("customPlatformEvent"));
    const topicSchema = await getEventSchema(sfdcPubSubClient, settingsCache.get("customPlatformEvent"));
    console.log(getTimeStampForLoglines() + `topicSchema: `, topicSchema);

    // Listen to new events.
    subscription.on('data', (data) => {
      if (data.events) {
        const latestReplayId = data.latestReplayId.readBigUInt64BE();
        console.log(getTimeStampForLoglines() + 
          `Received ${data.events.length} events, latest replay ID: ${latestReplayId}`, data.events[0].event
        );
        const parsedEvents = data.events.map((event) =>
          parseEvent(topicSchema, event)
        );

        parsedEvents.forEach(async (event) => {
          console.log(getTimeStampForLoglines() + 'gRPC event: ', event);

          // #1: retrieve event type
          let eventTypeField = getFieldValue(event, settingsCache.get("customEventTypeField"));
          let customEventTypeFieldFromSettings = settingsCache.get("customEventTypeField");
          console.log(getTimeStampForLoglines() + 'customEventTypeField / customEventTypeFieldFromSettings: ', ((eventTypeField && eventTypeField.string) ? eventTypeField.string: 'null'), customEventTypeFieldFromSettings);

          let channelAddressIdFieldVal = null;
          let payloadFieldObj = null;
          let recipientFieldValObj = null;
          let payloadField = null;
          let conversationEntryId = null;

          if (eventTypeField && eventTypeField.string) {
            console.log(getTimeStampForLoglines() + 'customEventType found in received platform event ========');

            if (eventTypeField.string === messagingConstants.EVENT_TYPE.INTERACTION || eventTypeField.string === messagingConstants.EVENT_TYPE.ROUTING_REQUESTED) {
              // #1: retrieve event payload
              payloadField = getFieldValue(event, settingsCache.get("customEventPayloadField"));
              console.log(getTimeStampForLoglines() + 'payloadField: ', payloadField);
              if (!payloadField) {
                return;
              }
              let payloadFieldVal = payloadField.string;
              console.log(getTimeStampForLoglines() + 'payloadFieldVal: ', payloadFieldVal);
              let outerPayloadFieldObj = JSON.parse(payloadFieldVal);
              payloadFieldObj = getFieldValue(outerPayloadFieldObj, 'payload');
              console.log(getTimeStampForLoglines() + 'messagePayload: ', payloadFieldObj);

              // #1: retrieve channel address id
              channelAddressIdFieldVal = getFieldValue(outerPayloadFieldObj, 'channelAddressIdentifier');
              if (!channelAddressIdFieldVal) {
                return;
              }

              // #3: retrieve recipient
              recipientFieldValObj = getFieldValue(outerPayloadFieldObj, 'recipient');
              if (!recipientFieldValObj) {
                return;
              }

              // #4: conversationEntry id
              conversationEntryId = getFieldValue(outerPayloadFieldObj.payload, 'identifier');
            } else {
              console.log(getTimeStampForLoglines() + 'Event type not supported: ', eventTypeField.string);
              return;
            }
          }

          let type = eventTypeField.string;
          let channelAddressIdFromSettings = settingsCache.get("channelAddressIdentifier");
          console.log(getTimeStampForLoglines() + 'channelAddressIdField / channelAddressIdFromSettings: ', channelAddressIdFieldVal, channelAddressIdFromSettings);

          if (!channelAddressIdFieldVal || channelAddressIdFieldVal !== channelAddressIdFromSettings) {
            return;
          }
          console.log(getTimeStampForLoglines() + 'channelAddressIdFieldVal: ', channelAddressIdFieldVal);
          
          console.log(getTimeStampForLoglines() + 'recipientField: ', recipientFieldValObj);
          let recipientUserName = getFieldValue(recipientFieldValObj, 'subject');
          console.log(getTimeStampForLoglines() + 'recipientUserName: ', recipientUserName);
          let endUserClientIdentifierFromSettings = settingsCache.get("endUserClientIdentifier");
         
          if (!recipientUserName || recipientUserName !== endUserClientIdentifierFromSettings) {
            return;
          }
          let replyObjStr;
          if (eventTypeField.string === messagingConstants.EVENT_TYPE.INTERACTION){
            let messageType = getFieldValue(payloadFieldObj, 'messageType');

            // Handling according to the messageType
            switch (messageType) {
              case 'ChoicesMessage': 
                replyObjStr = handleChoiceMessage(type, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj);
                break;
              case 'FormMessage':
                // TODO: Handle Form Message Type
                break;
              default:
                replyObjStr = handleStaticContentMessage(type, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj);
                break;
            }
          } else if (eventTypeField.string == messagingConstants.EVENT_TYPE.ROUTING_REQUESTED){

            // Push stringfied reply obj
            console.log(getTimeStampForLoglines() + 'sending object for routeingRequested event: ', payloadField);
            replyObjStr = JSON.stringify({
              type,
              channelAddressIdFieldVal,
              recipientUserName,
              payloadField
            });
          }
          console.log(getTimeStampForLoglines() + 'Event processing done');

          repliedMessages.push(replyObjStr);

          // Call IS acknowledge API to send Delivered/Read reciept
          if (!settingsCache.get("conversationIdentifier")) {
            throw Error('no conversation identifier found in cache! Cannot proceed acknowledgement request');
          }

          let conversationId = settingsCache.get("conversationIdentifier");
          console.log(getTimeStampForLoglines() + 'Conversation Identifier From Cache: ' + settingsCache.get("conversationIdentifier"));

          if (conversationEntryId === null) {
            throw Error('no conversationEntry identifier found in event! Cannot proceed acknowledgement request');
          }
          console.log(getTimeStampForLoglines() + 'ConversationEntry Identifier: ' + conversationEntryId);

          console.log(getTimeStampForLoglines() + 'Sending acknowledgement API post request...');

          // Acceptable Acknowledgement Type: {"Read", "Delivered"}, by default, we send a 'Read' acknowledgement for every message received. 
          let responseData = await sendAcknowledgement(conversationId, conversationEntryId, "Read");
          console.log(getTimeStampForLoglines() + 'Acknowledgement API response received. ' + JSON.stringify(responseData));
        });
      } else {
        // If there are no events then every 270 seconds the system will keep publishing the latestReplayId.
      }
    });
    subscription.on('end', () => {
      console.log(getTimeStampForLoglines() + 'gRPC stream ended');
    });
    subscription.on('error', (err) => {
      // TODO: Handle errors
      console.error(getTimeStampForLoglines() + 'gRPC stream error: ', JSON.stringify(err));
    });
    subscription.on('status', (status) => {
      console.log(getTimeStampForLoglines() + 'gRPC stream status: ', status);
    });

    // TODO: Placeholder for omni service side event for routing
    // #2: Subscribe agent status change event 
    // const SF_AGENT_STATUS_PUB_SUB_TOPIC_NAME = "/event/MessagingRouting";
    // const subscription_status = subscribe(sfdcPubSubClient, SF_AGENT_STATUS_PUB_SUB_TOPIC_NAME);
    // const topicSchema_status = await getEventSchema(sfdcPubSubClient, SF_AGENT_STATUS_PUB_SUB_TOPIC_NAME);
    // console.log(getTimeStampForLoglines() + `topicSchema for agent status event: `, topicSchema_status);

    // // Listen to new events.
    // subscription_status.on('data', (data) => {
    //   if (data.events) {
    //     const latestReplayId = data.latestReplayId.readBigUInt64BE();
    //     console.log(getTimeStampForLoglines() + 
    //       `Received agent status ${data.events.length} events, latest replay ID: ${latestReplayId}`, data.events[0].event
    //     );

    //     const parsedEvents = data.events.map((event) =>
    //       parseEvent(topicSchema_status, event)
    //     );
    //     console.log(getTimeStampForLoglines() + 
    //       `Parsed agent status event:`, parsedEvents
    //     );

    //     parsedEvents.forEach((event) => {
    //       console.log(getTimeStampForLoglines() + 'gRPC agent status event: ', event);
    //     });

    //   }
    // });
    
  } catch (err) {
    console.error('Fatal error: ', err);
  }
}

function getFieldValue(payload, fieldName) {
  for (const key in payload) {
    if (key === fieldName) {
      return payload[key];
    } else if (typeof payload[key] === 'object') {
      const result = getFieldValue(payload[key], fieldName);
      if (result !== undefined) {
        return result;
      }
    }
  }
}

function handleStaticContentMessage(type, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj) {
  let replyMessageText = getFieldValue(payloadFieldObj, 'text');
  console.log(getTimeStampForLoglines() + 'replyMessageText: ', replyMessageText);

  let formatType = getFieldValue(payloadFieldObj, "formatType");
  let attachmentName = null;
  let attachmentUrl = null;
  let previewImageUrl = null;
  let url = null;
  let title = null;

  if (formatType === "Attachments") {
    let attachments = getFieldValue(payloadFieldObj, 'attachments');
    if (attachments.length > 0) {
      attachmentName = getFieldValue(attachments[0], 'name');
      attachmentUrl = getFieldValue(attachments[0], 'url');
    }
  }
  console.log(getTimeStampForLoglines() + 'attachmentName / attachmentUrl: ', attachmentName, attachmentUrl);

  if (formatType === "RichLink") {
    previewImageUrl = getFieldValue(payloadFieldObj, 'assetUrl');
    url = getFieldValue(payloadFieldObj, 'url');
    title = getFieldValue(payloadFieldObj, 'title');
  }

  return JSON.stringify({
    type,
    messageType,
    channelAddressIdFieldVal,
    replyMessageText,
    attachmentName,
    attachmentUrl,
    recipientUserName,
    payloadField,
    previewImageUrl,
    url,
    title
  });

}

function handleChoiceMessage(type, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj) {
  let abstractMessage = getFieldValue(payloadFieldObj, 'abstractMessage');
  if (!abstractMessage) {
    console.log(getTimeStampForLoglines() + 'Error: abstractMessage not found in payloadFieldObj');
    return JSON.stringify({
      type: 'Error',
      error: 'abstractMessage not found in payloadFieldObj'
    });
  }

  let choices = getFieldValue(abstractMessage, 'choices');
  if (!choices) {
    console.log(getTimeStampForLoglines() + 'Error: choices not found in abstractMessage');
    return JSON.stringify({
      type: 'Error',
      error: 'choices not found in abstractMessage'
    });
  }

  let formatType = getFieldValue(choices, 'formatType');
  let choiceText = getFieldValue(choices, 'text');
  let optionItems = getFieldValue(choices, 'optionItems');

  console.log(getTimeStampForLoglines() + 'Choice Message: ', choiceText);
  console.log(getTimeStampForLoglines() + 'Format Type: ', formatType);
  console.log(getTimeStampForLoglines() + 'Option Items: ', optionItems);

  if (formatType === 'Buttons') {
    let buttons = optionItems.map(item => ({
      title: getFieldValue(item, 'titleItem.title'),
      identifier: getFieldValue(item, 'optionIdentifier')
    }));

    return JSON.stringify({
      type,
      messageType,
      channelAddressIdFieldVal,
      formatType,
      choiceText,
      optionItems,
      buttons,
      recipientUserName,
      payloadField
    });

  } else {
    // TODO: Handle other format types like carousel, listpicker here
    return JSON.stringify({
      type,
      messageType,
      channelAddressIdFieldVal,
      formatType,
      choiceText,
      optionItems,
      buttons,
      recipientUserName,
      payloadField
    });

  }
}
