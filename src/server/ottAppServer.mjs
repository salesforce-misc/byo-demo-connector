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
import { getConversationChannelDefinitions } from './ottAppLib/sfdc-auto-populate.mjs';
import { validateCCDFieldsOnPlatformEvent, validateConversationVendorInfo, validateContactCenterChannelForCustomType, validateSCRT2PermissionsForPlatformEvent } from './ottAppLib/sfdc-health-check.mjs';
import path from 'path';
import cors from 'cors';
import NodeCache from "node-cache" ;
import {fileURLToPath} from 'url';
import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({ extended: false });
const jsonParser = bodyParser.json();

customEnv.env();

// Get config metadata from .env
const {
  PORT,
  SF_ORG_ID,
  CHANNEL_ADDRESS_IDENTIFIER,
  END_USER_CLIENT_IDENTIFIER,
  SF_SUBJECT,
  USER_ID,
  AUTO_CREATE_AGENT_WORK,
  SF_INSTANCE_URL
} = process.env;

const IS_OTT = process.env.IS_OTT === "true";
console.log("======  Using OTT : " + IS_OTT + " ========")
// cache settings in node cache
export const settingsCache = new NodeCache();
if (IS_OTT) {
  settingsCache.set("channelAddressIdentifier", CHANNEL_ADDRESS_IDENTIFIER);
  settingsCache.set("endUserClientIdentifier", END_USER_CLIENT_IDENTIFIER);
  settingsCache.set("autoCreateAgentWork", AUTO_CREATE_AGENT_WORK);
  settingsCache.set("orgId", SF_ORG_ID);
  settingsCache.set("instanceUrl", SF_INSTANCE_URL)
}

// function to dynamically fetch conversation channel definition values and set in the settingsCache
async function fetchAndCacheCCDValues() {
  try {
    const ccdData = await getConversationChannelDefinitions();
    if(ccdData && ccdData.records && ccdData.records.length  > 0){
      const ccdDataRecord = ccdData.records[0];
      settingsCache.set("authorizationContext", ccdDataRecord.DeveloperName);
      settingsCache.set("customPlatformEvent", `/event/${ccdDataRecord.CustomPlatformEvent}`);
      settingsCache.set("customEventPayloadField", ccdDataRecord.CustomEventPayloadField);
      settingsCache.set("customEventTypeField", ccdDataRecord.CustomEventTypeField);
      settingsCache.set("routingOwner", ccdDataRecord.RoutingOwner);
      settingsCache.set("consentOwner", ccdDataRecord.ConsentOwner);
      settingsCache.set("userId", USER_ID);
      console.log('CCD values cached successfully');

      // Calling the PubSub API after getting the ccd fields and custom platform event
      console.log(`\n============================== connectToPubSubApi() `);
      let sfdcPubSubClient = await connectToPubSubApi();
      subscribeToSfInteractionEvent(sfdcPubSubClient);
    } else {
      console.log("No records found in the CCD data");
    }
  } catch (error) {
    console.error('Error fetching CCD values:', error);
  }
}

const port = PORT || 3000;

export async function initOttApp(expressApp) {

  expressApp.use(cors());
  fetchAndCacheCCDValues();

  // Init upload dir
  const upload = multer({ dest: 'uploads/' });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const UPLOADS_DIR = '/../../uploads';
  expressApp.use('/uploads', express.static(__dirname + UPLOADS_DIR));
  console.log('\n====== uplaod dir: ', __dirname + UPLOADS_DIR);

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
      console.log("============= ottAppServer apiLab call");
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
              };
            } else {
              req.body = {
                // fields value from UI
                "apiName": req.body.apiName,
                "userId": req.body.userId,
                "workItemId": req.body.workItemId,
                "interactionRequest": req.body.interactionRequest,
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
    console.log("\n============================ req:", req);
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
    console.log("\n============================ req:", req);
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
      const ccdData = await getConversationChannelDefinitions();
      res.json(ccdData);
    } catch (error) {
      console.error('Error fetching ConversationChannelDefinitions:', error);
      res.status(500).json({ error: 'Failed to fetch ConversationChannelDefinitions' });
    }
  });

  // Register health check validation tests endpoint
  expressApp.get('/runAllValidationTests', async (req, res) => {
    console.log("Received request for /runAllValidationTests");
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
      customEventPayloadField: settingsCache.get("customEventPayloadField"),
      sfSubject: settingsCache.get("userName"),
      routingOwner: settingsCache.get("routingOwner"),
      customEventTypeField: settingsCache.get("customEventTypeField"),
      autoCreateAgentWork : AUTO_CREATE_AGENT_WORK,
      userId : settingsCache.get("userId"),
    };

    let authorizationContext = settingsCache.get("authorizationContext");
    let channelAddressIdentifier = settingsCache.get("channelAddressIdentifier");
    let endUserClientIdentifier = settingsCache.get("endUserClientIdentifier");
    let customEventPayloadField = settingsCache.get("customEventPayloadField");
    let routingOwner = settingsCache.get("routingOwner");
    let customEventTypeField = settingsCache.get("customEventTypeField");
    let autoCreateAgentWork = settingsCache.get("autoCreateAgentWork");
    let userId = settingsCache.get("userId");

    if (authorizationContext) {
      responseData.authorizationContext = authorizationContext;
    }
    if (channelAddressIdentifier) {
      responseData.channelAddressIdentifier = channelAddressIdentifier;
    }
    if (endUserClientIdentifier) {
      responseData.endUserClientIdentifier = endUserClientIdentifier;
    }
    if (customEventPayloadField) {
      responseData.customEventPayloadField = customEventPayloadField;
    }
    if (routingOwner) {
      responseData.routingOwner = routingOwner;
    }
    if (customEventTypeField) {
      responseData.customEventTypeField = customEventTypeField;
    }
    if (autoCreateAgentWork != null) {
      responseData.autoCreateAgentWork = autoCreateAgentWork;
    }
    if (userId){
      responseData.userId = userId;
    }
    
    res.json(responseData);
  });
  //register endpoint to get IS_OTT
  expressApp.get('/is-ott', async (_req, res) => {
    res.send(IS_OTT);
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
    console.log("OTT SERVER settingsCache.set('orgMode') : " + _req.body.orgMode);
    res.send({success:true});
  });

  expressApp.get('/getOrgMode', async (_req, res) => {
    console.log("OTT SERVER settingsCache.get('orgMode') : " + settingsCache.get('orgMode'));
    res.send({orgMode:settingsCache.get('orgMode')});
  });
  
  // ========== Endpoint definitions end. ==========

  // Calling PubSub API in fetchAndCacheCCDValues() function to prevent race conditions
  // Init SF Pub/Sub Api and subscribe outbound message event
  // console.log(`\n============================== connectToPubSubApi() `);
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

    console.log(`\n====== reply message from message queue: `, msg);

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
  if (!IS_OTT && !(settingsCache.get("orgId") && settingsCache.get("authorizationContext") && settingsCache.get("channelAddressIdentifier") && settingsCache.get("endUserClientIdentifier") && settingsCache.get("scrtUrl"))) {
    console.log("======[Warn] Please check if the user is in a Contact Center, and refresh your (1) Salesforce App and then (2)demo connector page to retrieve critical contact center data to start sending messages.======");
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
    console.log(`\n====== start subscribeToSfInteractionEvent()`);

    const subscription = subscribe(sfdcPubSubClient, settingsCache.get("customPlatformEvent"));
    const topicSchema = await getEventSchema(sfdcPubSubClient, settingsCache.get("customPlatformEvent"));
    console.log(`\n====== topicSchema: `, topicSchema);

    // Listen to new events.
    subscription.on('data', (data) => {
      if (data.events) {
        const latestReplayId = data.latestReplayId.readBigUInt64BE();
        console.log(
          `\n====== Received ${data.events.length} events, latest replay ID: ${latestReplayId}`, data.events[0].event
        );
        const parsedEvents = data.events.map((event) =>
          parseEvent(topicSchema, event)
        );

        parsedEvents.forEach(async (event) => {
          console.log('\n====== gRPC event: ', event);

          // #1: retrieve event type
          let eventTypeField = getFieldValue(event, settingsCache.get("customEventTypeField"));
          let customEventTypeFieldFromSettings = settingsCache.get("customEventTypeField");
          console.log('\n====== customEventTypeField / customEventTypeFieldFromSettings: ', ((eventTypeField && eventTypeField.string) ? eventTypeField.string: 'null'), customEventTypeFieldFromSettings);

          let channelAddressIdFieldVal = null;
          let payloadFieldObj = null;
          let recipientFieldValObj = null;
          let payloadField = null;
          let conversationEntryId = null;

          if (eventTypeField && eventTypeField.string) {
            console.log('\n====== customEventType found in received platform event ========');

            if (eventTypeField.string === messagingConstants.EVENT_TYPE.INTERACTION || eventTypeField.string === messagingConstants.EVENT_TYPE.ROUTING_REQUESTED) {
              // #1: retrieve event payload
              payloadField = getFieldValue(event, settingsCache.get("customEventPayloadField"));
              console.log('\n====== payloadField: ', payloadField);
              if (!payloadField) {
                return;
              }
              let payloadFieldVal = payloadField.string;
              console.log('\n====== payloadFieldVal: ', payloadFieldVal);
              let outerPayloadFieldObj = JSON.parse(payloadFieldVal);
              payloadFieldObj = getFieldValue(outerPayloadFieldObj, 'payload');
              console.log('\n====== messagePayload: ', payloadFieldObj);

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
              console.log('\n====== Event type not supported: ', eventTypeField.string);
              return;
            }
          }

          let type = eventTypeField.string;
          let channelAddressIdFromSettings = settingsCache.get("channelAddressIdentifier");
          console.log('\n====== channelAddressIdField / channelAddressIdFromSettings: ', channelAddressIdFieldVal, channelAddressIdFromSettings);

          if (!channelAddressIdFieldVal || channelAddressIdFieldVal !== channelAddressIdFromSettings) {
            return;
          }
          console.log('\n====== channelAddressIdFieldVal: ', channelAddressIdFieldVal);
          
          console.log('\n====== recipientField: ', recipientFieldValObj);
          let recipientUserName = getFieldValue(recipientFieldValObj, 'subject');
          console.log('\n====== recipientUserName: ', recipientUserName);
          let endUserClientIdentifierFromSettings = settingsCache.get("endUserClientIdentifier");
         
          if (!recipientUserName || recipientUserName !== endUserClientIdentifierFromSettings) {
            return;
          }
          let replyObjStr;
          if (eventTypeField.string === messagingConstants.EVENT_TYPE.INTERACTION){

            let replyMessageText = getFieldValue(payloadFieldObj, 'text');
            console.log('\n====== replyMessageText: ', replyMessageText);

            let formatType = getFieldValue(payloadFieldObj, "formatType");
            let attachmentName = null;
            let attachmentUrl = null;
            if (formatType === "Attachments") {
              let attachments = getFieldValue(payloadFieldObj, 'attachments');
              if (attachments.length > 0) {
                attachmentName = getFieldValue(attachments[0], 'name');
                attachmentUrl = getFieldValue(attachments[0], 'url');
              }
            }
            console.log('\n====== attachmentName / attachmentUrl: ', attachmentName, attachmentUrl);

            // Push stringfied reply obj
            replyObjStr = JSON.stringify({
              type,
              channelAddressIdFieldVal,
              replyMessageText,
              attachmentName,
              attachmentUrl,
              recipientUserName,
              payloadField
            });
          } else if (eventTypeField.string == messagingConstants.EVENT_TYPE.ROUTING_REQUESTED){

            // Push stringfied reply obj
            console.log('\n====== sending object for routeingRequested event: ', payloadField);
            replyObjStr = JSON.stringify({
              type,
              channelAddressIdFieldVal,
              recipientUserName,
              payloadField
            });
          }
          console.log('\n====== Event processing done');

          repliedMessages.push(replyObjStr);

          // Call IS acknowledge API to send Delivered/Read reciept
          if (!settingsCache.get("conversationIdentifier")) {
            throw Error('no conversation identifier found in cache! Cannot proceed acknowledgement request');
          }

          let conversationId = settingsCache.get("conversationIdentifier");
          console.log('\n====== Conversation Identifier From Cache: ' + settingsCache.get("conversationIdentifier"));

          if (conversationEntryId === null) {
            throw Error('no conversationEntry identifier found in event! Cannot proceed acknowledgement request');
          }
          console.log('\n====== ConversationEntry Identifier: ' + conversationEntryId);

          console.log('\n====== Sending acknowledgement API post request...');

          // Acceptable Acknowledgement Type: {"Read", "Delivered"}, by default, we send a 'Read' acknowledgement for every message received. 
          let responseData = await sendAcknowledgement(conversationId, conversationEntryId, "Read");
          console.log('\n====== Acknowledgement API response received. ' + JSON.stringify(responseData));
        });
      } else {
        // If there are no events then every 270 seconds the system will keep publishing the latestReplayId.
      }
    });
    subscription.on('end', () => {
      console.log('\n====== gRPC stream ended');
    });
    subscription.on('error', (err) => {
      // TODO: Handle errors
      console.error('\n====== gRPC stream error: ', JSON.stringify(err));
    });
    subscription.on('status', (status) => {
      console.log('\n====== gRPC stream status: ', status);
    });

    // TODO: Placeholder for omni service side event for routing
    // #2: Subscribe agent status change event 
    // const SF_AGENT_STATUS_PUB_SUB_TOPIC_NAME = "/event/MessagingRouting";
    // const subscription_status = subscribe(sfdcPubSubClient, SF_AGENT_STATUS_PUB_SUB_TOPIC_NAME);
    // const topicSchema_status = await getEventSchema(sfdcPubSubClient, SF_AGENT_STATUS_PUB_SUB_TOPIC_NAME);
    // console.log(`\n====== topicSchema for agent status event: `, topicSchema_status);

    // // Listen to new events.
    // subscription_status.on('data', (data) => {
    //   if (data.events) {
    //     const latestReplayId = data.latestReplayId.readBigUInt64BE();
    //     console.log(
    //       `\n====== Received agent status ${data.events.length} events, latest replay ID: ${latestReplayId}`, data.events[0].event
    //     );

    //     const parsedEvents = data.events.map((event) =>
    //       parseEvent(topicSchema_status, event)
    //     );
    //     console.log(
    //       `\n====== Parsed agent status event:`, parsedEvents
    //     );

    //     parsedEvents.forEach((event) => {
    //       console.log('\n====== gRPC agent status event: ', event);
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
