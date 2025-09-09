import messagingConstants from "../common/messagingConstants";
import NodeCache from "node-cache";
import {
  appendInboundMessageToChatList,
  appendInboundEventToChatList,
  runHealthCheck,
  appendOutboundMessageToChatList,
  handleButtonClick,
  generateTypingIndicator
} from "../common/util.js";

const axios = require('axios');
const SERVER_URL = "http://localhost:3030";
const READ_ACK_TITLE = "ReadAcknowledgement";
const DELIVERY_ACK_TITLE = "DeliveryAcknowledgement";
const ROUTING_WORK_RESULT = "RoutingWorkResult";
let chatList;
let sfSubject = "Agent";
let typingStartedReady = true;
let outboundTypingStarted = false;
let orgMode;
let externalBotName = 'External Bot';

const agentWorkCache = new NodeCache();

window.addEventListener("load", () => {

  // Register settings form submit event listener
  const settingsForm = document.getElementById("settingsForm");
  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();

    // construct FormData object using html form
    let formData = {
      "authorizationContext": document.getElementById("authorizationContext").value,
      "authorizationContextType": "ExternalConversationParticipant",
      "conversationIdentifier": document.getElementById("conversationIdentifier").value,
      "externalBotIdentifier": document.getElementById("externalBotIdentifier").value,
      "customEventPayloadField": document.getElementById("customEventPayloadField").value,
      "customEventTypeField": document.getElementById("customEventTypeField").value
    };

    axios({
      method: "post", url: SERVER_URL + "/sendsettings", data: formData
    }).then((res) => {
      if (res.status === 200) {
        console.log(res);

        let msgBanner = document.getElementById("demo-app-setup-msg-banner");
        let cssShow = "demo-app-setup-msg-banner-show";
        msgBanner.classList.add(cssShow);
        setTimeout(function () {
          msgBanner.classList.remove(cssShow);
        }, 4000);
      }
    }).catch((err) => {
      throw err;
    });

  });

  // Register inbound message form submit event listener
  const messageForm = document.getElementById("messageForm");
  messageForm.addEventListener("submit", (e) => {
    e.preventDefault();

    // For blank value of message, do nothing
    let msg = messageForm.elements.message.value;
    if (!msg || msg.trim() === '') {
      return;
    }
    let timestamp = Date.now();

    // construct FormData object using html form
    let formData = new FormData(messageForm);
    formData.append("entryType", "Message");
    formData.append("timestamp", timestamp);
    formData.append("messageType", "StaticContentMessage");

    // submit the request to middleware server
    axios({
      method: "post", url: SERVER_URL + "/sendConversationEntry", data: formData
    })
      .then((res) => {
        if (res.status === 200) {
          console.log(res);
        }
      })
      .catch((err) => {
        throw err;
      });

    // Add attachment for outbound message in chatList if any
    let originalFileName = null;
    let fileName = null;
    if (messageForm.elements.attachment.value) {
      let parts = messageForm.elements.attachment.value.split('\\');
      originalFileName = parts.pop();
      fileName = originalFileName;
      parts = fileName.split('.');
      let length = parts.length;
      if (length > 1) {
        let extension = parts.pop();
        fileName = parts.join('.') + timestamp + '.' + extension;
      } else {
        fileName = fileName + timestamp;
      }
    }
    // Add outbound message in chatList and clear the message box contect and attachment if any after submit the request
    let messageInputBox = messageForm.elements.message;
    appendOutboundMessageToChatList(messageInputBox.value, originalFileName, fileName, chatList, externalBotName, outboundTypingStarted);
    messageInputBox.value = '';
    messageForm.elements.attachment.value = null;

    typingStartedReady = true;
  });

  // Register message input event listener to send TypingStartedIndicator request
  document.getElementById("message").addEventListener("input", () => {
    if (typingStartedReady) {
      let formData = new FormData(messageForm);
      formData.append("interactionType", "EntryInteraction");
      formData.append("entryType", "TypingStartedIndicator");
      formData.delete("attachment");

      // submit the request to middleware server
      axios({
        method: "post", url: SERVER_URL + "/sendmessage", data: formData
      })
        .then((res) => {
          if (res.status === 200) {
            console.log(res);
          }
        })
        .catch((err) => {
          throw err;
        });

      typingStartedReady = false;
      setTimeout(function () {
        typingStartedReady = true;
      }, 5000);
    }
  });

  // Register custom event to retrieve the replied message from an agent in core app
  const evtSource = new EventSource(SERVER_URL + "/replyMessage");
  console.log("==== evtSource");
  console.log(evtSource);
  evtSource.addEventListener("replymsg", (e) => {
    console.log("=====replyMessage orgMode: " + orgMode);
    if (!orgMode) {
      axios({
        method: "get", url: SERVER_URL + "/getOrgMode"
      }).then((res) => {
        if (res && res.data && res.data.orgMode) {
          orgMode = res.data.orgMode;
          registerEvents(e);
        }
      });
    } else {
      registerEvents(e);
    }
  });

  if (document.getElementById('healthCheckButton')) {
    axios({
      method: "get", url: SERVER_URL + "/getOrgMode"
    }).then((res) => {
      if (res && res.data && res.data.orgMode !== 'VOICE_ONLY') {
        // show healthTab
        document.getElementById('healthCheckTab').classList.remove("slds-hide");

        // Register event for check button
        document.getElementById('healthCheckButton').addEventListener('click', runHealthCheck);
      }
    });
  }

  function registerEvents(event) {
    console.log("=========== registerEvents call");

    if (orgMode !== 'VOICE_ONLY') {
      console.log('\n=============== EventSource - replymsg event:', event.data);
      let replyObj = JSON.parse(event.data);
      if (replyObj.eventType === messagingConstants.EVENT_TYPE.INTERACTION
          || replyObj.type === messagingConstants.EVENT_TYPE.INTERACTION) {
        //check if event is typing indicator
        let payload = JSON.parse(replyObj.payloadField.string);
        let eventType = payload.payload.entryType;

        switch (eventType) {
          case 'TypingStartedIndicator':
            outboundTypingStarted = true;
            generateTypingIndicator(outboundTypingStarted, chatList);
            return;
          case 'TypingStoppedIndicator':
            outboundTypingStarted = false;
            generateTypingIndicator(outboundTypingStarted, chatList);
            return;
          case READ_ACK_TITLE:
          case DELIVERY_ACK_TITLE:
            //handleAckEvent(JSON.parse(event.data));
            return;
          case ROUTING_WORK_RESULT:
            handleRoutingWorkResult(JSON.parse(event.data));
        }

        switch (replyObj.messageType) {          
          case 'StaticContentMessage':         
            appendInboundMessageToChatList(replyObj.replyMessageText, replyObj.attachmentName, replyObj.attachmentUrl, replyObj.payloadField, replyObj.previewImageUrl, replyObj, chatList, sfSubject, outboundTypingStarted);
            break;
          default:
            console.log('Unsupported message type:', replyObj.messageType);
        }
      } else if (replyObj.type === messagingConstants.EVENT_TYPE.ROUTING_REQUESTED ||
          replyObj.eventType === messagingConstants.EVENT_TYPE.ROUTING_REQUESTED) {
        appendInboundEventToChatList(replyObj.type, replyObj.payloadField, chatList, outboundTypingStarted);
      }
    }
  }

  async function handleRoutingWorkResult(data) {
    const entryPayload = JSON.parse(data.payloadField.string).payload.entryPayload;
    console.log("handleRoutingWorkResult === " + entryPayload.toString());
    setAgentWorkCache(entryPayload);

    if (entryPayload.workType === 'Assigned') {
      document.getElementById('accept-work').removeAttribute("disabled");
      document.getElementById('decline-work').removeAttribute("disabled");

      const conversationIdentifier = JSON.parse(data.payloadField.string).conversationIdentifier;
      document.getElementById("conversationIdentifier").value = conversationIdentifier;
      document.getElementById("externalBotIdentifier").value = entryPayload.botId;

    } else if (entryPayload.workType === 'Accepted') {
      document.getElementById('accept-work').setAttribute("disabled", "");
      document.getElementById('decline-work').setAttribute("disabled", "");
      document.getElementById('close-work').removeAttribute("disabled");
      document.getElementById('transfer-agent').removeAttribute("disabled");    

      document.getElementById('message').removeAttribute("disabled");
      document.getElementById('sendButton').removeAttribute("disabled");

    } else if (entryPayload.workType === 'Closed') {    
      document.getElementById('accept-work').setAttribute("disabled", "");
      document.getElementById('decline-work').setAttribute("disabled", "");
      document.getElementById('close-work').setAttribute("disabled", "");
      document.getElementById('transfer-agent').setAttribute("disabled", "");
      document.getElementById('message').setAttribute("disabled", "");
      document.getElementById('sendButton').setAttribute("disabled", "");
    }
  }

  function setAgentWorkCache(data) {
    agentWorkCache.set("botId", data.botId);
    agentWorkCache.set("workId", data.workId);
    agentWorkCache.set("workItemId", data.workTargetId);
    agentWorkCache.set("agentWorkStatus", data.workType);
  }

  if (!orgMode) {
    axios({
      method: "get", url: SERVER_URL + "/getOrgMode"
    }).then((res) => {
      if (res && res.data && res.data.orgMode) {
        orgMode = res.data.orgMode;
      }
      console.log("=====orgMode = " + orgMode);
      getSettingsForApp();
      getExtConvParticipantIntegDef();
    });
  } else {
    getSettingsForApp();
    getExtConvParticipantIntegDef();
  }

  function getExtConvParticipantIntegDef() {
    axios({
      method: "get", url: SERVER_URL + "/getExtConvParticipantIntegDef",
    }).then((extConvParticipantResponse) => {
      if (extConvParticipantResponse && extConvParticipantResponse.status && extConvParticipantResponse.status === 200) {
        let extConvParticipantData = extConvParticipantResponse.data;

        if (extConvParticipantData && extConvParticipantData.records && extConvParticipantData.records.length > 0) {
          const extConvParticipantDataRecord = extConvParticipantData.records[0];
          document.getElementById("authorizationContext").value = extConvParticipantDataRecord.DeveloperName;
          if (document.getElementById("customPlatformEvent")) {
            document.getElementById("customPlatformEvent").value = extConvParticipantDataRecord.CustomPlatformEvent;
          }
          document.getElementById("customEventPayloadField").value = extConvParticipantDataRecord.CustomEventPayloadField;
          document.getElementById("customEventTypeField").value = extConvParticipantDataRecord.CustomEventTypeField;
        } else {
          console.log("No records found in the extConvParticipantIntegDef data");
        }
      } else {
        console.log("Invalid extConvParticipantIntegDef response");
      }
    })
  }

  function getSettingsForApp() {
    axios({
      method: "get", url: SERVER_URL + "/getsettings"
    }).then((res) => {
      if (res.status === 200) {
        // set settings fields with values retrieved from middleware server
        let settings = res.data;
        document.getElementById("authorizationContext").value = settings.authorizationContext;
        document.getElementById("conversationIdentifier").value = '';
        document.getElementById("externalBotIdentifier").value = '';
        document.getElementById("customEventPayloadField").value = settings.customEventPayloadField;
        document.getElementById("customEventTypeField").value = settings.customEventTypeField;
        if (document.getElementById("customPlatformEvent")) {
          document.getElementById("customPlatformEvent").value = settings.customPlatformEvent;
        }
        if (document.getElementById("userId")) {
          document.getElementById("userId").value = settings.userId;
        }
        if (document.getElementById("queueId")) {
          document.getElementById("queueId").value = settings.queueId;
        }

        if (settings.sfSubject) {
          sfSubject = settings.sfSubject.split('@').shift();
        }
        

        // Ensuring the demo connector runs gracefully even if the .env is not present
        if (!settings.authorizationContext) {
          return null;
        } else {
          return axios({
            method: "get", url: SERVER_URL + "/getExtConvParticipantIntegDef",
          });
        }
      }
    }).then((extConvParticipantResponse) => {
      if (extConvParticipantResponse && extConvParticipantResponse.status && extConvParticipantResponse.status === 200) {
        let extConvParticipantData = extConvParticipantResponse.data;

        if (extConvParticipantData && extConvParticipantData.records && extConvParticipantData.records.length > 0) {
          const extConvParticipantDataRecord = extConvParticipantData.records[0];
          document.getElementById("authorizationContext").value = extConvParticipantDataRecord.DeveloperName;
          if (document.getElementById("customPlatformEvent")) {
            document.getElementById("customPlatformEvent").value = extConvParticipantDataRecord.CustomPlatformEvent;
          }
          document.getElementById("customEventPayloadField").value = extConvParticipantDataRecord.CustomEventPayloadField;
          document.getElementById("customEventTypeField").value = extConvParticipantDataRecord.CustomEventTypeField;
        } else {
          console.log("No records found in the extConvParticipantIntegDef data");
        }
      } else {
        console.log("Invalid extConvParticipantInstegDef response");
      }
    })
      .catch((err) => {
        throw err;
      });
  }
});

chatList = document.getElementById('chatList');

document.getElementById('accept-work').addEventListener('click', acceptAgentWork);
document.getElementById('decline-work').addEventListener('click', declineAgentWork);
document.getElementById('close-work').addEventListener('click', closeAgentWork);
document.getElementById('transfer-agent').addEventListener('click', transferToAgent);

function acceptAgentWork() {
  patchAgentWork('Accept').then(res => {
    console.log("successfully completed acceptWork action: " + res);
  });
}

function declineAgentWork() {
  patchAgentWork('Decline').then(res => {
    console.log("successfully completed declineWork action: " + res);
  });
}

function closeAgentWork() {
  patchAgentWork('Close').then(res => {
    console.log("successfully completed closeWork action: " + res);
  });
}

async function transferToAgent() {
  try {
    const routingResult = await transferConversationToAgent();
    console.log("successfully routed conversation to agent: " + routingResult);

    // Add 2 second delay before closing
    setTimeout(async () => {
      closeAgentWork();
      console.log("successfully closed agent work");
    }, 2000);
  } catch (error) {
    console.error("Error in transferToAgent:", error);
  }
}

async function patchAgentWork(agentWorkStatus) {
  const payload = {
    "participantId": agentWorkCache.get("botId"),
    "workId": agentWorkCache.get("workId"),
    "workItemId": agentWorkCache.get("workItemId"),
    "agentWorkStatus": agentWorkStatus
  }

  axios({
    method: "patch", url: SERVER_URL + "/patchAgentWork", data: payload
  }).then((res) => {
    console.log("Completed patchAgentWork request with response: " + res);
  }).catch(error => {
    console.log("Error occurred in patchAgentWork: " + error);
  });
}

async function transferConversationToAgent() {
  const payload = {
    "conversationIdentifier": document.getElementById("conversationIdentifier").value,
    "routingType": "Transfer",
    "routingInfo": "QUEUE",
    "queue": document.getElementById("queueId").value
  }

  axios({
    method: "post", url: SERVER_URL + "/routeConversationToAgent", data: payload
  }).then((res) => {
    console.log("Completed routeToAgent request with response: " + res);
  }).catch(error => {
    console.log("Error occurred in routeToAgent: " + error);
  });
}

document.getElementById('chatList').addEventListener('click', function (event) {
  if (event.target.classList.contains('custom-choice-button') && !event.target.disabled) {
    handleButtonClick(event, chatList, externalBotName, outboundTypingStarted);
  }
});
