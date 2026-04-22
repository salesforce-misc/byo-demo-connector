import messagingConstants from "../common/messagingConstants";
import { testDescriptionMapping, testDescriptions, knowledgeArticles } from '../common/healthCheckConstants.js';
import { marked } from '../common/marked.esm.js';
import DOMPurify from 'dompurify';
const axios = require('axios');
const SERVER_URL = "/api";
const OUTBOUND_MESSAGE_LIST_ITEM_CLASS_NAME = "slds-chat-listitem_outbound";
const OUTBOUND_MESSAGE_LIST_ITEM_QUERY_CLASS_NAME = "." + OUTBOUND_MESSAGE_LIST_ITEM_CLASS_NAME;
const ACK_BADGE_CONTAINER_CLASS_NAME = "ack_badge_container";
const ACK_BADGE_CONTAINER_QUERY_CLASS_NAME = "." + ACK_BADGE_CONTAINER_CLASS_NAME;
const READ_ACK_CLASS_Name = "read_ack";
const READ_ACK_QUERY_CLASS_Name = "." + READ_ACK_CLASS_Name;
const READ_ACK_BADGE_ID_PREFIX = READ_ACK_CLASS_Name + "_";
const DELIVERY_ACK_CLASS_Name = "delivery_ack";
const DELIVERY_ACK_QUERY_CLASS_Name = "." + DELIVERY_ACK_CLASS_Name;
const DELIVERY_ACK_BADGE_ID_PREFIX = DELIVERY_ACK_CLASS_Name + "_";
const DISPLAY_STYLE_NONE = "none";
const DISPLAY_STYLE_BLOCK = "block";
let chatList;
let output;
let sfSubject = "Agent";
let endUserClientName = "End User Client";
let autoCreateAgentWork = false;
let typingStartedReady = true;
let indicatorStatus;
var orgMode;
let frequentlyUsedFields = {};
// Unique id for each message; used for citation source anchors so IDs don't collide across messages.
let nextMessageId = 0;

window.addEventListener("load", () => {

  initializeAccordion(document);
  initCitationLinkHandler();

  // Register settings form submit event listener
  const settingsForm = document.getElementById("settingsForm");
  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();

    // construct FormData object using html form
    let formData = {
      "authorizationContext": document.getElementById("authorizationContext").value,
      "channelAddressIdentifier": document.getElementById("channelAddressIdentifier").value,
      "endUserClientIdentifier": document.getElementById("endUserClientIdentifier").value,
      "customEventPayloadField": document.getElementById("customEventPayloadField").value,
      "isInboundReceiptsPartnerEnabled": document.getElementById("isInboundReceiptsPartnerEnabled").value,
      "isTypingIndicatorPartnerEnabled": document.getElementById("isTypingIndicatorPartnerEnabled").value,
      "isInboundReceiptsSalesforceEnabled": document.getElementById("isInboundReceiptsSalesforceEnabled").value,
      "isTypingIndicatorSalesforceEnabled": document.getElementById("isTypingIndicatorSalesforceEnabled").value,
      "routingOwner": getRoutingOwner(),
      "consentOwner": document.getElementById("consentOwner") ? document.getElementById("consentOwner").value : null,
      "customEventTypeField": document.getElementById("customEventTypeField").value,
      "userId": document.getElementById("userId") ? document.getElementById('userId').value : null,
    };

    axios({
      method: "post",
      url: SERVER_URL + "/sendsettings",
      data: formData
    }).then((res) => {
      if (res.status === 200) {
        console.log(res);
        endUserClientName = formData.endUserClientIdentifier;

        let msgBanner = document.getElementById("demo-app-setup-msg-banner");
        let cssShow = "demo-app-setup-msg-banner-show";
        msgBanner.classList.add(cssShow);
        setTimeout(function () {
          msgBanner.classList.remove(cssShow);
        }, 4000);
      }
    }).then(() => updateFrequentlyUsedFields())
    .catch((err) => {
      throw err;
    });

  });

  // Register inbound message form submit event listener
  const messageForm = document.getElementById("messageForm");
  messageForm.addEventListener("submit", sendMessage);
  messageForm.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      sendMessage(e);
    }
  });

  async function sendMessage(e) {
    e.preventDefault();

    // For blank value of message, do nothing
    let msg = messageForm.elements.message.value;
    if (!msg || msg.trim() === '') {
      return;
    }

    // Generate timestamp early as it's needed for file naming
    let timestamp = Date.now();

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

    // Add outbound message without ack badge elems first in chatList first
    let messageInputBox = messageForm.elements.message;
    let outboundMessageElem = appendOutboundMessageToChatList(messageInputBox.value, originalFileName, fileName);

    // construct FormData object using html form
    let formData = new FormData(messageForm);
    if (messageForm.elements.attachment.value) {
      formData.append("interactionType", "AttachmentInteraction");
      formData.append("timestamp", timestamp);
    } else {
      formData.append("interactionType", "EntryInteraction");
      formData.append("entryType", "Message");
    }
    formData.append("messageType", "StaticContentMessage");

    // submit the request to middleware server
    let sendMessageRes = await axios({
      method: "post",
      url: SERVER_URL + "/sendmessage",
      data: formData
    })
      .then((res) => {
        if (res.status === 200) {
          console.log("====== /sendmessage POST completed with response data:", res.data);
          updateFrequentlyUsedFields();
          return res;
        }
      })
      .catch((err) => {
        console.log("====== /sendmessage POST completed with error:", err);
        return err;
      });

      if (!!sendMessageRes && !!sendMessageRes.data && sendMessageRes.data.status === 500) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: sendMessageRes.data.message
        });      
  
        return;
      }

      if (!!sendMessageRes && !!sendMessageRes.data && sendMessageRes.data.status === 500) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: sendMessageRes.data.message
        });      
  
        return;
      }

      if (autoCreateAgentWork && sendMessageRes.status === 200 && sendMessageRes.data && sendMessageRes.data.success === true) {
        axios.post(SERVER_URL + "/createAgentWork", sendMessageRes.data)
        .then((res) => {
          console.log("====== /createAgentWork POST completed successfully with response data:", res.data);
        }).then(() => updateFrequentlyUsedFields())
        .catch((err) => {
          console.log("====== /createAgentWork POST failed with error:", err);
        }); 
      } else {
        console.log("====== /createAgentWork can not be called as the /sendmessage was not successful");
      }

    // Insert ack badge elems to outbound message elem
    insertAckBadgeElemsToOutboundMessageHTMLElem(outboundMessageElem, sendMessageRes);

    // Clear the message box contect and attachment if any after submit the request
    messageInputBox.value = '';
    messageForm.elements.attachment.value = null;

    typingStartedReady = true;
  }

  const apiLabInfoButton = document.getElementById("api-lab-info-button");
  apiLabInfoButton.addEventListener("click", () => {
    const apiLabInfo = document.getElementById("api-lab-info-bubble");
    apiLabInfo.classList.toggle("slds-hide");
  });
  // Register api lab form submit event listener
  const apiLabForm = document.getElementById("apiLabForm");
  output = document.getElementById('api-lab-output');
  apiLabForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    let formData = {};
    const selectedAPIName = document.getElementById("selected-api-name").value;
    try {
      // clearing the output message before each API call.
      output.value = '';

      switch (selectedAPIName) {
        case 'CONSENT':
          formData = {
            "apiName": document.getElementById("selected-api-name").value,
            "consentStatus": document.getElementById("consentStatus").value,
          };
          break;
        case 'POST_ROUTE':
          formData = {
            "apiName": document.getElementById("selected-api-name").value,
            "conversationIdentifier": document.getElementById("conversationId").value,
            "routingType": document.getElementById("routingType").value,
            "routingInfo": document.getElementById("routingInfo").value,
            "flow": document.getElementById("flow").value,
            "fallBackQueue": document.getElementById("fallBackQueue").value,
            "routingAttributes": document.getElementById("routingAttributes").value,
            "queue": document.getElementById("queue").value,
          };
          break;
        case 'DELETE_ROUTE':
          formData = {
            "apiName": document.getElementById("selected-api-name").value,
            "conversationIdentifier": document.getElementById("ConversationIdForDelete").value,
            "cancelReason":document.getElementById("CancelReasonForDelete").value
          }
          break;
        case 'POST_ROUTING_RESULT':
          if (successCheckbox.checked) {
            formData = {
              "apiName": document.getElementById("selected-api-name").value,
              "conversationIdentifier": document.getElementById("conversationIdForPostRoutingResult").value,
              "routingType": document.getElementById("routingTypeForPostRoutingResult").value,
              "workItemId": document.getElementById("workItemIdForPostRoutingResult").value,
              "success": document.getElementById("successCheckbox").checked,
              "externallyRouted": document.getElementById("externallyRoutedCheckbox").checked,
              "errorMessage": ""
            };
          } else {
            formData = {
              "apiName": document.getElementById("selected-api-name").value,
              "conversationIdentifier": document.getElementById("conversationIdForPostRoutingResult").value,
              "routingType": document.getElementById("routingTypeForPostRoutingResult").value,
              "workItemId": document.getElementById("workItemIdForPostRoutingResult").value,
              "success": document.getElementById("successCheckbox").checked,
              "externallyRouted": document.getElementById("externallyRoutedCheckbox").checked,
              "errorMessage": document.getElementById("errorMessage").value
            };
          }
          break;
        case 'PATCH_REGISTER_CAPABILITIES':
          if (Object.keys(registerCapabilitiesRequestBody).length === 0) {
            capabilitiesPayload.classList.remove('slds-hide');
            document.getElementById('capabilitiesPayload').textContent = 'Please upload a valid JSON file.';
            runButton.disabled = true;
          } else {
            formData = registerCapabilitiesRequestBody;
            formData.apiName = "PATCH_REGISTER_CAPABILITIES";
          }
          break;
        case 'POST_AGENT_WORK':
          formData = {
            "apiName": document.getElementById("selected-api-name").value,
            "userId": document.getElementById("userIdForAgentWork").value,
            "workItemId": document.getElementById("workItemIdForAgentWork").value,
            "interactionRequest": document.getElementById("interactionRequest").value,
          };
          switch (formData.interactionRequest) {
            case "CAPACITY_PERCENTAGE":
              formData.conversationIdentifier = document.getElementById("conversationIdForAgentWorkCP").value;
              formData.capacityPercentage = document.getElementById("capacityPercentage").value;
              formData.routingType = document.getElementById("routingTypeForAgentWork").value;
              formData.routingCorrelationId = document.getElementById("routingCorrelationIdCP").value;
              break;

            case "CAPACITY_WEIGHT":
              formData.conversationIdentifier = document.getElementById("conversationIdForAgentWorkCW").value;
              formData.capacityWeight = document.getElementById("capacityWeight").value;
              formData.routingType = document.getElementById("routingTypeForAgentWork").value;
              formData.routingCorrelationId = document.getElementById("routingCorrelationIdCW").value;
              break;
            default:
              break;
          }
          
          appendAgentActionVisibilities(formData);
          break;
        case 'PATCH_AGENT_WORK':
          formData = {
            "apiName": document.getElementById("selected-api-name").value,
            "workId": document.getElementById("patchAgentWorkId").value,
            "status": document.getElementById("agentWorkStatusDropdown").value,
            "contextType": document.getElementById("contextTypeDropdown").value,
          };
          break;
        case "POST_CONVERSATION":
          formData = {
            "apiName": document.getElementById("selected-api-name").value,
            "channelAddressIdentifier" : document.getElementById("channelAddressIdentifierConv").value,
            "endUserClientIdentifier" : document.getElementById("endUserClientIdentifierConv").value,
            "routingAttributes" : document.getElementById("conversationRoutingAttributes").value
          };
          break;
        case "POST_CONVERSATION_HISTORY":
            if (Object.keys(conversationParticipantsBody).length === 0) {
              conversationsPayload.classList.remove('slds-hide');
              document.getElementById('conversationsPayload').textContent = 'Please upload a valid JSON file.';
              runButton.disabled = true;
            } else if (Object.keys(conversationEntriesBody).length === 0) {
              conversationEntries.classList.remove('slds-hide');
              document.getElementById('conversationEntries').textContent = 'Please upload a valid JSON file.';
              runButton.disabled = true;
            } else {
              formData.participants = conversationParticipantsBody;
              formData.entries = conversationEntriesBody;
              formData.channelAddressIdentifier = document.getElementById("channelAddressIdentifierHistory").value,
              formData.apiName = document.getElementById("selected-api-name").value;
            }
            break;

        case "POST_PARTICIPANT":
          formData = {
            "apiName": document.getElementById("selected-api-name").value,
            "conversationIdentifier": document.getElementById("conversationIdForPostParticipant").value,
            "operation": document.getElementById("participantOperationType").value,
            "participants": participantsPayload
          };
          break;
        case "POST_MESSAGING_SESSION":
          formData = {
            "apiName": document.getElementById("selected-api-name").value,
            "channelAddressIdentifier" : document.getElementById("messaging-session-channel-address-id").value,
            "conversationIdentifier": document.getElementById("messaging-session-conversation-id").value,
            "endUserClientId": document.getElementById("messaging-session-end-user-client-id").value,
            "operation": document.getElementById("messaging-session-operation").value,
            "operationBy": document.getElementById("messaging-session-operation-by").value
          };
          if (formData.operation === "Inactivate") {
            formData.sessionId = document.getElementById("messaging-session-id").value;
          }
          break;
        default:
          throw Error('Not a valid API selected');
      }

      const response = await axios({
        method: "post",
        url: SERVER_URL + "/apiLab",
        data: formData
      });

      // Only show success toast message when success, the rest renders error message
      if (response.data.success) {
        createAndAppendNotificationHTMLElem('success');
        await updateFrequentlyUsedFields();
      } else {
        createAndAppendNotificationHTMLElem('error');
      }

      if (response.data) {
        output.value = JSON.stringify(response.data, null, 2);
      }

    } catch (error) {
      console.error("Error during POST request:", error);
      createAndAppendNotificationHTMLElem('error');
    }
  });

  // Render api fields base on selected API
  const apiContainers = {
    CONSENT: document.getElementById("consentAPIContainer"),
    PATCH_AGENT_WORK: document.getElementById("patchAgentWorkAPIContainer"),
    POST_ROUTE: document.getElementById("postRouteAPIContainer"),
    DELETE_ROUTE: document.getElementById("deleteRouteAPIContainer"),
    POST_ROUTING_RESULT: document.getElementById("postRouteResultAPIContainer"),
    PATCH_REGISTER_CAPABILITIES: document.getElementById("patchRegisterCapabilitiesAPIContainer"),
    POST_AGENT_WORK: document.getElementById("postAgentWorkAPIContainer"),
    POST_CONVERSATION: document.getElementById("postConversationAPIContainer"),
    POST_CONVERSATION_HISTORY: document.getElementById("postConversationHistoryAPIContainer"),
    POST_PARTICIPANT: document.getElementById("postParticipantAPIContainer"),
    POST_MESSAGING_SESSION: document.getElementById("post-messaging-session-container"),
  };

  const hideAllContainers = () => {
    Object.values(apiContainers).forEach(container => container?.classList.add("slds-hide"));
  };

  const showContainer = (api) => {
    const container = apiContainers[api];
    if (container) {
      container.classList.remove("slds-hide");
    }
    if (api === "PATCH_REGISTER_CAPABILITIES") {
      capabilitiesPayload.classList.add("slds-hide");
    }
  };

  const apiDropdown = document.getElementById("selected-api-name");
  apiDropdown.addEventListener("change", (event) => {
    const selectedAPI = event.target.value;
    hideAllContainers();
    showContainer(selectedAPI);
  });

  // hide all containers and show the container for the selected API on initial page load
  hideAllContainers();
  showContainer(apiDropdown.value);


  const messagingSessionOperationDropdown = document.getElementById("messaging-session-operation");
  const inactivateSessionContainer = document.getElementById("inactivate-session-container");
  if (messagingSessionOperationDropdown) {
    messagingSessionOperationDropdown.addEventListener("change", (event) => {
      const selectedMessagingSessionOperation = event.target.value;
      switch (selectedMessagingSessionOperation) {
        case "Inactivate":
          inactivateSessionContainer?.classList.remove("slds-hide");
          break;
        default:
          inactivateSessionContainer?.classList.add("slds-hide");
      }
    });
  }

  const flowInfoContainer = document.getElementById("flowInfoContainer");
  const queueInfoContainer = document.getElementById("queueInfoContainer");
  const routingInfoDropDown = document.getElementById("routingInfo");
  const interactionRequestDropDown = document.getElementById("interactionRequest");
  const capacityPercentageContainer = document.getElementById("capacityPercentageContainer");
  const transferAction = document.getElementById("transferAction");
  const transferActionVisibility = document.getElementById("transferActionVisibility");
  const conferenceAction = document.getElementById("conferenceAction");
  const conferenceActionVisibility = document.getElementById("conferenceActionVisibility");
  const capacityWeightContainer = document.getElementById("capacityWeightContainer");

  if (interactionRequestDropDown) {
    interactionRequestDropDown.addEventListener("change", (event) => {
      const selectedAPI = event.target.value;
      switch (selectedAPI) {
        case "CAPACITY_PERCENTAGE":
          capacityPercentageContainer.classList.remove("slds-hide");
          capacityWeightContainer.classList.add("slds-hide");
          break;
        case "CAPACITY_WEIGHT":
          capacityWeightContainer.classList.remove("slds-hide");
          capacityPercentageContainer.classList.add("slds-hide");
          break;
        case "NONE":
          capacityWeightContainer.classList.add("slds-hide");
          capacityPercentageContainer.classList.add("slds-hide");
          break;
      }
    });
  }

  if (transferAction && transferActionVisibility) {
    transferAction.addEventListener("change", (event) => {
      transferActionVisibility.disabled = !event.target.checked;
    });
  }

  if (conferenceAction && conferenceActionVisibility) {
    conferenceAction.addEventListener("change", (event) => {
      conferenceActionVisibility.disabled = !event.target.checked;
    });
  }

  if (routingInfoDropDown) {
    routingInfoDropDown.addEventListener("change", (event) => {
      const selectedAPI = event.target.value;
      switch (selectedAPI) {
        case "FLOW":
          flowInfoContainer.classList.remove("slds-hide");
          queueInfoContainer.classList.add("slds-hide");
          break;
        case "QUEUE":
          flowInfoContainer.classList.add("slds-hide");
          queueInfoContainer.classList.remove("slds-hide");
          break;
        default:
          flowInfoContainer.classList.add("slds-hide");
          queueInfoContainer.classList.add("slds-hide");
          break;
      }
    });
  }


  // Render the error message field when success is unchecked.
  const errorMessageContainer = document.getElementById("errorMessageContainer");
  const successCheckbox = document.getElementById("successCheckbox");
  if (successCheckbox) {
    successCheckbox.addEventListener("change", (event) => {
      const isSuccessChecked = event.target.checked;
      if (isSuccessChecked) {
        errorMessageContainer.classList.add("slds-hide");
      } else {
        errorMessageContainer.classList.remove("slds-hide");
      }
    });
  }

  // Register message input input event listener to send TypingStartedIndicator request
  document.getElementById("message").addEventListener("input", () => {
    if (typingStartedReady) {
      let formData = new FormData(messageForm);
      formData.append("interactionType", "EntryInteraction");
      formData.append("entryType", "TypingStartedIndicator");
      formData.delete("attachment");

      // submit the request to middleware server
      axios({
        method: "post",
        url: SERVER_URL + "/sendmessage",
        data: formData
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

  let registerCapabilitiesRequestBody = {};
  const capabilitiesPayload = document.getElementById('capabilitiesPayload');
  const runButton = document.getElementById('run-selected-api-button');
  // Get the contents from the uploaded JSON file. The contents represents the request body sent to the api call.
  document.getElementById('registerCapabilities').addEventListener('change', function (event) {
    const file = event.target.files[0];
    capabilitiesPayload.classList.remove('slds-hide');

    if (file && file.type === "application/json") {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const json = JSON.parse(e.target.result);
          capabilitiesPayload.textContent = JSON.stringify(json, null, 2);
          registerCapabilitiesRequestBody = json;
          runButton.disabled = false;
        } catch (error) {
          capabilitiesPayload.textContent = 'Error parsing JSON: ' + error.message;
          runButton.disabled = true;
        }
      };
      reader.readAsText(file);
    } else {
      document.getElementById('capabilitiesPayload').textContent = 'Please upload a valid JSON file.';
      runButton.disabled = true;
    }
  });

  let conversationParticipantsBody = {};
  let conversationEntriesBody = {};
  const conversationParticipantsPayload = document.getElementById('conversationsPayload');
  const conversationEntriesPayload = document.getElementById('entriesPayload');
  const conversationParticipantsFileInput = document.getElementById('conversationParticipants');
  if (conversationParticipantsFileInput) {
    // Get the contents from the uploaded JSON file for Conversation Particiapnts and ConversationEntries.
    document.getElementById('conversationParticipants').addEventListener('change', async function(event) {
      await readFilesForConversationHistory (event, conversationParticipantsPayload, 'conversationsPayload');
      console.log(conversationParticipantsBody);
    });
    document.getElementById('conversationEntries').addEventListener('change', async function(event) {
      await readFilesForConversationHistory(event, conversationEntriesPayload, 'entriesPayload');
      console.log(conversationEntriesBody);
    });
  }

  function readFilesForConversationHistory(event, payloadUiText, payloadElementId) {
    return new Promise(() => {
      const file = event.target.files[0];
      payloadUiText.classList.remove('slds-hide');

      if (file && file.type === "application/json") {
        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            const json = JSON.parse(e.target.result);
            payloadUiText.textContent = JSON.stringify(json, null, 2);
            if (payloadElementId === 'conversationsPayload') {
              conversationParticipantsBody = json;
            } if (payloadElementId === 'entriesPayload'){
              conversationEntriesBody = json;
            }
            runButton.disabled = false;
          } catch (error) {
            payloadUiText.textContent = 'Error parsing JSON: ' + error.message;
            runButton.disabled = true;
          }
        };
        reader.readAsText(file);
      } else {
        document.getElementById(payloadElementId).textContent = 'Please upload a valid JSON file.';
        runButton.disabled = true;
      }
    });
  }

  const participantTextArea = document.getElementById('participantsPayload');
  participantTextArea.addEventListener('input', async() => {
    await validateParticipantsPayload(participantTextArea, false);
  });

  participantTextArea.addEventListener('blur', async() => {
    await validateParticipantsPayload(participantTextArea, true);
  })


  let participantsPayload = {};
  // JSON payload validation when the user finishes typing the payload
  // format is used to format the payload when the user finishes typing the payload
  async function validateParticipantsPayload(participantTextArea, format=false) {
      try {
        const jsonContent = JSON.parse(participantTextArea.value);
        participantsPayload = jsonContent;
        participantTextArea.parentElement.classList.remove('slds-has-error');
        document.getElementById('participantsPayloadErrorMessage').classList.add('slds-hide');
        if (format) {
          participantTextArea.value = JSON.stringify(jsonContent, null, 2);
        }
      } catch (error) {
        participantTextArea.parentElement.classList.add('slds-has-error');
        document.getElementById('participantsPayloadErrorMessage').classList.remove('slds-hide');
        participantsPayload = {};
      }
  }

  // Register custom event to retrieve the replied message from an agent in core app
  //let eventSourceUrl = "" + window.location.origin + "/replyMessage";
  let eventSourceUrl = SERVER_URL + "/replyMessage";
  const evtSource = new EventSource(eventSourceUrl);
  evtSource.addEventListener("replymsg", (e) => {
    if (!orgMode) {
      axios({
        method: "get",
        url: SERVER_URL + "/getOrgMode"
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

  if(document.getElementById('healthCheckButton')) {
    axios({
      method: "get",
      url: SERVER_URL + "/getOrgMode"
    }).then((res) => {
      if (res && res.data && res.data.orgMode !== 'VOICE_ONLY') {
        // show healthTab
        document.getElementById('healthCheckTab').classList.remove("slds-hide");

        // Register event for check button
        document.getElementById('healthCheckButton').addEventListener('click', runHealthCheck);
      }
    });
  }

  function appendAgentActionVisibilities(formData) {
    let agentActionVisibilities = [];
    if (document.getElementById("transferAction").checked) {
      agentActionVisibilities.push({
        "agentAction": "Transfer",
        "visible": document.getElementById("transferActionVisibility").value === 'true'
      });
    }

    if (document.getElementById("conferenceAction").checked) {
      agentActionVisibilities.push({
        "agentAction": "Conference",
        "visible": document.getElementById("conferenceActionVisibility").value === 'true'
      });
    }
    formData.agentActionVisibilities = JSON.stringify(agentActionVisibilities);
  }

  function registerEvents(event) {
    if (orgMode !== 'VOICE_ONLY') {
      console.log('\n=============== EventSource - replymsg event:', event.data);
      let replyObj = JSON.parse(event.data);
      if (replyObj.eventType === messagingConstants.EVENT_TYPE.INTERACTION) {
        //check if event is typing indicator
        let payload = JSON.parse(replyObj.payloadField.string);
        let entryType = payload.payload.entryType;

        switch(entryType) {
          case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.TYPING_STARTED_INDICATOR:
          case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.TYPING_STOPPED_INDICATOR:
          case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.PROGRESS_INDICATOR:
            indicatorStatus = entryType;
            generateIndicators(indicatorStatus, payload.payload, replyObj.replyMessageText);
            return;
          case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.ROUTING_WORK_RESULT:
          case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.READ_ACKNOWLEDGEMENT:
          case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.DELIVERY_ACKNOWLEDGEMENT:
            handleAckEventBadgeByClassName(JSON.parse(event.data));
            return;
        }

        switch(replyObj.messageType) {
          case messagingConstants.EVENT_PAYLOAD_MESSAGE_TYPE.CHOICES_MESSAGE:
            appendChoicesMessageToChatList(replyObj,replyObj.payloadField.string);
            break;
          case messagingConstants.EVENT_PAYLOAD_MESSAGE_TYPE.FORM_MESSAGE:
            appendFormMessageToChatList(replyObj);
            break;
          case messagingConstants.EVENT_PAYLOAD_MESSAGE_TYPE.STATIC_CONTENT_MESSAGE:
            appendInboundMessageToChatList(replyObj.replyMessageText, replyObj.attachmentName, replyObj.attachmentUrl, replyObj.payloadField,
            replyObj.previewImageUrl, replyObj);
            break;
          default:
            console.log('Unsupported message type:', replyObj.messageType);
        }
      } else if (replyObj.eventType === messagingConstants.EVENT_TYPE.ROUTING_REQUESTED) {
        appendInboundEventToChatList(replyObj.eventType, replyObj.payloadField);
      }
    }
  }

  function getTestDescription(testName) {
    const descriptionKey = testDescriptionMapping[testName];
    const description = testDescriptions[descriptionKey] || 'Description not available.';
    return description.split('\n').map(line => `<p>${line}</p>`).join('');
  }

  function createAccordionHTML(results) {
    // All the .svg files used in Assets/healthCheckIcons in createAccordionHTML and ccaas.html are from Salesforce SLDS icons: https://www.figma.com/community/file/854597149359643291/foundation-icons-lightning-design-system
    return Object.entries(results).map(([testName, result], index) => `
        <li class="slds-accordion__list-item">
            <section class="slds-accordion__section">
                <div class="slds-accordion__summary">
                    <h3 class="slds-accordion__summary-heading" style="margin-right: 1rem">
                        <button class="slds-button slds-button_reset slds-accordion__summary-action" 
                                aria-controls="accordion-details-${index}" 
                                aria-expanded="false" 
                                title="${testName}">
                            <img src="/assets/healthCheckIcons/switch.svg" class="slds-accordion__summary-action-icon slds-button__icon slds-button__icon_left" alt="Toggle details" />
                            <span class="slds-accordion__summary-content">${testDescriptionMapping[testName]}</span>
                        </button>
                    </h3>
                    <span class="slds-badge ${result.isValid ? 'slds-theme_success' : 'slds-theme_error'} slds-badge_lightest" style="display: flex; align-items: center; gap: 4px;">
                        <img src="/assets/healthCheckIcons/${result.isValid ? 'checkCircle.svg' : 'errorCircle.svg'}" alt="${result.isValid ? 'Passed' : 'Failed'}" width="16" height="16" />
                        ${result.isValid ? 'Passed' : 'Failed'}
                    </span>
                </div>
                <div hidden class="slds-accordion__content" id="accordion-details-${index}">
                    <div class="health-check-description slds-p-around_medium">
                        <h4 class="slds-text-heading_small">Description:</h4>
                        <div class="slds-text-longform">
                            ${getTestDescription(testName)}
                        </div>
                    </div>
                    <div class="slds-p-around_medium">
                        <p class="slds-m-bottom_small"><strong>Recommended Fix:</strong> Follow this <a href="${knowledgeArticles[testDescriptionMapping[testName]] || '#'}" target="_blank" class="slds-text-color_primary">knowledge article</a> for a fix.</p>
                        <p><strong>Subcheck Results:</strong> ${result.reason}</p>
                    </div>
                </div>
            </section>
        </li>
    `).join('');
}

async function runHealthCheck() {
  const button = document.getElementById('healthCheckButton');
  const resultsDiv = document.getElementById('healthCheckResults');
  
  if (!resultsDiv || !button) {
      console.error('Required elements not found');
      return;
  }

  resultsDiv.style.display = 'none';
  button.textContent = 'Running...';
  button.disabled = true;

  try {
      const currentPath = window.location.pathname;
      const pageType = currentPath.includes('ccaas') ? 'ccaas' : 
                       currentPath.includes('ottapp') ? 'ott' : 'unknown';

      const response = await axios.get(`${SERVER_URL}/runAllValidationTests`, { params: { pageType } });
      
      if (response.data.success) {
          displayResults(response.data.results);
      } else {
          console.error('Error running tests:', response.data.error);
          alert(`An error occurred while running the health check: ${response.data.error}`);
      }
  } catch (error) {
      console.error('Error:', error);
      alert(`An error occurred: ${error.message}`);
  } finally {
      button.textContent = 'Run Health Check';
      button.disabled = false;
  }
}

function displayResults(results) {
  const resultsContainer = document.getElementById('healthCheckResults');
  const totalChecks = Object.keys(results).length;
  const passedChecks = Object.values(results).filter(r => r.isValid).length;
  const failedChecks = totalChecks - passedChecks;

  resultsContainer.innerHTML = `
      <div class="slds-box slds-theme_default slds-m-top_medium">
          <div class="slds-card__header slds-grid slds-grid_vertical">
              <h2 class="slds-text-heading_small slds-text-title_bold slds-m-bottom_small">All Checks</h2>
              <p class="slds-text-body_regular">Description of All Checks...</p>
          </div>
          <div class="slds-card__body">
              <div class="slds-grid slds-gutters slds-m-bottom_medium">
                  <div class="slds-col">
                      <p class="slds-text-title slds-m-bottom_small">Initiated Checks</p>
                      <p class="slds-text-heading_small slds-text-title_bold">${totalChecks}</p>
                  </div>
                  <div class="slds-col">
                      <p class="slds-text-title slds-m-bottom_small">Passed Checks</p>
                      <p class="slds-text-heading_small slds-text-title_bold">${passedChecks}</p>
                  </div>
                  <div class="slds-col">
                      <p class="slds-text-title slds-m-bottom_small">Failed Checks</p>
                      <p class="slds-text-heading_small slds-text-title_bold">${failedChecks}</p>
                  </div>
              </div>
              <hr class="slds-m-bottom_small">
              <ul class="slds-accordion">
                  ${createAccordionHTML(results)}
              </ul>
          </div>
      </div>
  `;

  resultsContainer.style.display = 'block';
  initializeAccordion(resultsContainer);
}

function initializeAccordion(element) {
  if (!element) return;

  element.querySelectorAll('.slds-accordion__summary-action').forEach(accordion => {
      accordion.addEventListener('click', () => {
          const section = accordion.closest('.slds-accordion__section');
          const content = section.querySelector('.slds-accordion__content');
          const isExpanded = accordion.getAttribute('aria-expanded') === 'true';

          accordion.setAttribute('aria-expanded', !isExpanded);
          content.hidden = isExpanded;
          section.classList.toggle('slds-is-open', !isExpanded);
      });
  });
}

if (!orgMode) {
  axios({
    method: "get",
    url: SERVER_URL + "/getOrgMode"
  }).then((res) => {
    if (res && res.data && res.data.orgMode) {
      orgMode = res.data.orgMode;
    }
    getSettingsForApp();
  });
} else {
  getSettingsForApp();
}

function getSettingsForApp() {
  axios({
    method: "get",
    url: SERVER_URL + "/getsettings"
  }).then((res) => {
      if (res.status === 200) {
        // set settings fields with values retrieved from middleware server
        let settings = res.data;
        autoCreateAgentWork = settings.autoCreateAgentWork === "true";
        document.getElementById("authorizationContext").value = settings.authorizationContext;
        document.getElementById("channelAddressIdentifier").value = settings.channelAddressIdentifier;
        document.getElementById("endUserClientIdentifier").value = settings.endUserClientIdentifier;
        document.getElementById("customEventPayloadField").value = settings.customEventPayloadField;
        document.getElementById("customEventTypeField").value = settings.customEventTypeField;
        if (document.getElementById("customPlatformEvent")) {
          document.getElementById("customPlatformEvent").value = settings.customPlatformEvent;
        }
        if (document.getElementById("userId")) {
          document.getElementById("userId").value = settings.userId;
        }
        // For ott routing Owner is not part of UI
        if (document.getElementById("routingOwner")) {
          document.getElementById("routingOwner").value = settings.routingOwner;
        }

        if (settings.sfSubject) {
          sfSubject = settings.sfSubject.split('@').shift();
        }
        endUserClientName = settings.endUserClientIdentifier;

        // Ensuring the demo connector runs gracefully even if the .env is not present
        if (!settings.authorizationContext) {
          return null;
        } else {
          return axios({
            method: "get",
            url: SERVER_URL + "/getConversationChannelDefinition",
          });
        }
      }
    }).then((ccdResponse) => {
      if (ccdResponse && ccdResponse.status && ccdResponse.status === 200) {
        let ccdDataRecord = ccdResponse.data;
        if (ccdDataRecord) {
          document.getElementById("authorizationContext").value = ccdDataRecord.DeveloperName;
          document.getElementById("isInboundReceiptsPartnerEnabled").value = ccdDataRecord.IsInboundReceiptsEnabled;
          document.getElementById("isTypingIndicatorPartnerEnabled").value = !ccdDataRecord.IsTypingIndicatorDisabled;
          if (document.getElementById("customPlatformEvent")) {
            document.getElementById("customPlatformEvent").value = ccdDataRecord.CustomPlatformEvent;
          }
          document.getElementById("customEventPayloadField").value = ccdDataRecord.CustomEventPayloadField;
          document.getElementById("customEventTypeField").value = ccdDataRecord.CustomEventTypeField;
          if (document.getElementById("routingOwner")) {
            document.getElementById("routingOwner").value = ccdDataRecord.RoutingOwner;
          }
          if (document.getElementById("consentOwner")) {
            document.getElementById("consentOwner").value = ccdDataRecord.ConsentOwner;
          }

          axios({
            method: "get",
            url: SERVER_URL + "/getApiVersion"
          }).then((res) => {
            const apiVersion = res.data;
            if (ccdDataRecord.Id && apiVersion && apiVersion >= 63.0) {
              axios({
                method: "post",
                url: SERVER_URL + "/getCustomMsgChannels",
                data: {'ccdId': ccdDataRecord.Id}
              }).then((cmcRes) => {
                let hasCmcRecord = false;
                if (cmcRes && cmcRes.status && cmcRes.status === 200) {
                  let cmcData = cmcRes.data;
                  if (cmcData && cmcData.records && cmcData.records.length > 0) {
                    hasCmcRecord = true;
                    const cmcDataRecord = cmcData.records[0];
                    document.getElementById("isInboundReceiptsSalesforceEnabled").value = cmcDataRecord.HasInboundReceipts;
                    document.getElementById("isTypingIndicatorSalesforceEnabled").value = cmcDataRecord.HasTypingIndicator;
                  }
  
                  // default values
                  if (!hasCmcRecord) {
                    document.getElementById("isInboundReceiptsSalesforceEnabled").value = false;
                    document.getElementById("isTypingIndicatorSalesforceEnabled").value = true;
                  }
  
                  document.getElementById("inboundReceiptsAndTypingIndicator").style.display = 'block';
                }
              });
            }
          });
        } else {
          console.log("No records found in the CCD data");
        }
      } else {
        console.log("Invalid CCD response");
        if (orgMode !== 'VOICE_ONLY') {
          Swal.fire({
            icon: 'info',
            title: 'Info',
            html: "<div class=\"slds-text-align_left\">An error occurred while retrieving CCD data, either because the server is down for maintenance or no records were found in the CCD table.</div><br/>"+
              "<ul class=\"popup-info-ul slds-text-align_left\">"+
              "  <li>The demo connector won't work properly for Messaging features.</li><br/>"+
              "  <li>The demo connector works fine for Voice features if it is enabled.</li>"+
              "</ul>"
          });
        }
      }
    })
    .catch((err) => {
        throw err;
    });
  }

  // Frequent Fields Implementation
  document.querySelectorAll('.frequent-fields-copy-button').forEach(button => {
    button.addEventListener('click', async () => {
      const targetId = button.getAttribute('copy-target');
      const inputElement = document.getElementById(targetId);
      if (inputElement) {
        try {
          const originalText = button.textContent;
          button.disabled = true;
          button.textContent = 'Copied';
          await navigator.clipboard.writeText(inputElement.value);
          // if successful, change the button to 'Copied' and reset in 1.5 seconds
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
          }, 1500);
        } catch (error) {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to copy to clipboard'
          });
        }
      }
    });
  });

  document.querySelectorAll('.auto-fill-button').forEach(button => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      const targetId = button.getAttribute('auto-fill-target-id');
      const inputElement = document.getElementById(targetId);
      const cacheKey = inputElement?.getAttribute('with-ff-cache-key');
      if (inputElement && cacheKey) {
        inputElement.value = frequentlyUsedFields[cacheKey] ?? '';
      }
    });
  });

  // update frequently used fields initially on page load
  (async () => { await updateFrequentlyUsedFields(); })();
});

chatList = document.getElementById('chatList');

function appendOutboundMessageToChatList(message, originalFileName, fileName) {
  if (originalFileName && fileName) {
    appendAttachmentOutboundMessageToChatList(originalFileName, SERVER_URL + "/uploads/" + fileName);
  }

  let outboundMessageHTMLElem = generateOutboundMessageHTMLElem(message);

  appendMessageToChatList(outboundMessageHTMLElem);

  return outboundMessageHTMLElem;
}

function generateIndicators(indicatorStatus, payload, textMessage) {
  const TYPING_INDICATOR_ID = 'typingIndicator';
  const typingIndicatorElement = document.getElementById(TYPING_INDICATOR_ID);
  const senderDisplayName = (payload && payload.senderDisplayName) ? payload.senderDisplayName : 'Agent';
  switch (indicatorStatus) {
    case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.TYPING_STARTED_INDICATOR:
      if (!typingIndicatorElement) {
        let htmlElement = htmlToElem('<div class="slds-chat-message__body" id="' + TYPING_INDICATOR_ID + '">' +
          '<div class="slds-chat-message__text slds-chat-message__text_inbound">' +
               '<span class="slds-icon-typing slds-is-animated slds-list_horizontal" title="Agent typing">' +
                  '<span class="slds-icon-typing__dot"></span>' +
                  '<span class="slds-icon-typing__dot"></span>' +
                  '<span class="slds-icon-typing__dot"></span>' +
                  '<span class="slds-assistive-text">Agent is typing</span>' +
               '</span>' +
          '</div>' +
          '<div class="slds-chat-message__meta">' +
              '<span>' + senderDisplayName + '</span>' +
          '</div>' +
        '</div>');
        chatList.appendChild(htmlElement);
        chatList.scrollTop = chatList.scrollHeight;
      }
      break;
    case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.TYPING_STOPPED_INDICATOR:
      if (typingIndicatorElement) {
        chatList.removeChild(typingIndicatorElement);
      }
      break;
    case messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.PROGRESS_INDICATOR:
      if (typingIndicatorElement) {
        chatList.removeChild(typingIndicatorElement);
        let htmlElement = htmlToElem('<div class="slds-chat-message__body" id="' + TYPING_INDICATOR_ID + '">' +
          '<div class="slds-chat-message__text slds-chat-message__text_inbound">' +
               '<span class="slds-icon-typing slds-is-animated slds-list_horizontal" title="Agent typing">' +
                  '<span>' + (textMessage ? textMessage : null) +'</span>'+
                  '<span class="slds-assistive-text">Agent is typing</span>' +
               '</span>' +
          '</div>' +
          '<div class="slds-chat-message__meta">' +
              '<span>' + senderDisplayName + '</span>' +
          '</div>' +
        '</div>');
        chatList.appendChild(htmlElement);
        chatList.scrollTop = chatList.scrollHeight;
      }
      break;
    default:
      return;
  }
}

function reloadTypingIndicator() {
  var typingIndicatorElement = document.getElementById('typingIndicator');
  if (typingIndicatorElement) {
    chatList.removeChild(typingIndicatorElement);
  }
  generateIndicators(indicatorStatus);
}

function generateOutboundMessageHTMLElem(message) {
  let now = new Date();
  let dateTime = now.toLocaleString();

  let html =
    '<li class="slds-chat-listitem ' + OUTBOUND_MESSAGE_LIST_ITEM_CLASS_NAME + '">' +
    '  <div class="slds-chat-message">' +
    '    <div class="slds-chat-message__body">' +
    '      <div class="slds-chat-message__text slds-chat-message__text_outbound" style="white-space: normal;">' +
    '        <div>' + parseMarkdown(message) +
    '        </div>' +
    '      </div>' +
    '      <div class="slds-chat-message__meta" aria-label="said ' + endUserClientName + ' at ' + dateTime + '">' + endUserClientName + ' • ' + dateTime +
    '        <div class="slds-float_right ' + ACK_BADGE_CONTAINER_CLASS_NAME + '">' +
    '        </div>' +
    '      </div>' +
    '    </div>'   +
    '  </div>' +
    '</li>';

  return htmlToElem(html);
}

function insertAckBadgeElemsToOutboundMessageHTMLElem(ackBadgeContainerElem, sendMessageRes) {
  if (!ackBadgeContainerElem) {
    return ackBadgeContainerElem;
  }

  let responseData = (!!sendMessageRes && sendMessageRes?.data) ? sendMessageRes?.data : null;
  let conversationEntryId = (!!responseData && !!responseData.conversationEntryId) ? responseData.conversationEntryId : '';
  let isSuccess = responseData ? responseData.success : false;
  let html =
    '          <div class="slds-p-left_x-small ' + READ_ACK_CLASS_Name + '" id="' + (READ_ACK_BADGE_ID_PREFIX + conversationEntryId) + '" style="display: ' + DISPLAY_STYLE_NONE + '">' +
    '            <span><i>Read</i></span>' +
    '            <span class="slds-icon_container slds-p-left_xx-small slds-icon-utility-check slds-p-right_xx-small" title="Read">' +
    '              <img src="/assets/infoIcons/greenCheck.jpg" alt="Success" width="11" height="11" />' +
    '            </span>' +
    '          </div>' +
    '          <div class="slds-p-left_x-small ' + DELIVERY_ACK_CLASS_Name + '" id="' + (DELIVERY_ACK_BADGE_ID_PREFIX + conversationEntryId) + '" style="display: ' +  DISPLAY_STYLE_BLOCK + '">' +
    '            <span><i>Delivered</i></span>' +
    '            <span class="slds-icon_container slds-p-left_xx-small slds-icon-utility-check slds-p-right_xx-small" title="Delivered">' +
    '              <img src="/assets/infoIcons/' + (isSuccess ? 'greenCheck.jpg' : 'redCross.jpg') + '" alt="' + (isSuccess ? 'Success' : 'Error') + '" width="11" height="11"/>' +
    '            </span>' +
    '          </div>';

  const items = ackBadgeContainerElem.getElementsByClassName(ACK_BADGE_CONTAINER_CLASS_NAME);
  if (!!items && items.length > 0) {
    items[0].innerHTML = html;
  }

  return ackBadgeContainerElem;
}

function forceLinksToOpenInNewTab(html) {
  return html.replace(
    /<a\s+([^>]*\bhref=['"][^'"]+['"][^>]*)>/gi,
    (match, attrs) => {
      // Check if it already includes target or rel
      const hasTarget = /target\s*=/.test(attrs);
      const hasRel = /rel\s*=/.test(attrs);

      let newAttrs = attrs;
      if (!hasTarget) {
        newAttrs += ' target="_blank"';
      }
      if (!hasRel) {
        newAttrs += ' rel="noopener noreferrer"';
      }

      return `<a ${newAttrs}>`;
    }
  );
}

function clearAckBadgesForPreviousOutboundMessageListItems(latestReadAckBadgeElem) {
  let liElem = latestReadAckBadgeElem.closest(OUTBOUND_MESSAGE_LIST_ITEM_QUERY_CLASS_NAME);
  if (!!liElem && liElem.tagName === "LI") {
    liElem = liElem.previousElementSibling;
    while (liElem && liElem.tagName === "LI" && liElem.className.indexOf(OUTBOUND_MESSAGE_LIST_ITEM_CLASS_NAME) !== -1)  {
      let readAckBadgeElems = liElem.getElementsByClassName(READ_ACK_CLASS_Name);
      if (readAckBadgeElems) {
        if (readAckBadgeElems[0])
        readAckBadgeElems[0].style.display = DISPLAY_STYLE_NONE;
      }
      let deliveryAckBadgeElems = liElem.getElementsByClassName(DELIVERY_ACK_CLASS_Name);
      if (!!deliveryAckBadgeElems && !!deliveryAckBadgeElems[0].getElementsByTagName("img")) {
        let imgs = deliveryAckBadgeElems[0].getElementsByTagName("img");
        if (!!imgs && imgs[0].getAttribute("alt") === "Success") {
          // Only clear delivery badge with Success state
          deliveryAckBadgeElems[0].style.display = DISPLAY_STYLE_NONE;
        }
      }
      liElem = liElem.previousElementSibling;
    }
  }
}

function handleAckEventBadgeByClassName(data) {
  const outboundElemCount = document.querySelectorAll(ACK_BADGE_CONTAINER_QUERY_CLASS_NAME).length;
  if (outboundElemCount === 0) {
    // None of MEU outbound message badge entries in list
    return;
  }

  // Clear all read event badges for MEU outbound message entries
  document.querySelectorAll(READ_ACK_QUERY_CLASS_Name).forEach(el => {
    el.style.display = DISPLAY_STYLE_NONE;
  });

  const ackMsgObj = JSON.parse(data.payloadField.string).payload.entryPayload;
  const entryType = ackMsgObj.entryType;
  if (entryType === messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.ROUTING_WORK_RESULT) {
    if (ackMsgObj.workType === 'Assigned' || ackMsgObj.workType === 'Closed') {
      // TODO: Add scripts for assigned/closed cases later if needed.
    } else if (ackMsgObj.workType === 'Accepted') {
      document.querySelectorAll(DELIVERY_ACK_QUERY_CLASS_Name).forEach(el => {
        el.style.display = DISPLAY_STYLE_NONE;
      });
      document.querySelectorAll(READ_ACK_QUERY_CLASS_Name).forEach(el => {
        el.style.display = DISPLAY_STYLE_BLOCK;
      });
    }

    return;
  }

  let conversationEntryId = ackMsgObj.acknowledgedConversationEntryIdentifier;
  conversationEntryId = conversationEntryId ? conversationEntryId : 'no_id_found';

  let readAckBadgeElem = document.getElementById(READ_ACK_BADGE_ID_PREFIX + conversationEntryId);
  let deliveryAckBadgeElem = document.getElementById(DELIVERY_ACK_BADGE_ID_PREFIX + conversationEntryId);
  if (entryType === messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.READ_ACKNOWLEDGEMENT) {
    if (deliveryAckBadgeElem) {
      deliveryAckBadgeElem.style.display = DISPLAY_STYLE_NONE;
    }
    if (readAckBadgeElem) {
      readAckBadgeElem.style.display = DISPLAY_STYLE_BLOCK;

      // If current message is marked as "Read", all pervious "Delivered" messages with Success should be read too, just clear "Delivered" Success badges if any.
      clearAckBadgesForPreviousOutboundMessageListItems(readAckBadgeElem)
    }
  } else if (entryType === messagingConstants.EVENT_PAYLOAD_ENTRY_TYPE.DELIVERY_ACKNOWLEDGEMENT) {
    if (!!readAckBadgeElem && readAckBadgeElem.style.display === DISPLAY_STYLE_BLOCK) {
      // Sometimes the DELIVERY_ACKNOWLEDGEMENT event was fired after READ_ACKNOWLEDGEMENT was fired, so prioritize "read" over "delivery" badge.
      return;
    } else {
      if (deliveryAckBadgeElem) {
        deliveryAckBadgeElem.style.display = DISPLAY_STYLE_BLOCK;
      }
    }
  }
}

function parseMarkdown(text) {
  if (typeof text === 'string' && text.trim() !== '') {
    const markedOutput = forceLinksToOpenInNewTab(marked.parse(text).trim());

    // Add inline styles for ul and ol to ensure bullets and indentation
    const styledOutput = markedOutput
      .replace(/<ul>/g, '<ul class="markedUL">')
      .replace(/<ol>/g, '<ol class="markedOL">');

    // Replace newline between <p> tags into <br> to preserve the intended linebreaks in the rendered output.
    return styledOutput.replace(/<\/p>\n<p>/g, "</p><br><p>");  
  }
}

function createAndAppendNotificationHTMLElem(element) {
  let html;
  switch (element) {
    case 'success':
      html =
        '<div class="slds-form-element slds-form-element_stacked">' +
        '    <div class="slds-form-element__control">' +
        '        <div class="slds-scoped-notification slds-media slds-media_center slds-theme_success" role="status">' +
        '            <div class="slds-media__figure">' +
        '              <span class="slds-icon_container slds-icon-utility-success" title="success">' +
        '                <svg class="slds-icon slds-icon_small" aria-hidden="true">' +
        '                  <use xlink:href="/assets/symbols.svg#success"></use>' +
        '                </svg>' +
        '                <span class="slds-assistive-text">success</span>' +
        '              </span>' +
        '            </div>' +
        '            <div class="slds-media__body">' +
        '              <p>Success!</p>' +
        '            </div>' +
        '          </div>' +
        '    </div>' +
        '</div>';
      break;
    case 'error':
      html =
        '<div class="slds-scoped-notification slds-media slds-media_center slds-theme_error" role="status">' +
        '    <div class="slds-media__figure">' +
        '      <span class="slds-icon_container slds-icon-utility-error" title="error">' +
        '        <svg class="slds-icon slds-icon_small" aria-hidden="true">' +
        '          <use xlink:href="/assets/symbols.svg#error"></use>' +
        '        </svg>' +
        '        <span class="slds-assistive-text">error</span>' +
        '      </span>' +
        '    </div>' +
        '    <div class="slds-media__body">' +
        '      <p>Error.</p>' +
        '    </div>' +
        '  </div>';
      break;
  }
  const newElement = htmlToElem(html);

  document.getElementById('notification').appendChild(newElement);

  setTimeout(() => {
    newElement.style.display = 'none';
  }, 5000); // 5 seconds
}

function appendAttachmentOutboundMessageToChatList(fileName, fileUrl) {
  let attachmentOutboundMessageHTMLElem = generateAttachmentForOutboundMessageHTMLElem(fileName, fileUrl);

  appendMessageToChatList(attachmentOutboundMessageHTMLElem);
}

function appendInboundEventToChatList(type, payload) {

  let inboundMessageHTMLElem;
  let message = "Event received";
  if (type === messagingConstants.EVENT_TYPE.ROUTING_REQUESTED) {
    message = "Routing Requested event received"
  }
  inboundMessageHTMLElem = generateEventMessageHTMLElem(message);

  appendMessageToChatList(inboundMessageHTMLElem);
  document.getElementById("eventLog").value = JSON.stringify(JSON.parse(payload.string), undefined, 4);
}

function generateEventMessageHTMLElem(message) {
  let now = new Date();
  let dateTime = now.toLocaleString();
  let html =
    '<li class="slds-chat-listitem slds-chat-listitem_event">' +
    '  <div class="slds-chat-event">' +
    '    <div class="slds-chat-event__body">' +
    '      <div class="slds-chat-event__agent-message">' +
    '					<p>' + dateTime + '</p>' +
    '        <div>' + parseMarkdown(message) +
    '        </div>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</li>';

  return htmlToElem(html);
}

function generateAttachmentForOutboundMessageHTMLElem(fileName, fileUrl) {
  let now = new Date();
  let dateTime = now.toLocaleString();
  let html =
    '<li class="slds-chat-listitem slds-chat-listitem_outbound">' +
    '  <div class="slds-chat-message">' +
    '    <div class="slds-chat-message__body">' +
    '      <div class="slds-chat-message__file slds-chat-message__file_outbound">' +
    '        <div class="slds-file slds-has-title">' +
    '          <figure>' +
    '            <a href="' + fileUrl + '" class="slds-file__crop slds-file__crop_4-by-3" target="_blank">' +
    '              <span class="slds-assistive-text">Preview:</span>' +
    '              <img src="/slds/images/placeholder-img@16x9.jpg" alt="Attachment" />' +
    '            </a>' +
    '            <figcaption class="slds-file__title slds-file__title_card slds-file-has-actions">' +
    '              <div class="slds-media slds-media_small slds-media_center">' +
    '                <div class="slds-media__figure slds-line-height_reset">' +
    '                  <span class="slds-icon_container" title="file">' +
    '                    <svg class="slds-icon slds-icon_x-small" aria-hidden="true">' +
    '                      <use xlink:href="/slds/icons/doctype-sprite/svg/symbols.svg#attachment"></use>' +
    '                    </svg>' +
    '                    <span class="slds-assistive-text">file</span>' +
    '                  </span>' +
    '                </div>' +
    '                <div class="slds-media__body">' +
    '                  <span class="slds-file__text slds-truncate" title="' + fileName + '">' + fileName + '</span>' +
    '                </div>' +
    '              </div>' +
    '            </figcaption>' +
    '          </figure>' +
    '        </div>' +
    '      </div>' +
    '      <div class="slds-chat-message__meta" aria-label="said ' + endUserClientName + ' at ' + dateTime + '">' + endUserClientName + ' • ' + dateTime + '</div>' +
    '    </div>' +
    '  </div>' +
    '</li>';

  return htmlToElem(html);
}

// Updated function for handling ChoicesMessages
function appendChoicesMessageToChatList(choicesMessage, payloadString) {
  const payloadId = JSON.parse(payloadString).payload.entryPayload.id;

  let buttonsElement = generateCustomChoicesHTMLElem(choicesMessage, payloadId);
  appendMessageToChatList(buttonsElement);

  // Update event log
  document.getElementById("eventLog").value = JSON.stringify(JSON.parse(payloadString), undefined, 4);
}

// Custom function to generate HTML for ChoicesMessage 
function generateCustomChoicesHTMLElem(choicesMessage, payloadId) {
  let now = new Date();
  let dateTime = now.toLocaleString();
  
  let html = `
    <li class="slds-chat-listitem slds-chat-listitem_inbound">
      <div class="slds-chat-message">
        <div class="slds-chat-message__body">
          <div class="slds-chat-message__text slds-chat-message__text_inbound">
              <div>  ${parseMarkdown(choicesMessage.choiceText)}
              </div>
          </div>
          <div class="choices-message" id="choices-${Date.now()}" data-payload-id="${payloadId}">
            <div class="custom-choices-grid">
              ${choicesMessage.optionItems.map(item => `
                <button class="custom-choice-button" 
                        data-identifier="${item.optionIdentifier}"
                        data-title="${item.titleItem.title}">
                  ${item.titleItem.title}
                </button>
              `).join('')}
            </div>
          </div>
          <div class="slds-chat-message__meta" aria-label="said ${sfSubject} at ${dateTime}"> ${sfSubject} •  ${dateTime} </div>
        </div>
      </div>
    </li>
  `;

  return htmlToElem(html);
}

function handleButtonClick(event) {
  const button = event.target;
  const identifier = button.getAttribute('data-identifier');
  const title = button.getAttribute('data-title');
  
  console.log('Button clicked:', title, 'with identifier:', identifier);
  
  // Disable all buttons in this choice group
  const choicesContainer = button.closest('.choices-message');
  const allButtons = choicesContainer.querySelectorAll('.custom-choice-button'); 
  const payloadId = choicesContainer.getAttribute('data-payload-id');
  console.log('payloadId:', payloadId);
  
  allButtons.forEach(btn => {
    btn.disabled = true;
    btn.classList.add('slds-button_disabled');
  });

  // Highlight the selected button
  button.classList.remove('slds-button_outline-brand');
  button.classList.add('custom-button_selected');

  let messageContent = `Selected option: ${title}`;
  
  // Create a FormData object
  let formData = new FormData();
  formData.append('message', messageContent);
  formData.append('interactionType', 'EntryInteraction');
  formData.append('entryType', 'Message');
  formData.append('optionIdentifier', identifier);
  formData.append("messageType", "ChoicesResponseMessage");
  formData.append("inReplyToMessageId", payloadId);
  
  // Send the message to the server
  axios({
    method: "post",
    url: SERVER_URL + "/sendmessage",
    data: formData
  })
    .then((res) => {
      if (res.status === 200) {
        console.log(res);
        appendOutboundMessageToChatList(messageContent);
      }
    })
    .catch((err) => {
      console.error('Error sending message:', err);
    });
}

document.getElementById('chatList').addEventListener('click', function(event) {
  if (event.target.classList.contains('custom-choice-button') && !event.target.disabled) {
    handleButtonClick(event);
  }
});

function appendInboundMessageToChatList(message, attachmentName, attachmentUrl, payloadField,
    previewImageUrl, inputPayload) {
  if (attachmentName && attachmentUrl) {
    appendAttachmentInboundMessageToChatList(attachmentName, attachmentUrl);
  }
  else if (previewImageUrl && inputPayload.url) {
    appendLinkPreviewToChatList(previewImageUrl, inputPayload.url, inputPayload.title);
  }
  if (!message && !attachmentName && !attachmentUrl && !inputPayload.url) return;

  const messageId = nextMessageId;
  nextMessageId += 1;

  const citations = inputPayload.citationContent?.citations ?? [];
  // Sort by smallest inline offset so source list order matches reading order.
  // without doing this, the first citation you encounter may be [3] instead of [1]
  const sortedCitations = [...citations].sort((a, b) => getCitationMinOffset(a) - getCitationMinOffset(b));
  const updatedMessage = updateMessageWithInlineCitation(message, sortedCitations, messageId);
  const citationSourcesSectionHTMLText = generateCitationSourcesSectionHTMLText(sortedCitations, messageId);
  // for aesthetics
  const citationLinkIcon = createSVGElement('/assets/symbols.svg#link', {
    'class': 'citation-link-icon slds-icon slds-icon_small slds-button_icon-brand  slds-m-right_xx-small slds-m-top_xxx-small',
    'aria-hidden': 'true',
  });
  let inboundMessageHTMLElem = generateInboundMessageHTMLElem(updatedMessage, citationSourcesSectionHTMLText);
  // the two clean up functions below are a result of DOM Purify's sanitizing behavior
  inboundMessageHTMLElem.querySelectorAll(".citation-link-icon-placeholder").forEach(element => {
    element.replaceWith(citationLinkIcon.cloneNode(true))
  })
  inboundMessageHTMLElem.querySelectorAll(".citation-source-link-label").forEach(element => {
    element.setAttribute("target", "_blank");
  })
  
  if (updatedMessage) {
    appendMessageToChatList(inboundMessageHTMLElem);
  }

  document.getElementById("eventLog").value = JSON.stringify(JSON.parse(payloadField.string), undefined, 4);
}

/** Returns the smallest citedLocationOffset for this citation (reading order); Infinity if none. */
function getCitationMinOffset(citation) {
  const meta = citation?.citedDetails?.inlineMetadata;
  if (!meta?.length) return Infinity;
  return Math.min(...meta.map(m => m.citedLocationOffset));
}

/**
 * We need to update the message with the inline citation text (example: [1]) since the schema does not account for it in the text
 * 
 * @param {String} message the message text to update
 * @param {Object} sortedCitations the citations object sorted by smallest inline offset
 * @param {Number} messageId the global message id for the current message
 * @returns {String} the updated message text
 */
function updateMessageWithInlineCitation(message, sortedCitations, messageId){
  let updatedMessage = message || '';
  if (sortedCitations?.length <= 0) { return updatedMessage; }
  let citationAnchors = [];

  // for each citation, extract the anchor for the inline citation
  sortedCitations.forEach((citation, citationIdx) => {
    const citedDetails = citation?.citedDetails ?? {};
    if (citedDetails.citedDetailsType === "InlineMetadata") {
      citedDetails.inlineMetadata.forEach(meta => {
        const oneBasedIndex = citationIdx + 1;
        citationAnchors.push({
          citedLocationOffset: meta.citedLocationOffset,
          inlineCitationLabel: `[${oneBasedIndex}]`, // this is the inline citation displayed in the relevant positions in the message
          inPageTarget: `#citation-source-${messageId}-${oneBasedIndex}`
        })
      })
    }
    })
    // Insert anchors from end to start so offsets remain valid
    citationAnchors.sort((a, b) => b.citedLocationOffset - a.citedLocationOffset);
    citationAnchors.forEach(anchor => {
    updatedMessage = updatedMessage.slice(0, anchor.citedLocationOffset) + 
    '<span class="citation-anchor">' +
      `<a href="${anchor.inPageTarget}" class="citation-inline-link">${anchor.inlineCitationLabel}</a>`+
    '</span>'
    + updatedMessage.slice(anchor.citedLocationOffset);
    })
  return updatedMessage;
}

/**
 * Generates the MTL text for the Sources section.
 * @param {Array} sortedCitations the citations object sorted by smallest inline offset
 * @param {Number} messageId the message id for the current message
 * @returns {String} the HTML string for the 'Sources' Section. This includes the section header and the list of citation sources.
 */
function generateCitationSourcesSectionHTMLText(sortedCitations, messageId){
  let citationSourcesSectionHTMLText = '';
  if (sortedCitations?.length <= 0) { return citationSourcesSectionHTMLText; }
  let citationSourcesHTMLTextList = [];

  // for each citation, we want to create a row in the 'Sources' Section
  sortedCitations.forEach((citation, citationIdx) => {
    const citedReference = citation?.citedReference ?? {};

    if (citedReference.citedReferenceType === 'Link') {
      citationSourcesHTMLTextList.push(generateCitationSourceHTMLText(citedReference.link, citedReference.recordId, citedReference.label, citationIdx, messageId));
    }
  })

    citationSourcesSectionHTMLText = `
    <div class="slds-m-top_large slds-m-bottom_small"> 
      <strong>Sources</strong>
      <div class="citation-sources-list">${citationSourcesHTMLTextList.join('')}</div>
    </div>
    `;
  return citationSourcesSectionHTMLText;
}

/**
 * Generates the HTML String for the Sources
 * each source is given an id citation-source-{messageId}-{index}. The message id tell us which chat message the citation is for
 * the index tells us which particular citation. This combination gives us a unique id
 * @param {Object} link The link object containing the url
 * @param {String} recordId The asssociated record Id
 * @param {*} label The UI text for the hyperlink. If not provided, we use the link itself
 * @param {*} citationIndex The citation index position for the current message
 * @param {*} messageId the current message id
 * @returns the html string for each source
 */
function generateCitationSourceHTMLText(link, recordId, label, citationIndex, messageId){
  const oneBasedIndex = citationIndex + 1;
  let text = `
  <div class="citation-source slds-grid  slds-m-vertical_xx-small slds-size_12-of-12"
    id="citation-source-${messageId}-${oneBasedIndex}">
    <span class="citation-index slds-col slds-size_1-of-12 slds-m-right_xx-small slds-text-align_right">
      <p>${oneBasedIndex}.</p>
    </span>
    <div class="citation-link slds-size_11-of-12 slds-col">
      <span class="slds-grid" style="justify-content: space-around;">
        <div class="citation-link-icon-container"><span class="citation-link-icon-placeholder"></span></div>
        <a class="citation-source-link-label slds-truncate slds-col slds-size_11-of-12" style="text-decoration: none; text-wrap: auto;" href="${link.url}" target="_blank">
        ${label ?? link.url ?? ''}
        </a>
      </span>
      <strong class="slds-m-left_x-small" style="display: ${recordId ? 'inline-block' : 'none'};">
      Record ID: &bull;${recordId}
      </strong>
     </div>
  </div>
  `
  return text;
}

function generateInboundMessageHTMLElem(message, citationSourcesHTML) {
  let now = new Date();
  let dateTime = now.toLocaleString();
  let html =
    '<li class="slds-chat-listitem slds-chat-listitem_inbound" style="white-space: normal;">' +
    '  <div class="slds-chat-message">' +
    '    <div class="slds-chat-message__body">' +
    '      <div class="slds-chat-message__text slds-chat-message__text_inbound">' +
    '        <div>' + parseMarkdown(message) +
    '        </div>' +
    '        <div style="white-space: normal;">' + citationSourcesHTML + '</div>' +
    '      </div>' +
    '      <div class="slds-chat-message__meta" aria-label="said ' + sfSubject + ' at ' + dateTime + '">' + sfSubject + ' • ' + dateTime + '</div>' +
    '    </div>' +
    '  </div>' +
    '</li>';

  return htmlToElem(html);
}

function appendAttachmentInboundMessageToChatList(fileName, fileUrl) {
  let attachmentInboundMessageHTMLElem = generateAttachmentForInboundMessageHTMLElem(fileName, fileUrl);

  appendMessageToChatList(attachmentInboundMessageHTMLElem);
}

function generateAttachmentForInboundMessageHTMLElem(fileName, fileUrl) {
  let now = new Date();
  let dateTime = now.toLocaleString();
  let html =
    '<li class="slds-chat-listitem slds-chat-listitem_inbound">' +
    '  <div class="slds-chat-message">' +
    '    <div class="slds-chat-message__body">' +
    '      <div class="slds-chat-message__file slds-chat-message__file_inbound">' +
    '        <div class="slds-file slds-has-title">' +
    '          <figure>' +
    '            <a href="' + fileUrl + '" class="slds-file__crop slds-file__crop_4-by-3" target="_blank">' +
    '              <span class="slds-assistive-text">Preview:</span>' +
    '              <img src="/slds/images/placeholder-img@16x9.jpg" alt="Attachment" />' +
    '            </a>' +
    '            <figcaption class="slds-file__title slds-file__title_card slds-file-has-actions">' +
    '              <div class="slds-media slds-media_small slds-media_center">' +
    '                <div class="slds-media__figure slds-line-height_reset">' +
    '                  <span class="slds-icon_container" title="file">' +
    '                    <svg class="slds-icon slds-icon_x-small" aria-hidden="true">' +
    '                      <use xlink:href="/slds/icons/doctype-sprite/svg/symbols.svg#attachment"></use>' +
    '                    </svg>' +
    '                    <span class="slds-assistive-text">file</span>' +
    '                  </span>' +
    '                </div>' +
    '                <div class="slds-media__body">' +
    '                  <span class="slds-file__text slds-truncate" title="' + fileName + '">' + fileName + '</span>' +
    '                </div>' +
    '              </div>' +
    '            </figcaption>' +
    '          </figure>' +
    '        </div>' +
    '      </div>' +
    '      <div class="slds-chat-message__meta" aria-label="said ' + sfSubject + ' at ' + dateTime + '">' + sfSubject + ' • ' + dateTime + '</div>' +
    '    </div>' +
    '  </div>' +
    '</li>';

  return htmlToElem(html);
}

function generateLinkPreviewForInboundMessageHTMLElem(previewImageUrl, url, title) {
  let now = new Date();
  let dateTime = now.toLocaleString();
  let html =
      '<li class="slds-chat-listitem slds-chat-listitem_inbound">' +
      '  <div class="slds-chat-message">' +
      '    <div class="slds-chat-message__body">' +
      '      <div class="slds-chat-message__text slds-chat-message__text_inbound">' +
      '           <a href="'+url+'"'+
      '               target="_blank" rel="noopener noreferrer" title={linkTitle}>'+
      '               <div className="chat-link-message__panel chat-link-message__panel_outbound">'+
      '                   <div>'+
      '                       <img'+
      '                           src="'+previewImageUrl+'"/>'+
      '                   </div>'+
      '                   <div'+
      '                   className="slds-chat-message__meta chat-link-message__content chat-link-message__content_outbound">'+
      '                   <span>'+title+'</span>'+
      '                   </br>'+
      '                   <span>'+url+'</span>'+
      '                   </div>'+
      '               </div>'+
      '           </a>'+
      '      </div>' +
      '      <div class="slds-chat-message__meta" aria-label="said ' + sfSubject + ' at ' + dateTime + '">' + sfSubject + ' • ' + dateTime + '</div>' +
      '   </div>' +
      '  </div>' +
      '</li>';

  return htmlToElem(html);
}

function appendLinkPreviewToChatList(previewImageUrl, url, title) {
  let linkPreviewInboundMessageHTMLElem = generateLinkPreviewForInboundMessageHTMLElem(
      previewImageUrl, url, title);

  appendMessageToChatList(linkPreviewInboundMessageHTMLElem);
}

function htmlToElem(html) {
  let temp = document.createElement('template');
  html = html.trim();
  const sanitized = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  temp.innerHTML = sanitized;
  return temp.content.firstChild;
}

function appendMessageToChatList(htmlElem) {
  chatList.appendChild(htmlElem);
  chatList.scrollTop = chatList.scrollHeight;
  reloadTypingIndicator();
  beep();
}

function getRoutingOwner() {
  // For Ott when routign owner is not part of UI it should always be Salesforce
  let routingOwner = "Salesforce";
  if (document.getElementById("routingOwner") && (document.getElementById("routingOwner").value !== null || document.getElementById("routingOwner").value !== undefined)) {
    routingOwner = document.getElementById("routingOwner").value;
  }
  console.log(`\n========= RoutingOwner:${routingOwner}`);
  return routingOwner;
}

function beep() {
  var bell = new Audio("data:audio/mp3;base64,//tQxAAAB+w7IBTBgAm3n6wDBPAAA4TKksSxLEszMzAwPFixYsWLAMDAwN3d3EIAAAABh4eHh4AAAAABh4eHh4AAAAABh4eHjwAAAABGHv+cAAP/bWIGPsQKLyQon+JlhZf/e79dPaf/7V8KInoBbjD//8BWaQhvJUfJWlSS3//9nT7PRbTg7jRJEXsSZH///9wQyLHmY45Bck5UhBYx1f///9ntTcCjJnbErm9ijqFSuML5d/lh4VEgG//vrKslSIVVAGJlv9QQCdhimdihLv/7UsQGgAq5f1m8loABfCZqfJm1eCikINa9nyesamKCT0nIonwwLGToJJJfrRb+s3CQikk96STGSSXOmuv//WNTHRNRbJaKX//pf//SCaDyS/8v8f2/r////qJMlkgIEAnplXEUBJAH9SSpZGgtUUONbD+XkFJpoakEx+NE5pQUyenu6H6ZcJkE8ByBhxPB3mR1IzJQ+cGEW86gpluroW0FahzkZx2hrbU7VU37bqZft/+g4XY8//s+Tf//rQAwInXAAACAO5D2XUmaTZbw3IrJ//tSxAoAjEl7SafSLcFwpmj0+cl4q6K0VIuklSMD6iIOxeSc63X6DdjZygITAY1KFrJNMfQfUma9zErIrUuZGymd10VqWoLal9INQCqZ+j31Ukn9f//zIVk8//mXO//////MQCAHHYBABd3KNuXGLwj0F7MYqdad1HlLRRdRNki+yCDerUzJ7JqIeTAHjYaWyb+xm3lAt06GpN3odSzEMaDfMAaYGaZ++v7f8uKT1rqV1HTwnUYaLr6/O86///1KDAAllUAAACBAJ+tV6v/flyb/+1LECICL9TNBrFKLwXamZ/GI0XjSI/UkkVqMVsV0zhxFlC0lqlUkbq6PWg2rcqiMQF5wIgRdOIpOzSzvUJYk7sapLqRQXVscTAiGIgUgksEfLV+v2X7///1i0Fb/1Fx8sv9ISABzoAxIujq2cMt77LyN0nPKagZOxYWis4mw/ropzMi390X9alkYOcC+BgQrHkmUjQRPvUgH+HhBVqLMhrZWcLwDwIn0pA1WAiAJqX+336vb/+pMV4qf/KzZRfVk6jANcwQBEBDv53K2t2IqVf/7UsQHgAv9NTssUovBbKZnKZnReElosy4o0rqcu0s6w1S3OIOw3mQ/QNUtNnOFcfgSii/JpZk6TvOE863lYQIYKMjVFdmsi7ZmaALAxplwBdQC0w3Qe3t6vb0v/6khzx5f/y7zrgAHBAAAAAtmT91vHViHRgENIgU2ZmMkETcl0eth8j3M6ZSHPUr+lv1D7HNA5UBYcVUm1ZSdlOsNTExOMYN2VmT9EogQDCjFULfgptJdv1N6vf0f/9AWk1/+c50IgARoQAECRkSv9pd3KOfG//tSxAgAC60TN4yqi4F5ImZtltFwAA2WQE9mPY4hC8SkqwxDsVM8L53683tOGZACLgYlcIMoJJJqyw3WEQ5donD71tsk1SZgmFnhoGIC58FvJWZ2fq+vrfzn/9aAyo9jPL1gEABwABAaPTXvsX+SNkwzEBSY0YuapIrUkLqPXQFeS/I3/PvrnDxsK8Bg3YWkl5aS6lzh5S5mCQcQ8pmhQLdlqtO6mSKQNR42SNAfjAl5KyL/v53z3p//2WM4SSPRXQkADGBgAQJkU9nVzu68uXP/+1LECABKkRM3jJ6LgVEiZrGT0XAN5woYcsccdHwLHdYoBsWOyCO/pze+aEeeAGIhvZ59XW3cc0PGWVqLev2e1M1Eoj0RoQ1QLATJaref+/X7f/6xnkE+WrAIAMQEEBA+N/meGcheUhPAZUvGhUxVzA5uriAGxc1RK/53QqYuD5CFgJuJlSPrKZ5tIL8B2jtyt9pzbOhwieI8EF0CRcuJqX639Xn///1KL5aR660FABOgMAACAMQuYY75lYgUcKB0RUkNc6aKACzuriAZUdJ1Dv/7UsQRgAmVEzmsHouBG6JntYVNcf+36JYLwNmxJTZn+v1BEAXput/7+pIiRUL4EEoKOzRNvr/9vX//dIf2SHQA5oowgBQKC9dxw3rLNpA3WiG5LMdpOHh/VwmBbQVBsqD/6c79k1AOCONv6/UJEPCFf+v6h/RcQqDLnn/X/7er/+tE1NlFFgA21NYgAwAv0ycTQTnysEMHwqFfWpAA1rKbCxKPkqkvpzfrzEMcD3jV9b638vDYOJL//7OkCQA+mf+3/f1//6BQPsggEpAAIAPn//tSxCWACHUTP6geS4k6mmXhpVFw3LK5VjbBgaSOuBdYauaTG0cLb23BFhU459ed2nUSgTwDAYQIfbXvfmIIQ4UAlg0MW9eZb2cUMsdQENQDWonUl/ntMTf9LPqVBALDDAAgeHMNbrV4rBwyTAbZ5x4fe5xCBU+4MFlC7NmEf1695ZplAEBMVqXkdJBkDBJVR0JlRwugieb8z3qSK5Oj8EPYMTHVL+o96vPf9aAgF0jAEM565nZvwhXoxSBphAS8XUkUlzg6fU4/FqQQ2XIlTrr/+1LEOgBJ+OcvLSqLgS+YJemZUTAPpdCddZOhgAYSP9XmYJDQ2spl233o78jTpDAH5AJNC+Cep25R//iqAZBAAJwOvZs/uglDigwDExBboyRLmvngHP0cFA6CZZTxj6dfnSuYGYDwwzCavWkpumHwhQ2OtlI+t5x76y4VyKAC0ALrCJmiaHnH9fm3/rLAuSsIAICRWMMbkdwo4UQKA9ZYS3X3G0YN/jUMsmidYuBDtnNJrTLP3UkK+JKbUmVtbqDUBMjp1X//OOeE7AxIfb9T///7UsRKAAnw6SrNnouBJyImqYXRctv//51SagCSAgAANdlufP+q/afQXZHLIuMRJGouUB36OUBkAYx4lbGmiknr+WzNIQFHtv6+ssBI8LiY2S/ed2qnThFQDXII1JJIv+f2RD/1AgNpIGHkn7fbdybltRCWHgTHyxerbGmKT+ePI2GL9plBz7Q6qPnC2tEOoLiMXXW63WyalmAISQXIJg3f97PbYomQ6QI5wGsJeR/Wf9Xn6gPVAAAAK3TWqTupe1BCEkomdTPWTDqS1LdQlNPz//tSxFsASUTTKu0ei4E4nOVptdFwMbVCoYGZgWqTrSMlPX3lgtzQUsPL/19zQNXA4UDOFC/qzLa7IGQ3QgToNtSwtS/Ovoi3/WKA/Ho4ZD9/WG60scUQNAHKDRNmSRdaDjf9U6WpD0TqZPIPW5mzMl8saAvSAmSK0TNp1NBtEEwIbyUN/7t9SimBSGCI2aJ8ltoqAAaTMIAAAstnrLH5RAzZwsePsJbQSyB7OZUAg3dInGIAgeQPDJM3le/yw1EcwbTdHVdVRZCKEc1yoz/ad/T/+1LEbIBKLNMm7TargSOYZemKUTDQJsAiCCMWSCbP6z3iP/lhQGlbECc893uG8ZG2wzQDmSDEyki66z4/q6mOlpRWE+KUmpqkDhumgn841yOGQTuouGBcOzpppg0Aijma/+r+x8TqDEZ5+jy3/XUQBmLDgAAC/l+M571QzMNJ9kepmxGPVdR0Oq+uMrMoDEE2lHN4c9Lf/aWC1NhnxGpeW8yZkzimsmLJBwsjy7/ar9JEmgHJAU5FV/1N6vPAAExWKAYQox3HLCneVZpU7A4o4v/7UsR9AEmw0ylNHouBJ5hmKYlRMh5cWpNSmODxvyyejNHi65okuy02X/OFpbEVG2zqmZ1jJ0mzIEAoHBimbv+1bX6SyOApSAlKLqXZ4r/1KgABorGAAAAi+I6pd/TOojiDGp2ijXTY66bmIAniqjzGpBBuVmtdvtG7pn0y0s1HwNJM1ZIoGzsedOs4EUA5zGbt9qO9nnR+CHYGWjqv1P6/P/9Y2aDAymalLf19SXV0MAG6IwD7O1U6RydqM7jqJY3uk61oIJum31nrHyEVmRe0//tSxI8AScznK00ui4E7GGUpmlEw1snWYAmKDmFAvf9X9ZQArABEUN0OnykAzIoAAAWHJYVsre7DHxYMS2jLLXoJqkWWpIwDmsttit1hjNDIyNUNmVdX5HlpKP5ikks4U6SS5vc0DLQLKBnHX9el16nIoALKBGcJM0dvn/11Gv16iwohAFCWAbFbWERd9NYwEuOrD0+h4ksapdQ6uz1sdTUGwXy6tlqdSK2VX3kqenzQdz7LUgztqMQIlQcdHwUG+vO+paJ8qhZUFWpLnn+t/V7/+1LEngJKVOcnTS6LgREYZWmKUTB//rUA0IgAABrkJR2K25x92arhBPp2Y4n3LM/7zfaric7/75Q38WJxXO5Zt7u5i9erjXWs+UkFupRyqpEyWoshNmJRcnWf17PapkTIgIBMEC7UiSJrb4tyVWkOIhQZAcxTL8L08zQSAhaqbRMykdx2OOTgUv2zOqvYMFx1s3dvXh3vr5Kn1qMyROpOmbrMEEDqFApgUPgoHIeVG/era60ThGgVvgSol5H+3/Pf6FdaANAKAAAZN8Nyy1hTwf/7UsSwgkrE5yLtNouBRZzkXbbRcJHmcmECJ0CUL9WcsL+OFd1ruud/ed/TNpNUmNVPUt1UmfVkqW1njE3NluYGKaCJ5bOxuGAQcrGfLKv3vtdmOD+EHkMUnBZu7qP/72//6hNGAy0Z58vxn4YXGNBhTIB9mYggUzBGjxvMpKhWbrEFTdA6gkipbOeWtBBltI0bZw1LBstlpmTMlUjRMgHGgcqGutL6kp3brUOsBbuA1PJxM5kNhATdPoR//b/rAJEYAAAZI7UtWLtylaeX6AMo//tSxLqCSuDDIOzuiYFSnORppdFwDRYhDliCk8ik1ahm9LefibjQpqMT5rUiYoKoKvmJCmF1GZytaDqZBGssBJUI+RIm6P9Wv0C+AhuCn8qJryHodoq6hYaEAT+0OG5jeETbM9hgunojCo5ZPctWNcuvRYxt8z79qZT3vWud1imclwvJttZzhCqPnXP1GZ4vMcN70ygBFQCIYQwvP9WrX0jxWDBIVVEsfdQz1/Vy9YTAAACApHJJOW5yfWYJDSxxMgsbGSSKBirYcrMmpqj6gXD/+1LEwoJLYMEg7O6JgXAYY92qUTA4kJRNChZMyZd7UZGD1PsV1poIIFZ3dBJnNAs8DmAzhPL766fspIxJoBDAEY4qu31Pq/P+3rRo/f6xNGBDevK70xdj0MJWmN2eYEJmwNZtflre4VvL8ecyzuMHl+G939vSN2dV01uoahLrqUdQd00Zs60bmIESYOQj4JxH/XvukYkOApWAlOLqTaCfi3/V/0IAASITAAAAiJGpqvejcMNSVqBEI54dWpG7FvHDD834/Ozrn671rl/DG1TUFP/7UsTFAkqIwyDtVomBXJhj6Z3RMFEzSZNlKtG4VkTzrfPmaTrUZ1qLIQqxBpkXD366t/RJQJ4A1UdVtbslf9a//9ZuMAxFkURl9LlSr3DiQB5HjbrDIarnt778h3wq6184totXVdarW96Vtv4buNxVkbV3W6S3QqJsCi0Cwch5BWe9dD3fpkMAjeAkwL6Dt6/68/877f9/2f/+9NUB0RgAAADFyKM083NSWIu0PBgdkg0oeUjU2Rc6dGaTv1OsTqO+cWXDqFRxk6Fdo3DRVRku//tSxM0CS3DnHm02i4FYmGPdndEwgpJB0EVIUDcLJQWTjrRV/r6+ZlwBdUClgroIT2KSAv3OWqM0AgBLqadwnI2p5C0lrnNVNbgXxLiuMoHN8fGcbwPp5H3aBvetzy4zCZHUPxUSdRxNlIEys3NjVNWZAQEA40Psppft/1Hg1UDGxbZ2+2pVfPf6k///1gEImAAAGcEEwHGW25bDTTA4CYKWBqgRBgkZoumxVd2UO/9VYf1nUa0buvo1UXI4hHSmhcroMgamTHaykDRUHvGJs6//+1LE0gJLPMMfTW6JgWgdI5mn0XDXq/RMi6A9CCm0rNGUW2r+q+v/1DBCoD01UEPVJqvEHWe8EcA1YCw5hJmpuamzHDUfB76rihC8tE+dXW+pSVBB0iwN4xda1vZmU04ipZQBM4HGEwW/qtt9cogm3BEtNkej0/bTANAIAAAaEilm/D/U1edVGHEhD2Mn9pURmt63rLT+61l3W9d4rfDtSvGIrTbHK6FnopkItlKUdSllFNJSJNqmgC4QFFgzhSX3rSr26aiVCVkNtOLZ6ck/bf/7UsTWA0rIwx7tVomBWpzjzafRcGrUyz9//6p/p+tgwHDTQdA0apZVAb/p1GHRH0hJEDPLR8rXt8+Fd5v/x1zrLJ+d5XrVtF2RVWktnOjedHmR06al01Y2OtSNQHjQcpGocW++vs3nCPApLAsbLgeiws+khd+rb8aqz/+j1/UqAESYAAAawC7MSwp+Q2xxJkRxQPWwEEyYZAxZaceE2pNVYQiHZUmhQUs72atayPIRTaaLVE4ugp6joNUYe6ZE4z7b1V1dRmBBCCz80eq4dXTb//tSxN2CStzDHO1WiYFAGGPpitEwt8cj/////pMgYAh668jxneUDEA4SDNJyhMrl2p21/cfyj+u4d1zDulKYF7qlxzZRsiletJBlj7JZB0ETA3opFVNmYwqKYIFIbGQ81bvXrrtU6J8Migxieeeoem1LLr7P6tepf/1+WRUAASIVAAAFB4tFZyknY4/VCLEDYFVkis3+X8/qxLdXHD/1+mHVK3b1Px0zdB6boopoOL8tO6U1SY0NHZCfQoG4EAILFx1l3+9b/dZeAoMBaEavb/P/+1LE6AJMQMMa7WaJgYCYI02t0TC36W9vb/06Bc4BlbTYahmTTcUW+LCiTQemrwQ3PXcpvDWor+f/3XebZjf1zCmsGxiaGyCBo9C8bultQVSPvPmljYCAIKIh9l9L1VrV7PlIElwKKke9bc99ot2d0WWv/7lIp0aPlQAAYiNAAAAI0D09nK1KYHRyAORzoin1Fa1XXO4aeftJlzvf/TPKGxN2MbS1InTjoLWt6A/m7NOE8fVoGZwvqas4DQ0HHHU3bfV691LLARXCcl0eynppdP/7UsTkgksQwxztUomBf5gjXa3RMGf7ft0/q9BIDANmuy+dSrWibVmrA3U7EaWfFM8OVM8dv5+ua13/2yuM0+7UVv1UTPWtCuP5bQQnkTQ6tE2Lijdb1mAJog9wuFZOrZBde/UswBNcFrCblV9Vy/Z/sOHv9ujv+t3rAALRlQAAAwgV/ndn5V8+0ASAhaickzgzV3K7Yt6uPDds61/f1k4mV2zjVjC0FpJrWs0edOD+S6KKzSpmRP3pG6qAFRAsghiSf6t+roAhgDuOZrq2W/7f//tSxOYCS2jBHUxuiYF3GCNZrNEw/7/6QIhMBwvR2eaFdlMelDOTCDD4hNiLUvau+c3FsN8u8/+e2eKfVoZfkbqNkmVWswQolkk6lLMS8cTPlQvpon6nPBfMKYHwc/Q/q3YPSBmj52jb/etv6f50Vd+v/9AAUKoAABgg9umt65GGbJBDEw8SliEr7j3euYSD+Y6v8w1trsvxpq1LmpbIoLdTGrHDIlRipLYmDxcNjJEiLFA1Ny486CeQuScNWWtv0nV9EEIwe02chalXErtn3f7/+1LE54JLvMEdTO6JgXiYI12d0TCa7/766PqSYkwBYVS53a+8oy56FQB6OJIVrQzIp38f5fd/PWPd4/dqKzRTuXdZpJszUHNPUPSLonJqVnMFLVqsUwadFLmZo39rbdIxBrkFopO1P6f2OZ7We33fpTUAxCgAAAi+RIiNWSUkTfl1DBrOhDEo5BR4583unkl/8O6/9bUzk2/5nhVQdFFToudSUNpFJGYscNDhPGx5EwNHUmBQOCwsjy6pf6/0VqOhJCLCq0Z73m6vV858l+i1ef/7UsTngktIwR1NZmmBbpgjaZ3NMCXRcy1YolABZ7IXYmb9ufbwWAiDGAQgGNKTKc5Usu06kHTnROhifLJdJ5JzA+pNknTTTWkPobSZpN0EzjHTZKzNpCAgUmPtkr7r1f50GmxG6DdbKlUI9un9uimKdCP+K9IB1KoAAB0AUKm86aXzUMMFAFQOKLdnrFvDuOWcK3vLW/5h7ly25PS+itso2TWtKguiaEoS6mmSy+buaF42M0S8jWcBpQc46X0ultW/1smCTg40PvdV+zzFMZXg//tSxOqCTHzBGu1qaYFWGCNdnc0wIAGoSkJbaz7UkTnDGgOUJFwFMtF9kVLlyq6fURAly0PBsTxdUmmu7JH00jaJYSRoeMy+oorIuX0C+RAuHiznAnCcQf//9xyQvNwyA0t06+oAmEAAdGqoK28qovpWhhwoC4j1s2DP7c7zmHcpXl++4f3PjQpZFKeXSqnUZqRunTsyA+D61rtd2ZaCKCeXAKuBaA6DZF2Za0V7q63WkDegPUZKKIHLSupKcu5FbrqcfoSlXuuYoy0/xl7dyh7/+1LE64JMdMEa7O6JgXEYI12qTTAjWAIAEfFEXspvlkfmZUpMXFlP2afWVjOxXd6prXe8/+uzajGX3+oHEUFIP2Tcfkj70ymkikXC6VTh9ZjWwzYXELCvqv/1pBBA3pxguow1d6+2V+7bz6/rAYwqAAAYwgiQ7WUYpbbFEaSxRPOpncct5d+3WxfLDuHcamfMGZapY7f7WdJtSFR+ZpjcRZ1plw1J02TMT5DC4TRYedBN4XaWEP61re71KWcCNBYhZgvKJX6bGCmlvdsL8xijff/7UsTpggr0wRzsbkmBTZfkKYpFMC3uCXq8XBip4AgA2I2mxivXo60UYKFHT2Bl6z1W/j3De4Hx3a13n9xbvVprdSllcyNjd0mTW62UL4tHnQJ40L6J4qoIlwiRqWs6ErKazW9V/b+oIWHZ6j5h/r0+z7tFAADBE0AAA6RigO3K70ilDftSClBwg2ryNyzCzn8xdaRn3Hn/rml0Qfh/38nQdk0VN3cfipWkYHjZM8UiGFVZoX06jMEEhd5TRbTq9WtXUDVAzBscsuryqLSFbRWS//tSxPICDWC/Fs1qaYFkF+OpjcUwrVU+m3f/10W9HXS6FUEiBOB751+/qtul0I4B6qu9Lc+Z53e4y3DH93N/3jJtWbX3LaVTOi1jqnWUiQdUvHFmxXRW5nNzSzjwFMpoq/9PZS8Y4LiP0fZ9cp7N+r+tAVCaAAAcY+ixBdm0/Eluv8WSF0tOK9TY37Pdbpu17+P5599ptJcw1KtsiaKMEkUmQrc4SLtOk6dRLqZMn0SmsvVmQJQGlFk3dlI9df2W0T2FFd/NpUlF96t059vWypD/+1LE7gINOL8Y7WZpgWOYI6mdSTDe9ki17Lenx6GVuhE5tonLpfZvwhZozqcEo5d7PCeub3Uk1TDn97rvuVYfa/GLddaZcMGMXc3NTRBMvDwyRogimhLJjRNzY2rOBPCaY3SZ/26/WGjh2Vant91dFm7pS//s3P/1+hUAAeM3gEACe+s6LX4xjTRRaoWRnOFNNpr2VTLdm/Dd+tjc7lnlt0Yb38c1BLsk5uqzskmmmLWnKKz5uXycPQ0RJ5JGeoAzBSGCX/f96wFcgupVxmxwm//7UsTqgk0EvxlM7kmBRpfjXazBMHzv//t///HlpUcAQAfBUMS6pbjccl0XChAD6tQo5Tr+Xrld/qu8sMe//G6RynlFaQylJI3TYyO3QdN3Kq1ublVE2MS0cOmxfOPdhxBphQS/1f6KwkkTl5oDqCqEsRQla/0931/Vp4qqAIALkHV4DQAbQ1a5ZvT3JO6xCkBHJoxOLOIus8NFSRmy25AyIl8rl86R7M7KWjp3My6PFziKCRkdNzhubqMii3DuLylf//xCjr7ZuLkbnun/VrFw//tSxOuCTPjBGO1uSYFyGCNdnUkwGIugEAGtliQJrMniNSbp2vAUAHja3orTWK39yuQru993zLfGzSLVD2963oo05iYIn0BujRQLh1zdJjMmB3pF1zinnQjpBXZtlqXff9YxoZUyZWw8NJKgJt1JZ2s8yn+n82lffaYn3ttDlQAGszfAYAFhK+lvbvNyB5SGoAUIg5gyB02XUaqWz+ogxVYzIkfKjJmk3YyTTTbH8oprpFR4mGh0+s8fJAs1goRO02///kwSOL5sAOQcWpWKnwf/+1LE5wILrMEdTWmpgX8X42mdQTAlIr2n7lOVocZKIkJuAzkryvn33KdrnOP8DtE4iFa535c6ptRspkBrLDZayCXSUHsQjUeJIkoSxk+44QhzNFv//aHwRTaLJpKQcwcuREyUhprq//X//qen/0oAUAoBABxwqWpfSETF2UQ9TgwCBZityF1ssO/hye1Uzwy5+9MKy+lpKDGo/Ug6Cbbj6ik1ZUbk4k0SySI8CkRlIpAFwCsT12Vet066/dQBwNykFRqT1oWELAdW4JoaXYiyRf/7UsTmAApwwSOswamBp5fjHa3JMD1dXh907mzjLKFqfJAgU5EqCgACqv9S3MbeFHFiUgHVRmmb1oNKGZHEPJ7rMySLhk9NqboUlucJ/YmCZD3PnIXUpFRwtKuI42v/t/1BiQ6itdmuAACDE4AgA/qxXrg15bbjsPteBowF61/Qdfr53c7F9+7u+du9/mmsS6EwRAEWqoJoLMkzqSZpNVkapBJj5oiUSKmhaJ8xMThA3nAawsBgf7I3pdr9QiQwLCLWXVkmmGDLHXfsX2N+m5uv//tSxOUCScjBIUxRqYF1muOppbVw6HYoxgUHs6gFbaQ501d7XNGYzojG3pKtyxy/n3LOrn+e+b4+djmNJR5qQPbJrrQoFbvmjpIrJQnKRPl92WgFuBEJiS1aX16n8YwoOZacDQSfNP3V27HuVdX+zxbvr6/9FYjQCAA0MaTiNd9aLKHFmiC89DnFk+Ot9w323+WX5493txbu5fFYrUROGrG84i6tMnp3UPQ8swH40PqMElp1wb4RjimrtWnqeqz5PFZ2ogweSIRl5lozd/Vap/X/+1LE7QAN1L8W7e2pgRiX5OmGtTL3um+r6yUqOARANOCO4x2/ZuU11khGhcye/O7le1vLXKmHOa/32s0szIaeUsg8yPoNUtNR03VlZBJp4kh7qPmpRMkNYEePG1Xq//FmNtQpGvtEg3Tcp0IMsu3elSJVPAEAGtKiTbiN6W2IWv4q2AcqlA1MS6mySCRc06DNWL0c8miLsiWGRd00E1pTqZmQ8iU+mTyjUvGBfIKQYwRWpaSwgRpmaPur7fxKyRSOnQqxJa5F7/Q59GvT6fsoqf/7UsTwgk18vxlNagmBdhgjHZ01MP+Xb7NIACeNPAMAEYBf7f5T0/Xo3GEYgHg2+FbGnWgoQC9if61gBiqIYwcbUlO6HbMidRJEpPWSBoVHj5OMSSNEzhP1iSimZo9mr//Ee6taCndFnPmGAm2jr///12f6v/qVAMwuAgAYUMMtyyX1qecg4ZacMA/dJR1cMN5brd3b5jv+7fud+M3bnpeyK3RPHki6Uz6ckR7lIwMx0JpJj8XhwGm4kgazq26ev/3EeQ8UeAqXpVXVQv6d2ivo//tSxOmCDADBGGzlqYFaF+OpnTUw/99uj0k5E8EyAd+sPwRLLVrcmaaMKmkFOml5TT3xQ1S2P3Px0J0jqs1PP5ytRk6nOkJFNRfMTg8zCtQ9yooE/UDANy00m1aWt7rpKcTUV7PR3TRTMU9ITW2pIt7rv/+39aoEB6c3wmgATZB+FaW/U+lg4KXSWPoJLSQUxlUgit+RYtIk6ak2U0E1sk5vc8zGaJ9GmWHi8YIEkUiUUdSHZw/Gl//V6l3QF9aj4aaxI17Hi7NjKIUAEgcAgAH/+1LE7AAMlMEY7M4JgXKa46mkNXBsW0cCNWqWxB7NiSIDw0sF1M+6aaajRAyTnalMMaW7rL70XUeqWaJVJOfSdi0pk4wNzArJUkSMXDPhMgyGDvX/ar1pDQN1QNKJGRCVa8MC3Q303fL8WoXSzZsZ2G5Hb10EBqYlCkQAX4/1e7VvfbiyZQnOXXsL9XLHCxT5Zar58/uoIhU9laoqVBykmy0VIOrYt1jtKJDKTEoUjU1QHqacd4rHK16ndnVoVsYNCIG5aSw0gOLsY6jYjpWAJv/7UsTpAgvUvxrsaamBchrjqZS1cE0AgA5olrjmxeUZU8thAqLAZaH7E/lzesc6DX1Mv5/M33s4V8Ju6ztUbnVoKaggfZLKJmo3MDMaiifTVUsDeLUyZnZS+tlvoWQUIZ2pPloAQFB7QqJur3dSMV8c5v73f29yqQAHEZXBZAAe3DlUzU3lOOqMRMQKqwWCRks6vuZH/gIosQ95mZ/WwyCKNSS1rYpnycTFEgQiUH5EmaYRJnb/+v4sihVZamWyToqoKd01mqjHfvTx7///r1/+//tSxOkACojBIUzRqYGVmCMdmbUwiFGlg2gC4EbdXLG3W1SuKV9SYRxo1K4lke8ZUXhEYVYoOS2HIlJDIiuTO7cqXoFqJxB5UP8z7wVGb6/6rpltfzExEC4LdTzL+KuGJ6FtEJxgecABdoxI6AaOn//2/0oABbWlCkgDEh7Z/VfHl+TlQQOLYXZrbiYKTyMWW9quAVHchY4pkKjjlqNV7GBLrSSQTNC4SpfNCiOQ3RKlLTJQUzNe/Uu76KDu8vCsdspJBBWggt1KdBF2Wy1MnOr/+1LE6gALRMEjTOGpkZOX4x2tNTArY6mXbQhdF2QQG9rVLaAKiZnPVjuOc8voaXaVa62QMJq6qiXr/0NA8AVQeTJVsP5Ke1MVJukbrsPQzJRApksVqSL5Lk3UIQhLX/Y1c1WZma2c2SE3FFOpc0dQEkJ6ItIZ/U+UEt5Sz24ABvNXw4wDcMZhjS1gxakzAmYtmjqTTSRUXloI78pkVI4ny4gTBrln0U0x6y5V3HhAeRjEbiLIB+c76Awn/Wrv0mMHo5aARGRApKPqU2s8Ibb0Y//7UsToggsw6x1MGauBeJwjqZQtcNiGTgWQDnqRgkz/1N6kzakCIEAf0oRGltnWWg4vnoGgPOMD0tpxjXS6D6jB11OUEyWHukShwehgS6V0A7DYpLqXa1traxdRWu6luYLZUzOJeMB45gMLu0ccrmvRf+76v+sIDmW1U2gCAbi0eec/h+MZJwTpIjgFcfdxRzvPeB4Y5ZASXchtjbL3u+viNv6iF32ytaRfOcB+32/yzDUaqZ1v73mWNuNnNYWIdZhkrdI+q3nv4G4zk4MCwxPN//tSxOqADLkDIUwlq5mAGaTphLVzS/76/9UUnEArlJQhMG3AzSNiecO4ILo4wcZmAEYZOSz58wAxhxkr5T5/WotizFR91niOayoSSYTTj1DfjF40xH/9PhOLbwfiXhiEoh76NE4iqhdyrJZZ0Dij1qKPWhUpTQAH9inFjAQilEPSyV85bnkyg7+SMSXV7cuWD/Ia2BmSCUEX77G5GJ3VNcerdazEGEofGrJLo/iuev/9jDlxb4hu0pCTX03t1c3bdV4+046KoosegGWf//0FQif/+1LE5YIKaMEjR81JgYMbI2mUNXAG0AYIMUlN2YsW+YJ7h7U8OPcwPRoxBOeh1tXyGZjHDYVztV3UjuktaTkkSJkxcHeSxUZjuJcl7Q+jevfVrWkYuyRhTaTBbTBbXmM0dlXUeCAVB94XnmiQkqgekQ+tG3/6f3UKAAWlpQpIALQ3RldHm8RoB2iSeC89Jkt4GBxaV24OF2HyKLITbUp56zZe4wPw+yMZHShUm2Q5NYw9+SQmrd/z1Tv9rHZ/EIhon6142lT5Q9tByR1W1DXGhv/7UMTpgEw40yVMGeuZZ5zkqPMtcltEgQG+ifLaAHvF0O/MVN5apXZIyIrZqaClQgP1xcVe5I9tWi5HMR362TDW0xPrH1FG2GkDSQJoWky9woB2fp3/nl63Nz3Mio8+2zX2xjn/c3WsnWVKBezDQFe/0/22//o/TQAFqqXLbACtc/LKbCfwv0aLgDKXDM8yCV00rp00kVJk6T6ZOqNk6kUFMgg2plJLQkgUytjMuF5AjFiY9Ww+Gy1v2ZSeg1lLaiMwg80pk8Mktx2PXMbpG57/+1LE6QILDN0hTBlrgZgcI2mUNXBM/D+RSGlgiADTycKGKeit/fiyZQk3TI+2t/U9JXnt+DB0SRJvrLbYNrGfTcls17M0wpWWe7BAeMqvxjAymjG//nOa2/zA/xu2NJJY/3bGs6vEk8N7jf3AOY4WucajMt7VMygABaElE0gCEbizWN/LPmL7j1qOB+3usycHEHb/8tHUpQ9XrLptU+o45/L5Bm5oiMtA4PIzNHWeE+CkLineik01NFrdNKtAyWThamR43UurTTqUp6CnbT2RSf/7UsTngAtIzSFHoWuZgZzjqZMtcIy33hni7yEQkcGAABGoRRSvLb2qKKodVbLouKgxFlKPbn4QcZPAWJoo5A6Tvek6O4caFqzklA+GZ1+yQ/hZky6XMq2MzVj4q2tUNxoZFXeyHVcOu6h8uv4q6mppJ7udi9NhcbUABSolzGgDe+ciYpbVj8KJ2SLiBSixqn2nfYwbA5eQuVCWa9zUQ03j6zqFjOfqCtzTKNtYIkeM45+Srdet/jH/xG28tjN7axtdqnw8fefi87wSmR4sLQFN//tSxOeADHj/GuwZa4FPF+Olh50wAQFuNpzONkDdDyTF6/Z/eUEQD0Ou4lQy+Qc7uXTKSa4ulR6/g7Uvm8oOrJ2gqhNt2JtFRlUP+IttH+/t59tcry+6UhrZffbNamrbt+6ZbqwkrBgQoY4t/1/Yd+XIQxe2NQIgGU2nNGkgbZqfs1OVsd6rNTtAZk5zc6HpvVTkBCQvGfNT5ZxkUyptqjlDazT82ROQfqw4k62uSZNdzu+IinOipmqb8R97m1uq5mWaPtYor0nb3l0m3AysvzD/+1LE6YAL2SMnrA0L4ZIbo12jLXA6xtB+gAMlJMaTQOeySyiFJLseYXmygeVZvND0uvdOktBa5mtIcfetXFMi8XelaigjFREntrQ9rwPBA4mJRIJ2mZUCBxqhp88CoUBU8qCYu8MiAMCglCqRouErXQW2tKJcKf/Z2fWqAQqpJYIgABAB0pZsex910iSSQXoZxDi4+7tCmpCRQRCNiSEchdXuKykKSceDQSFocQsCT5A2X5jWO3SEscs1oWM/2mutLkhitTEEqzt0C1gzXWG/0//7UsTlgApYjyunrQlpgp9ktZGtddIm192E/x730Fc1JJHJm0kBDOolTRG+0AxYS6abu7fxLK4q2vZcQ3W/l1puVddNh8QaH7pAkoGBxE+bXLRWZ/LridzJc+638tq5OLZSu9UZhXuGLDIVxAz136178r9+VzTZeAAGOnoIsFpRputIkAwzrU9qdsWatqConaACAFHVm8LaDuceJqRMr0DVx3I77oZFPXINIHdsp1bByDJuutjye5tEiPeeqrl6kdpsMaWMlSBh6XBFaiTTxHJJ//tSxOmAC+j/JawNa6mHkiNppqEod/sLNAG9S6dDAwNpExIkgFfYrclNSdp5dlWVfmhJSC8NwZhMXZSlEqnkbL0nJpbkkFDF15kVteaQJA3CT5FGRF1NTc1FVUTGNi5leBnPS1a29vazV1j0rniC5uImKj3ru+uW3YYcwSv2WiW0pLbJK2kgEv7emnCwpmQlHdxbM06ahUO9WSOg2lrKh4fczfl4OUbktTMOmUTAo4P9wYBXluYAbN9Pz3TLbe6v7/5Oyv+xVf/K64d9bW0y5PT/+1LE5oALtN0fR40LqXeYZzSVrTcAGnqcqBzHNSjWqa/zClfVXlUGAjYYeLVQW3CWoOas8OErlZVf357lirpOoaESda3B47Usp8utdsxMvjZdVzdw2n+xzmOPQ+aZuc1zOLtradUcoTUsft2q3wDFJN/hO33bqwYO5LVSJAOqYCs2M6O5W7UX7iQC2XSqJ6a6BxSndqlrjPph8wzRDfT1czdIIxhe5WSe74hAwx1UbryWlkW+ORZWeN4lWmau2+Jr/q4RdWsriwQGg6cG44ZuWP/7UsTmgAvA4SOsDQupgifj6YGhfUiCALD4KF+kKEgAHyPAz+SDWGFWjbs7dkGsZni59gCqTerZEZjy4oNY0goYdRqHolw1Cw4m0osKxVSUMHj263MqK9FeXXqG0jupHdPXzb96QNfuY4hbTSY957555jaqqmWv3bgbVQCO3IVJAAN2GVwzGJnDli3TK13hpN0Nc0tPYQ7Iz9fI/tDXp2bKJGSg5IjlBdqHiMULIeNGLoBoiM3FfLTVw1ylTLLet9oyVTfy08XVLX3NshMlPJ+E//tSxOUACjyRO6MZCXmIo+Olka112cl9YAxaew5oi82gAEAxFouFEkA8E5q9cvV7GMlASTZJDXbXmMzyXL6Y07ohSveQhjp0xhCMYVrHPaoX/iNBtDz3Kuf/eAfSIy6jio3o5F1zJu0Pv+/W7YSNaEkOUF0AoCs1K6iBszF6G/n2m1yUtQpA9LEEJ3u5QYk0enULHFInmQ6V9Tr7JTlu9ecKqWt0hKT3mMy39sza2vr+L+f55zvj/7227dnny7Krsz/O9V8ztV3ErCEmphlxBZL/+1LE6QAL1QEfTBkLoYQqY6mRoX2pQABUkqJNMHulEJbjcv4508kZrZMQ6oTh0LpOOU+Th5H7DedMm5lHFFUPEHGRj1eQNVrnMVkYhqKY2xLs6izaM6UZ7nFnIzyuyq1U3RbbeWymOlJCWGVBV4uUFP61Awltt1ttgOO/dBZvW6srzgx3+sccZjftFTRqynWTG3kItLbGqiqaK7KdYEIVskfnn1bw80Eh1+vB7xfqk7fda1fbaTdVxdRxd1cdVUJdqw4VAaCRcSIUFWEViWVUKv/7UsTnAAw5Ax1MGQupTBIkdYMVLejy39f/rAgQ0fpoOcehD3Vq0uxqW66WWgoCxDoRD1gSg8m1L8l4fgo0NAMQa1xFPCPcLTSeq4FcXjSIi4q51l34WPiKhpvjj7u91up+yIm98p6vZPjqEieiHhUy0VDrTQ9C7Oy/+z1qCbTccjTiRRAEsRgm6UMGQ0WmOIEuq7swyETkPqyUR7HxipPMh89URgp01+vB8VlASBjXVsjma/rf/uN//MNrOzN/mfPnnfHuCtfKBDE8mU0cIhsc//tSxOqAC80jH4wgy+Fwp6OpkZV4NgyORf3UX2auKglkNyNNRogAm962prGawQ3qyGOUU5lYft5n+MxZmRS5727ftZmeo/pXOCFEnNL6mq66Dn9Qxz219X1Px7NYdtOOB0Epq/Za/4673n2jhuvdQL/3vMgW8Im//t9b1v/yzvk2RiIKpqqpCeazs7W87t3OgBS5Cmh1KZqV0lTExkJYlPWEd76efSL7lcG5VSKvQKir1sSQQh5ne9YELrlxEthFWttCwJEQstT6eqxoEJg2ZA//+1LE6wAMeQMfTBkLgYakoyWhoXgSJHOWDIcrm2tltkaSOY1iBqTtWE7wgIMHUc0MyhRc+75sjpDNn4rRv5lJaJ3q6uJvDKTFRsszaxOlqvSD6m4/4R3Z+Hn4Yta0rnrmjHNHqsFh4ogc4QiuVdq61lSwJNijz5QUDlztust0iSQLauVs3YXDbvT3EW5UlFpw3d7dX/4LPf/Yb13053TIluEJaSXFRL8SPNnM7JAoOFDdUPiEQSZ8C9hRdIhGLGrOqWSMKB5z3tLFlAO44b1Hy//7UsTmAAu9DzOkjMu5i5SmNPMlN8xmi5dG8cUAbDcdkr1iQAsWIt5cVg+URZm6/2X7lpvm55Zoh7x5XX7Rr/d/zPOTDNVdvvajQucy/eY2415DZWZ4rHMQLHjRQ6IF0HksEQoEho99hIUzDSyyvcShm5yBWX1KsF1LgB2iCVidljksaRI7KTvEjGNDZMw5HNSIzp+VPh/ArHovv9VdcDb5tbSkSe8JAva5qraVfjOO43itemT6nibuv6/+5q9pGqt1UsrfcXm9YGW6YPHBtffm//tSxOOACoSPISwoaUF7nWh0kaF2Fznp5sREGyvVSuMgAsVc4QrTbtuRx8/vhn4MZJ0QLXNXIib/hnkhMaIadJnIgkKQ3cwV7JerHZRdyMqOiv1RE3k1VSXmRLO5C9NbHqf1Prsndb2qlFIVysnVr9EpqyP7vkzMMY3k6g3nNttdvbGkLpmJAnivY9oQJ40kQkOhRlSMqetVKd+W+w7dNsx38Xb1/vRjzS+1U+WBGHyiWI2HUiyHJBRANzC4UHuQOIIuFG3oWyse0GkKN0Ag5df/+1LE6AAL6J9BpCDJcYIYpXTzGTRLXsegAMQq1igtD+jlljRAu3cqUv3+oa118jdkyYWSp+ozDU4ROdhWkSpKmXmRsu2XlghP/cjIE9MnL5mSexrG61Jf2/Lelb5U6MVyBK6FVLhIBvYLx5dpSFxvWxOMssdNBBCKAbBVbsktsaIM9RPbZjYtSCCSQjy79Pfvxnq6bzmOhlnXNVNMuEmH0pqSG7o9WiCUz2ZGZuRN2gmf8OxipGhcZkvnS/XljnXfrB0ms9v3t9t2e/9+r/0mZf/7UsTmAAsJHz2jDQuxiDPlNPGVvM34GfM/7UN2dqgNXl63K3WxlBir1vDmeGFavRYqcUjdKUCP7y5/nmHTQkP4zxDPbJ+zzP1QGNpZ1PL7bpCSy62ZEZQWYQJ5zEl8rKBu0jqcOyOf9d6+35/Tu/47/Y7yaHbJq2pNo2SlDnu//2u1sbZj7e40vI4CMLHYhNThdFXGd287Z8M3fMeGao9WOo8TLj/aSUjBtyLDc/K+RMWWRdL6S2WFfQU5DiBoIOsck1CqBKPKGDTsUuAoeGiF//tSxOaAC7iPMaegyWFrIKSo8Y1wvZyARbFEiuxASrdksjcbSJJrbO69/D8Jb0GCG+++aOR2+kxLy+RZXnkRwruiGcK2Zspgxcq1uGYI5Z8P4WxBSPKLSLaE+tTnYDVP82EUC4qHSA9bkx865Io8ay5lZbVZDbkmCajCCUjklsjjaJIns4vstVhuET2NdGdFV7LaG3lzgMVmzrkVPPz1TzVtTOoymhni/hUxJ/DNXFO5itACkUEXdsLPvb39UUp4v/U6s1ia4+Fgx5/HDP7f//j/+1LE6AAMQLklp5hpiXaa5fWBjXXR2w7zv/p+wVU5JJG4kQAL6u84rli8o4sjbelssShGm7udV8qBRxQg8U5GiEShOSzEm9iB62ztaCF3DS69595CDXQUb228dOFVgnFcOc74arXylXBWXPOSfKpHtY3/vb//X7+6u/qpgQ2goiYffe6toAIp+d6yaJqsDPnHnVTmYqG2v6i//l32aOeRkCuLXoNpCYu3BH/2TKE3lnDieZ0jM+m/0Gq0hlybIy25KFlGzLYsHwwfHPEakNqFv/7UsTmAAuU6UmkmGuxdCDndPGNdueInUgYVEQ9DCAdym3+13urKImafFY+74gNdgCL14DeXMq/d3GTqfsRlQnUazhOpNSZjz8wSFknaRQn4T5N9N8qz8MvNjUNIwxuvYKOa9lrQA814uQyxFUKB+9Zsq9RiHkG3uEdF37v3u3+8aQU09dFn1egB3MZne7nzNbZGI7I/jOU6KLLJCLkY/TNZrwkXpPGD1BMgKG+n5CFBHyHGU+9vit2P6dXk+v1S1z5G9/9r+h1Zb/t/tu16K/h//tSxOeAC9TrI6WMa4GetiO0kY24/efxXYCjqjQ7NvtrGSDrso2j0QaBEOqhFGD9SePCer+zA3InuIck58I3SP2FzMsRod9QUQWZ49QM7HFMTe70Ui2I0hr/5V7OUHhsRt93yY/+LrM+rmzBeczMdqYeFIdFNLkfOunqAjNIZFdbLZWyB4xqV1WuKVQDYwISTXODVNvdWIxfa57fYjqrIYYyMQsNZZSIy32/99gk82ZBPs8PMqXDmWcM9HzPzqZ/lmUxfdUgvK5ZX85SLQSwJHz/+1DE4gAKgG0xpAxnGYGWo7TxjTG2huOnHClyrguMSxaQAFIJJI5JJGiAFqGVCNXgqu0xHzPfWyyKQowRO9s7kcqGZlOxWfOenuqlkrCvXg0pa1wZ7GVKWoQHQ6/GDxKYrPqP1tQNUZKiI4tglFku3XIYVLEZlF5lrWQjFmiGeKl9t5GgAMlJsSp9J6y7bmgs45sb3Zvqe27c+ddioC0LhGUa45GxmzraZ0qmdzUlyOnqWRqT90csjNvKhyE1QaVNAyVNHjxMBnWJ1NOHh409//tSxOUACuRzOaEMyXmEk2Q8gY0pKFk92tQYWWFVOWpINDQzxEPt/bWkIOwUPCjCvaoZcM6ZpC9z8tnDU71XJ0MY6wygGSwPGKUTyhUVXAVQXHVhdBFB4RwuSVcnY1wuqxQ48J2iyChDvLrSL20iAgZS3aouOes1ZYRoh2tt1bIG/Ds3ubWzEMTQZhToanns/TekyGTZPfpl+5G1yZoSkEVEsOCuP5TNSZQ2VGuU/zpLyZW38VWNWzL/f7arkemyet8uFD/h+hRRu+ZTLWZmXkT/+1LE5oAMdUMf54xrwWUYI/SCiTBZd8r5nk7U8SH4uQUl222222B1GXqtRJ29XotjFfKkKpZIwlbj5uDbO2Mv9MI5rerZHVWm2VGc9b/8he+e3jf/Hyv/07mrO/k0vWFfwdRBMd3z7M2t3+v/HPfMGHGsqgpHHJJHJGiQN7MgMiO5qe72rxFxmXUdVo7scyVGk8WqhhedkfbphkEnXWx1JbHUBrEfcxmZ2R4Mszzh1o5GeZqcpsc/17PP0ndL3W8eRdqhs6U+WTcX7p//Wb1yKf/7UsTmAAv05ynhmGuhWYzk/DGM4Ee0HXiLoODqAmwIJJbZW0QIQhCEIXqq/8bjdX2Y1XwqqupNqX1dS//USTM3V6rNV9nCszMfG1VVUtS9S9YbNw1UBAWqqX/+u3AxMKAoi6w11u1B0N/3eJRKs7g09QNVTEFNRTMuOTcgKGJldGEpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7UsTqg8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");
  bell.play();
}

// should be called after every major interaction eg after sending a message or making an API lab request
async function updateFrequentlyUsedFields() {
  console.log('====== updating frequently used fields...')
  axios.get(`${SERVER_URL}/fetchFrequentlyUsedFields`).then(response => {
    frequentlyUsedFields = response.data;
    // we use the custom attribute 'with-ff-cache-key' to simplify the lookup process
    // for this to work, the value of this custom attribute should match the field names in the response
    for(const key of Object.keys(frequentlyUsedFields)){
      const uiTextField = document.querySelector(` .frequent-fields-input[with-ff-cache-key=${key}]`)
      if (uiTextField) uiTextField.value = frequentlyUsedFields[key] ?? '';
    }
  }).catch(error => {
    console.error("An error occurred while fetching frequently used fields", error);
  })
}

// since DOMPurify cleans svgs up, this creates the svg nodes directly 
function createSVGElement(useFilePath, svgAttributes ) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const xlinkNS = 'http://www.w3.org/1999/xlink';
  const svg = document.createElementNS(svgNS, 'svg');
  Object.keys(svgAttributes).forEach(attribute => {
    svg.setAttribute(attribute, svgAttributes[attribute])
  })
  const use = document.createElementNS(svgNS, 'use');
  use.setAttributeNS(xlinkNS, 'xlink:href', useFilePath);
  svg.appendChild(use);
  return svg;
}

// Handle citation link clicks: scroll to source within the chat container and show a brief highlight
function initCitationLinkHandler() {
  const chatList = document.getElementById('chatList');
  chatList.addEventListener('click', e => {
    const link = e.target.closest('a[href^="#citation-source-"]');
    if (!link) return;
    e.preventDefault();
    const id = link.getAttribute('href');
    const target = document.querySelector(id);
    if (!target) return;
    const containerRect = chatList.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    let scrollTop = chatList.scrollTop
    const scrollPadding = 24;
    // if the target is above the visible area, scroll up. If it is below, scroll down
    if (targetRect.top < containerRect.top) {
      scrollTop -= (containerRect.top - targetRect.top) + scrollPadding;
    } else if (targetRect.bottom > containerRect.bottom) {
      scrollTop += (targetRect.bottom - containerRect.bottom) + scrollPadding;
    }
    chatList.scrollTo({ top: scrollTop, behavior: 'smooth' });
    target.classList.add('citation-source-highlight');
    setTimeout(() => target.classList.remove('citation-source-highlight'), 2000);
  })
}