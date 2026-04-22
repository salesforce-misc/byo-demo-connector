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
import {sendSFConversationEntry, fetchSFConversationEntries} from './ottAppLib/sfdc-byob-conversation-entry-api.mjs';
import {agentWork, patchAgentWork, agentWorkCache} from './ottAppLib/sfdc-byocc-agentwork-api.mjs';
import {sendPostRouteAPIRequest} from './ottAppLib/sfdc-byocc-post-route-api.mjs';
import { sendAcknowledgement } from './ottAppLib/sfdc-byocc-acknowledgement-api.mjs';
import {sendRunApiLabRequest} from './ottAppLib/sfdc-byocc-lab-api.mjs';
import {getAccessToken} from './ottAppLib/sfdc-auth.mjs';
import {
  getConversationChannelDefinition,
  getCustomMsgChannel,
  getExtConvParticipantIntegDef
} from './ottAppLib/sfdc-auto-populate.mjs';
import { validateCCDFieldsOnPlatformEvent, validateConversationVendorInfo, validateContactCenterChannelForCustomType, validateSCRT2PermissionsForPlatformEvent } from './ottAppLib/sfdc-health-check.mjs';
import path from 'path';
import cors from 'cors';
import NodeCache from "node-cache" ;
import {fileURLToPath} from 'url';
import bodyParser from 'body-parser';
const urlencodedParser = bodyParser.urlencoded({ extended: false });
const jsonParser = bodyParser.json();
import { getTimeStampForLoglines, logger, cacheKeys } from './util.mjs';
import { v4 as uuidv4} from 'uuid';

customEnv.env();

// Get config metadata from .env
const {
  SF_ORG_ID,
  CHANNEL_ADDRESS_IDENTIFIER,
  END_USER_CLIENT_IDENTIFIER,
  SF_SUBJECT,
  USER_ID,
  AUTO_CREATE_AGENT_WORK,
  SF_INSTANCE_URL,
  SF_SCRT_INSTANCE_URL,
  API_VERSION,
  SF_AUTHORIZATION_CONTEXT_TYPE,
  QUEUE_ID,
  CAPACITY_WEIGHT
} = process.env;

const IS_LOCAL_CONFIG = process.env.IS_LOCAL_CONFIG === "true";
// cache settings in node cache
export const settingsCache = new NodeCache();
export const convEntryIdsCache = new NodeCache();
// conversationIdCache stores mapping between conversationIdentifier and workItemId
// this can be combined with agentWorkCache to get the conversationId, workItemId, and agentWorkId
export const conversationIdCache = new NodeCache();

// Set the following non-dynamical data below from .env to the settingsCache:
settingsCache.set("channelAddressIdentifier", CHANNEL_ADDRESS_IDENTIFIER);
settingsCache.set("endUserClientIdentifier", END_USER_CLIENT_IDENTIFIER);
settingsCache.set("autoCreateAgentWork", AUTO_CREATE_AGENT_WORK);
settingsCache.set("orgId", SF_ORG_ID);
settingsCache.set("instanceUrl", SF_INSTANCE_URL);
settingsCache.set("scrtUrl", SF_SCRT_INSTANCE_URL);
settingsCache.set("userId", USER_ID);
settingsCache.set("userName", SF_SUBJECT)
settingsCache.set("authorizationContextType", SF_AUTHORIZATION_CONTEXT_TYPE)
settingsCache.set("queueId", QUEUE_ID);

// function to dynamically fetch conversation channel definition values and set in the settingsCache
async function fetchAndCacheCCDValues() {
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
  const conversationChannelDefinitionData = await getConversationChannelDefinition();
  if(conversationChannelDefinitionData){
    settingsCache.set("authorizationContext", conversationChannelDefinitionData.DeveloperName);
    settingsCache.set("customPlatformEvent", `/event/${conversationChannelDefinitionData.CustomPlatformEvent}`);
    settingsCache.set("customEventPayloadField", conversationChannelDefinitionData.CustomEventPayloadField);
    settingsCache.set("customEventTypeField", conversationChannelDefinitionData.CustomEventTypeField);
    settingsCache.set("routingOwner", conversationChannelDefinitionData.RoutingOwner);
    settingsCache.set("consentOwner", conversationChannelDefinitionData.ConsentOwner);
    settingsCache.set("isInboundReceiptsPartnerEnabled", conversationChannelDefinitionData.IsInboundReceiptsEnabled);
    settingsCache.set("isTypingIndicatorPartnerEnabled", !conversationChannelDefinitionData.IsTypingIndicatorDisabled);
    const customMsgChannelData = await getCustomMsgChannel(conversationChannelDefinitionData.Id);
    if (customMsgChannelData) {
      settingsCache.set("isInboundReceiptsSalesforceEnabled", customMsgChannelData.HasInboundReceipts);
      settingsCache.set("isTypingIndicatorSalesforceEnabled", customMsgChannelData.HasTypingIndicator);
    } else {
      // set CMC default values
      settingsCache.set("isInboundReceiptsSalesforceEnabled", false);
      settingsCache.set("isTypingIndicatorSalesforceEnabled", true);
    }

    // Calling the PubSub API after getting the ccd fields and custom platform event
    let sfdcPubSubClient = await connectToPubSubApi();
    subscribeToSfInteractionEvent(sfdcPubSubClient);
  }
}

// function to dynamically fetch ExtConvParticipantIntegDef values and set in the settingsCache
async function fetchAndCacheExtConvParticipantIntegDefValues() {
  try {
    // Set the following dynamically fetched extConvParticipantIntegDef data below to the settingsCache:

    const extConvParticipantData = await getExtConvParticipantIntegDef();
    if (extConvParticipantData && extConvParticipantData.records
      && extConvParticipantData.records.length > 0) {
      const extConvParticipantDataRecord = extConvParticipantData.records[0];
      settingsCache.set("authorizationContext",
        extConvParticipantDataRecord.DeveloperName);
      settingsCache.set("customPlatformEvent",
        `/event/${extConvParticipantDataRecord.CustomPlatformEvent}`);
      settingsCache.set("customEventPayloadField",
        extConvParticipantDataRecord.CustomEventPayloadField);
      settingsCache.set("customEventTypeField",
        extConvParticipantDataRecord.CustomEventTypeField);

      if (extConvParticipantDataRecord.Id) {
        settingsCache.set("extConvParticipantId",
          extConvParticipantDataRecord.Id);
      }

      // Calling the PubSub API after getting the ExtConvParticipantIntegDef fields and custom platform event

      let sfdcPubSubClient = await connectToPubSubApi();
      subscribeToSfInteractionEvent(sfdcPubSubClient);
    } else {
      logger.info("No records found in the ExtConvParticipantIntegDef data");
    }
  } catch (error) {
    logger.error('Error fetching ExtConvParticipantIntegDef values:', error);
  }
}

export async function initOttApp(expressApp) {

  expressApp.use(cors());

  if (settingsCache.get("authorizationContextType") === "ExternalConversationParticipant") {
    await fetchAndCacheExtConvParticipantIntegDefValues();
  } else {
    await fetchAndCacheCCDValues();
  }

  // Init upload dir
  const upload = multer({ dest: 'uploads/' });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const UPLOADS_DIR = '/../../uploads';
  expressApp.use('/api/uploads', express.static(__dirname + UPLOADS_DIR));

  // ========== Endpoint definitions start. ==========
  // Register app endpoint to load index.html page
  expressApp.get('/', (_req, res) => {
    // Load index.html page
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  // Register sendmessage endpoint
  expressApp.post('/api/sendmessage', upload.single('attachment'), async(req, res) => {
      const responseData = await handleSendmessage(req);
      res.json(!!responseData.data ? responseData.data : responseData);
  });

  // Register createAgentWork endpoint
  // This is an effort to decouple auto create agent work from sendmessage endpoint
  expressApp.post('/api/createAgentWork', async(req, res) => {
    const responseData = await handleCreateAgentWork(req);
    res.json(responseData);
  });

  // Register sendConversationEntry endpoint
  expressApp.post('/sendConversationEntry', upload.single('attachment'), (req, res) => {
    const responseData = handleSendConversationEntry(req);
    res.json(responseData);
  });

  // Register sendConversationEntry endpoint
  expressApp.get('/fetchConversationEntries', (req, res) => {
    logger.info('getConversationEntries API call');

    const responseData = handleFetchConversationEntries(req);
    res.json(responseData);
  });

  // Register patchAgentWork endpoint
  expressApp.patch('/patchAgentWork', (req, res) => {
    const responseData = handlePatchAgentWork(req);
    res.json(responseData);
  });

  expressApp.post('/routeConversationToAgent', jsonParser, (req, res) => {  
    const responseData = handleRouteConversationToAgent(req);
    res.json(responseData);
  });

  // Register apiLab endpoint
  expressApp.post('/api/apiLab', jsonParser, (req, res) => {
    try{
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
            "cancelReason":req.body.cancelReason
          }
          break;
        case 'POST_ROUTING_RESULT':
          req.body = {
            // fields value from UI
            "apiName": req.body.apiName,
            "conversationIdentifier": req.body.conversationIdentifier,
            "routingType": req.body.routingType,
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
        case 'POST_CONVERSATION_HISTORY':
          req.body = {
            // fields value from UI
            "apiName": req.body.apiName,
            "participants": req.body.participants,
            "entries": req.body.entries,
            "channelAddressIdentifier" : req.body.channelAddressIdentifier
          }
          break;
        case 'POST_CONVERSATION':
          req.body = {
            // fields value from UI
            "apiName": req.body.apiName,
            "endUserClientIdentifier": req.body.endUserClientIdentifier,
            "channelAddressIdentifier": req.body.channelAddressIdentifier,
            "routingAttributes": req.body.routingAttributes
          }
          break;
        case 'POST_PARTICIPANT':
          req.body = {
            // fields value from UI
            "apiName": req.body.apiName,
            "conversationIdentifier": req.body.conversationIdentifier,
            "operation": req.body.operation,
            "participants": req.body.participants
          }
          break;
        case 'POST_MESSAGING_SESSION':
          if (req.body.operation === "Inactivate") {
            req.body = {
              "apiName": req.body.apiName,
              "channelAddressIdentifier": req.body.channelAddressIdentifier,
              "conversationIdentifier": req.body.conversationIdentifier,
              "endUserClientId": req.body.endUserClientId,
              "operation": req.body.operation,
              "operationBy": req.body.operationBy,
              "sessionId": req.body.sessionId
            };
          } else { // if (req.body.operation === "End")
            req.body = {
              "apiName": req.body.apiName,
              "channelAddressIdentifier": req.body.channelAddressIdentifier,
              "conversationIdentifier": req.body.conversationIdentifier,
              "endUserClientId": req.body.endUserClientId,
              "operation": req.body.operation,
              "operationBy": req.body.operationBy
            };
          }
          break;
      }
      sendRunApiLabRequest(req).then(response =>{
        res.json(response);
      });
    } catch (error) {
      logger.error("POST /api/apiLab error: ", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Register setcallcenterconfig endpoint
  expressApp.post('/setcallcenterconfig', jsonParser, (req, res) => {
    logger.info("/setcallcenterconfig request:", req);
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
  expressApp.post('/api/sendsettings', jsonParser, (req, res) => {
    settingsCache.set("authorizationContext", req.body.authorizationContext);
    settingsCache.set("authorizationContextType", req.body.authorizationContextType);
    settingsCache.set("channelAddressIdentifier", req.body.channelAddressIdentifier);
    settingsCache.set("endUserClientIdentifier", req.body.endUserClientIdentifier);
    settingsCache.set("customEventPayloadField", req.body.customEventPayloadField);
    settingsCache.set("routingOwner", req.body.routingOwner);
    settingsCache.set("customEventTypeField", req.body.customEventTypeField);
    settingsCache.set("autoCreateAgentWork", AUTO_CREATE_AGENT_WORK);
    settingsCache.set("userId", req.body.userId);
    
    const cacheContent = settingsCache.mget(settingsCache.keys());
    logger.info("POST /api/sendsettings request with settingsCache: ", cacheContent);
    res.send('{"status": 200}');
  });

  // Register CCD endpoint
  expressApp.get('/api/getConversationChannelDefinition', async (req, res) => {
    try {
      const ccdData = await getConversationChannelDefinition();
      res.json(ccdData);
    } catch (error) {
      logger.error('GET /api/getConversationChannelDefinition error: ', error);
      res.status(500).json({ error: 'Failed to fetch ConversationChannelDefinitions' });
    }
  });

  // Register ExtConvParticipantIntegDef endpoint
  expressApp.get('/getExtConvParticipantIntegDef', async (req, res) => {
    try {
      logger.info("/getExtConvParticipantIntegDef request:", req);
      const extConvParticipantIntegDefData = await getExtConvParticipantIntegDef();
      res.json(extConvParticipantIntegDefData);
    } catch (error) {
      logger.error('GET /getExtConvParticipantIntegDef error: ', error);
      res.status(500).json({ error: 'Failed to fetch ExtConvParticipantIntegDef' });
    }
  });

  // Register CMC endpoint
  expressApp.post('/api/getCustomMsgChannels', async (req, res) => {
    try {
      const cmcData = await getCustomMsgChannel(req.body.ccdId);
      res.json(cmcData);
    } catch (error) {
      logger.error('POST /api/getCustomMsgChannels error: ', error);
      res.status(500).json({ error: 'Failed to fetch CustomMsgChannels' });
    }
  });

  // Register health check validation tests endpoint
  expressApp.get('/api/runAllValidationTests', async (req, res) => {
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
        logger.error('GET /api/runAllValidationTests error: ', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

  // Register getsettings endpoint
  expressApp.get('/api/getsettings', urlencodedParser, (req, res) => {
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
      queueId : settingsCache.get("queueId")      
    };

    let authorizationContext = settingsCache.get("authorizationContext");
    let channelAddressIdentifier = settingsCache.get("channelAddressIdentifier");
    let endUserClientIdentifier = settingsCache.get("endUserClientIdentifier");
    let customEventPayloadField = settingsCache.get("customEventPayloadField");
    let routingOwner = settingsCache.get("routingOwner");
    let customEventTypeField = settingsCache.get("customEventTypeField");
    let autoCreateAgentWork = settingsCache.get("autoCreateAgentWork");
    let userId = settingsCache.get("userId");
    let queueId = settingsCache.get("queueId");
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
    if (queueId){
      responseData.queueId = queueId;
    }      
    res.json(responseData);
  });
  //register endpoint to get IS_LOCAL_CONFIG
  expressApp.get('/is-local-config', async (_req, res) => {
    res.send(IS_LOCAL_CONFIG);
  });

  expressApp.get('/api/replyMessage', (req, res) => {
    console.log("===== /api/replyMessage call");
    if (sendMessageTimeoutId) {
      clearTimeout(sendMessageTimeoutId);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
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

  expressApp.get('/api/connect-and-subscribe', async (_req, res) => {
    let sfdcPubSubClient = await connectToPubSubApi();
    subscribeToSfInteractionEvent(sfdcPubSubClient);

    res.send('Connected to PubSub and Subscribed to the Interaction event.');
  });

  expressApp.post('/api/setOrgMode', async (_req, res) => {
    settingsCache.set('orgMode', _req.body.orgMode);
    logger.info("OTT SERVER settingsCache.set('orgMode') : " + _req.body.orgMode);
    res.send({success:true});
  });

  expressApp.get('/api/getOrgMode', async (_req, res) => {
    let cachedOrgMode = settingsCache.get('orgMode');
    logger.info("OTT SERVER settingsCache.get('orgMode') : " + cachedOrgMode);

    // If cachedOrgMode is invalid, it means that setDemoConnectorMode() in remote-control/main.js hasn't been triggered. Just set MESSAGING_ONLY orgMode by default.
    if (!cachedOrgMode) {
      cachedOrgMode = 'MESSAGING_ONLY';
      settingsCache.set('orgMode', cachedOrgMode);
    }

    res.send({orgMode: cachedOrgMode});
  });

  expressApp.get('/api/getApiVersion', (req, res) => {
    res.send(API_VERSION);
  });

  expressApp.get('/api/convEntryIds', async (_req, res) => {
    res.send(convEntryIdsCache.keys());
  });

  expressApp.get('/api/fetchFrequentlyUsedFields', async (req, res) => {
    const responseData = await handleFetchFrequentlyUsedFields();
    res.json(responseData);
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

    logger.info(`reply message from message queue: `, msg);

    res.write(`event: replymsg\n`);
    res.write(`data: ${msg}\n`);
    res.write(`id: ${msgId}\n\n`);
    msgId++;
  }
  sendMessageTimeoutId = setTimeout(sendMessageAtInterval.bind(null, interval, res), interval);
}

// Event handler
async function handleSendmessage(req) {
  let responseData = {};
  let interactionType = req.body.interactionType;
  let entryType = req.body.entryType;

  // return and warn if non-ott doesn't have all the critical data
  if (!IS_LOCAL_CONFIG && !(settingsCache.get("orgId") && settingsCache.get("authorizationContext") && settingsCache.get("channelAddressIdentifier") && settingsCache.get("endUserClientIdentifier") && settingsCache.get("scrtUrl"))) {
    logger.error('Missing critical data:', {
      orgId: settingsCache.get("orgId"),
      authorizationContext: settingsCache.get("authorizationContext"),
      channelAddressIdentifier: settingsCache.get("channelAddressIdentifier"),
      endUserClientIdentifier: settingsCache.get("endUserClientIdentifier"),
      scrtUrl: settingsCache.get("scrtUrl")
    });
    logger.error("[Warn] Please check if the user is in a Contact Center, and refresh your (1) Salesforce App and then (2)demo connector page to retrieve critical contact center data to start sending messages.");
    return responseData;
  }

  if (interactionType === 'AttachmentInteraction' || (interactionType === 'EntryInteraction' && entryType === 'Message')) {
    responseData = await sendSFInboundMessageInteraction(settingsCache.get("orgId"), settingsCache.get("authorizationContext"), settingsCache.get("channelAddressIdentifier"), settingsCache.get("endUserClientIdentifier"), req);
  } else if (interactionType === 'EntryInteraction' && entryType === 'TypingStartedIndicator') {
    responseData = await sendSFInboundTypingIndicatorInteraction(settingsCache.get("orgId"), settingsCache.get("authorizationContext"), settingsCache.get("channelAddressIdentifier"), settingsCache.get("endUserClientIdentifier"), entryType);
  }
  return responseData
}

async function handleCreateAgentWork(req) {
  const interactionResponseData = req.body;
  const orgId = settingsCache.get("orgId");
  const authorizationContext = settingsCache.get("authorizationContext");
  const routingOwner = settingsCache.get("routingOwner");
  const autoCreateAgentWork = settingsCache.get("autoCreateAgentWork");
  const routingType = "Initial";
  
  // necessary checks for creating agentwork
  if (autoCreateAgentWork !== "true") {
    logger.info("agentwork will not be called as AUTO_CREATE_AGENT_WORK flag is set to false");
    return {};
  }

  if (routingOwner !== "Partner") {
    logger.info("agentwork will not be called as routingOwner is not Partner");
    return {};
  }

  if (!interactionResponseData || interactionResponseData.success === false) {
    logger.error("Can not create agent work as /interactions API call was not successful");
    return {};
  }
  
  if (!orgId || !authorizationContext) {
    logger.error("Missing critical data to create agentwork: orgId, authorizationContext");
    return {};
  }

  let workItemId;
  let conversationIdentifier;

  if (interactionResponseData.workItemIds && interactionResponseData.workItemIds[0]) {
    workItemId = interactionResponseData.workItemIds[0];
  }

  if (interactionResponseData.conversationIdentifier) {
    conversationIdentifier = interactionResponseData.conversationIdentifier;
    settingsCache.set("conversationIdentifier", conversationIdentifier);
  }

  if (workItemId && conversationIdentifier) {
    logger.info("Auto creating agent work for workItemId: " + workItemId + " and conversationIdentifier: " + conversationIdentifier);
    return await agentWork(orgId, authorizationContext, conversationIdentifier, workItemId, null, 
      (IS_LOCAL_CONFIG ? USER_ID : settingsCache.get("userId")), routingType, uuidv4(), true, true, CAPACITY_WEIGHT);
  }
  return {};
}

// Event handler
function handleSendConversationEntry(req) {
  let responseData = {};

  /* if (!IS_LOCAL_CONFIG && !(settingsCache.get("orgId") && settingsCache.get("authorizationContext") && settingsCache.get("conversationIdentifier") && settingsCache.get("scrtUrl"))) {
    logger.info("[Warn] Please check if the user is in a Contact Center, and refresh your (1) Salesforce App and then (2)demo connector page to retrieve critical contact center data to start sending messages.");
    return responseData;
  } */
  responseData = sendSFConversationEntry(settingsCache.get("orgId"), settingsCache.get("authorizationContext"), settingsCache.get("authorizationContextType"), settingsCache.get("conversationIdentifier"), settingsCache.get("endUserClientIdentifier"), req);
  return responseData;
}

// Event handler
function handleFetchConversationEntries(req) {
  let responseData = {};

  if (!IS_LOCAL_CONFIG && !(settingsCache.get("orgId") && settingsCache.get("authorizationContext") && settingsCache.get("conversationIdentifier") && settingsCache.get("scrtUrl"))) {
    logger.error("[Warn] Please check if the user is in a Contact Center, and refresh your (1) Salesforce App and then (2)demo connector page to retrieve critical contact center data to start sending messages.");
    return responseData;
  }
  responseData = fetchSFConversationEntries(settingsCache.get("orgId"), settingsCache.get("authorizationContext"), settingsCache.get("authorizationContextType"), settingsCache.get("conversationIdentifier"), settingsCache.get("endUserClientIdentifier"), req);
  return responseData;
}

// Event handler for patchAgentWork Request
function handlePatchAgentWork(req) {
  let responseData = {};

  responseData = patchAgentWork(settingsCache.get("orgId"), settingsCache.get("authorizationContext"), settingsCache.get("authorizationContextType"), req);
  return responseData;
}

// Event handler for transferToAgent Request
async function handleRouteConversationToAgent(req) {
  let responseData = {};
  const accessToken = await getAccessToken();

  const requestHeader = {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Accept": "*/*",
      "OrgId": settingsCache.get("orgId"),
      "AuthorizationContext": settingsCache.get("authorizationContext"),
      "AuthorizationContextType": "ExternalConversationParticipant",
      "RequestId": uuidv4()
    }
  };

  responseData = await sendPostRouteAPIRequest(req, requestHeader);
  logger.info('responseData: ' + JSON.stringify(responseData));
  return responseData;
}

async function subscribeToSfInteractionEvent(sfdcPubSubClient) {
  try {
    // sfdcPubSsubClient can be null while only using phone
    if (!sfdcPubSubClient) {
      return;
    }

    const subscription = subscribe(sfdcPubSubClient, settingsCache.get("customPlatformEvent"));
    const topicSchema = await getEventSchema(sfdcPubSubClient, settingsCache.get("customPlatformEvent"));
    
    // Extract only the record structure for logging
    const recordStructure = {
      recordName: topicSchema?.type?._name || 'unknown',
      fields: topicSchema?.type?._fields?.map(field => ({
        name: field._name,
        type: field._type?.constructor?.name || 'unknown'
      })) || []
    };
    logger.info("GET topicSchema API response: ", recordStructure);

    // Listen to new events.
    subscription.on('data', (data) => {
      if (data.events) {
        // const latestReplayId = data.latestReplayId.readBigUInt64BE();
        const parsedEvents = data.events.map((event) =>
          parseEvent(topicSchema, event)
        );

        parsedEvents.forEach(async (event) => {
          // #1: retrieve event type
          let eventTypeField = getFieldValue(event, settingsCache.get("customEventTypeField"));
          let eventType = (eventTypeField && eventTypeField.string) ? eventTypeField.string: 'null';
          
          // Extract payload for logging
          let payloadField = getFieldValue(event, settingsCache.get("customEventPayloadField"));
          let payloadValue = payloadField && payloadField.string ? payloadField.string : null;
          
          logger.info('gRPC event: ', { eventType, payload: payloadValue });

          let channelAddressIdFieldVal = null;
          let payloadFieldObj = null;
          let recipientFieldValObj = null;
          let conversationEntryId = null;
          let conversationIdentifier = null;
          let outerPayloadFieldObj = null;

          if (eventType) {
            if (eventType === messagingConstants.EVENT_TYPE.INTERACTION || eventType === messagingConstants.EVENT_TYPE.ROUTING_REQUESTED) {
              // #1: retrieve event payload (already extracted above for logging)
              if (!payloadField) {
                return;
              }
              let payloadFieldVal = payloadField.string;
              outerPayloadFieldObj = JSON.parse(payloadFieldVal);
              payloadFieldObj = getFieldValue(outerPayloadFieldObj, 'payload');

              // #2: retrieve channel address id
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
              logger.error('Event type not supported: ', eventType);
              return;
            }
          }

          let channelAddressIdFromSettings = settingsCache.get("channelAddressIdentifier");
          if (!channelAddressIdFieldVal || channelAddressIdFieldVal !== channelAddressIdFromSettings) {
            return;
          }
          let recipientUserName = getFieldValue(recipientFieldValObj, 'subject');
          let endUserClientIdentifierFromSettings = settingsCache.get("endUserClientIdentifier");
         
          if (!recipientUserName || recipientUserName.substring(0,15) !== endUserClientIdentifierFromSettings.substring(0,15)) {
            return;
          }
          let replyObjStr;
          
          switch (eventType) {
            case messagingConstants.EVENT_TYPE.INTERACTION:

              let entryType = getFieldValue(payloadFieldObj, 'entryType');

              // set conversationIdentifier as per the event
              conversationIdentifier = getFieldValue(outerPayloadFieldObj, 'conversationIdentifier');
              settingsCache.set("conversationIdentifier", conversationIdentifier);

              switch (entryType) {
                case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.ROUTING_WORK_RESULT: 
                case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.DELIVERY_ACKNOWLEDGEMENT:
                case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.READ_ACKNOWLEDGEMENT:
                  // Push reply obj
                  replyObjStr = JSON.stringify({
                    eventType,
                    channelAddressIdFieldVal,
                    recipientUserName,
                    payloadField
                  });
                  break;
                case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.MESSAGE:
                  let messageType = getFieldValue(payloadFieldObj, 'messageType');
                  // Handling according to the messageType
                  switch (messageType) {
                    case messagingConstants.EVENT_PAYLOAD_MESSAGE_TYPE.CHOICES_MESSAGE: 
                      replyObjStr = handleChoiceMessage(eventType, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj);
                      break;
                    case messagingConstants.EVENT_PAYLOAD_MESSAGE_TYPE.FORM_MESSAGE:
                      // TODO: Handle Form Message Type
                      break;
                    case messagingConstants.EVENT_PAYLOAD_MESSAGE_TYPE.STATIC_CONTENT_MESSAGE:
                      replyObjStr = handleStaticContentMessage(eventType, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj);
                      break;
                    default:
                      logger.error('Message type not supported: ', messageType);
                      break;
                  }
                  break;
                case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.PROGRESS_INDICATOR:
                case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.TYPING_STARTED_INDICATOR:
                case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.TYPING_STOPPED_INDICATOR:
                  replyObjStr = handleIndicatorMessage(eventType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj);
                  break;
                default:
                  return;
              }
     
              break;
            case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.ROUTING_REQUESTED:
              // Push stringfied reply obj
              replyObjStr = JSON.stringify({
                eventType,
                channelAddressIdFieldVal,
                recipientUserName,
                payloadField
              });
              break;
            default:
              logger.error('Event type not supported: ', eventType);
              return;
          }
          repliedMessages.push(replyObjStr);

          // Call IS acknowledge API to send Delivered/Read reciept
          if (!settingsCache.get("conversationIdentifier")) {
            logger.error('No conversation identifier found in cache! Cannot proceed acknowledgement request');
          }

          if (conversationEntryId === null) {
            logger.error('No conversationEntry identifier found in event! Cannot proceed acknowledgement request');
          }
          // Acceptable Acknowledgement Type: {"Read", "Delivered"}, by default, we send a 'Read' acknowledgement for every message received.
          //let responseData = await sendAcknowledgement(conversationId, conversationEntryId, "Read");
          //console.log(getTimeStampForLoglines() + 'Acknowledgement API response received. ' + JSON.stringify(responseData));
        });
      } else {
        // If there are no events then every 270 seconds the system will keep publishing the latestReplayId.
      }
    });
    subscription.on('end', () => {
      logger.info('gRPC stream ended');
    });
    subscription.on('error', (err) => {
      // TODO: Handle errors
      logger.error('gRPC stream error: ', JSON.stringify(err));
    });
    subscription.on('status', (status) => {
      logger.info('gRPC stream status: ', status);
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
    logger.error('Fatal error in subscribeToSfInteractionEvent: ', err);
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

function handleStaticContentMessage(eventType, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj) {
  let replyMessageText = getFieldValue(payloadFieldObj, 'text');

  let formatType = getFieldValue(payloadFieldObj, "formatType");
  let attachmentName = null;
  let attachmentUrl = null;
  let previewImageUrl = null;
  let url = null;
  let title = null;
  let citationContent = getFieldValue(payloadFieldObj, 'citationContent') ?? {};

  if (formatType === "Attachments") {
    let attachments = getFieldValue(payloadFieldObj, 'attachments');
    if (attachments.length > 0) {
      attachmentName = getFieldValue(attachments[0], 'name');
      attachmentUrl = getFieldValue(attachments[0], 'url');
    }
  }

  if (formatType === "RichLink") {
    previewImageUrl = getFieldValue(payloadFieldObj, 'assetUrl');
    url = getFieldValue(payloadFieldObj, 'url');
    title = getFieldValue(payloadFieldObj, 'title');
  }

  return JSON.stringify({
    eventType,
    messageType,
    channelAddressIdFieldVal,
    replyMessageText,
    attachmentName,
    attachmentUrl,
    recipientUserName,
    citationContent,
    payloadField,
    previewImageUrl,
    url,
    title
  });

}


/**
 * Handles indicator messages (typing indicators, progress indicators) from Salesforce
 * @param {string} eventType - The type of event (e.g., 'INTERACTION')
 * @param {string} channelAddressIdFieldVal - The channel address identifier
 * @param {string} recipientUserName - The recipient's username
 * @param {object} payloadField - The payload field from the event
 * @param {object} payloadFieldObj - The parsed payload object
 * @returns {string} JSON stringified response object
 */
function handleIndicatorMessage(eventType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj) {
  // replyMessageText will only be used for progress indicator
  let replyMessageText = getFieldValue(payloadFieldObj, 'text');
  return JSON.stringify({
    eventType,
    channelAddressIdFieldVal,
    replyMessageText,
    recipientUserName,
    payloadField
  });
}


function handleChoiceMessage(eventType, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj) {
  let abstractMessage = getFieldValue(payloadFieldObj, 'abstractMessage');
  if (!abstractMessage) {
    logger.error('Error: abstractMessage not found in payloadFieldObj');
    return JSON.stringify({
      type: 'Error',
      error: 'abstractMessage not found in payloadFieldObj'
    });
  }

  let choices = getFieldValue(abstractMessage, 'choices');
  if (!choices) {
    logger.error('Error: choices not found in abstractMessage');
    return JSON.stringify({
      type: 'Error',
      error: 'choices not found in abstractMessage'
    });
  }

  let formatType = getFieldValue(choices, 'formatType');
  let choiceText = getFieldValue(choices, 'text');
  let optionItems = getFieldValue(choices, 'optionItems');

  if (formatType === 'Buttons') {
    let buttons = optionItems.map(item => ({
      title: getFieldValue(item, 'titleItem.title'),
      identifier: getFieldValue(item, 'optionIdentifier')
    }));

    return JSON.stringify({
      eventType,
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
      eventType,
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

function handleChoiceResponseMessage(type, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj) {
  let abstractMessage = getFieldValue(payloadFieldObj, 'abstractMessage');
  if (!abstractMessage) {
    logger.error('Error: abstractMessage not found in payloadFieldObj');
    return JSON.stringify({
      type: 'Error',
      error: 'abstractMessage not found in payloadFieldObj'
    });
  }

  let choiceResponse = getFieldValue(abstractMessage, 'choicesResponse');
  
  if (!choiceResponse) {
    logger.error('Error: choice response not found in abstractMessage');
    return JSON.stringify({
      type: 'Error',
      error: 'choice response not found in abstractMessage'
    });
  }

  let formatType = getFieldValue(choiceResponse, 'formatType');
  let selectedOptions = getFieldValue(choiceResponse, 'selectedOptions');

  if (formatType === 'Selections') {
    return JSON.stringify({
      type,
      messageType,
      channelAddressIdFieldVal,
      formatType,
      selectedOptions,
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

function handleFormResponseMessage(type, messageType, channelAddressIdFieldVal, recipientUserName, payloadField, payloadFieldObj) {
  let abstractMessage = getFieldValue(payloadFieldObj, 'abstractMessage');
  if (!abstractMessage) {
    logger.error('Error: abstractMessage not found in payloadFieldObj');
    return JSON.stringify({
      type: 'Error',
      error: 'abstractMessage not found in payloadFieldObj'
    });
  }

  let formResponse = getFieldValue(abstractMessage, 'formResponse');
  
  if (!formResponse) {
    logger.error('Error: form response not found in abstractMessage');
    return JSON.stringify({
      type: 'Error',
      error: 'form response not found in abstractMessage'
    });
  }

  let formatType = getFieldValue(formResponse, 'formatType');
  let resultMessage = getFieldValue(formResponse, 'resultMessage');

  if (formatType === 'Result') {
    return JSON.stringify({
      type,
      messageType,
      channelAddressIdFieldVal,
      formatType,
      resultMessage,
      recipientUserName,
      payloadField
    });
  }
}

/**
 * Fetch frequently used fields from the associated caches.
 * @returns {object} the value of the requested field.
 */
async function handleFetchFrequentlyUsedFields() {
  let responseData = {};
  responseData.channelAddressIdentifier = settingsCache.get(cacheKeys.channelAddressIdentifier);
  responseData.endUserClientIdentifier = settingsCache.get(cacheKeys.endUserClientIdentifier);
  responseData.conversationIdentifier = settingsCache.get(cacheKeys.conversationIdentifier);
  const interactionData = responseData.conversationIdentifier ? conversationIdCache.get(responseData.conversationIdentifier) : undefined;
  responseData.workItemId = interactionData?.workItemId;
  responseData.agentWorkId = interactionData?.workItemId ? agentWorkCache.get(interactionData.workItemId) : undefined;
  responseData.userId = settingsCache.get(cacheKeys.userId);
  return responseData;
}