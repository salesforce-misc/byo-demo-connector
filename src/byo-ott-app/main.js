import messagingConstants from "../common/messagingConstants";
import { testDescriptionMapping, testDescriptions, knowledgeArticles } from '../common/healthCheckConstants.js';
const axios = require('axios');
const SERVER_URL = "http://localhost:3030";
let chatList;
let output;
let sfSubject = "Agent";
let endUserClientName = "End User Client";
let typingStartedReady = true;

window.addEventListener("load", () => {

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

    // construct FormData object using html form
    let formData = new FormData(messageForm);

    let timestamp = Date.now();
    if (messageForm.elements.attachment.value) {
      formData.append("interactionType", "AttachmentInteraction");
      formData.append("timestamp", timestamp);
    } else {
      formData.append("interactionType", "EntryInteraction");
      formData.append("entryType", "Message");
    }

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
    appendOutboundMessageToChatList(messageInputBox.value, originalFileName, fileName);
    messageInputBox.value = '';
    messageForm.elements.attachment.value = null;

    typingStartedReady = true;
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
          }
          break;
        case 'POST_ROUTING_RESULT':
          if (successCheckbox.checked) {
            formData = {
              "apiName": document.getElementById("selected-api-name").value,
              "conversationIdentifier": document.getElementById("conversationIdForPostRoutingResult").value,
              "workItemId": document.getElementById("workItemIdForPostRoutingResult").value,
              "success": document.getElementById("successCheckbox").checked,
              "externallyRouted": document.getElementById("externallyRoutedCheckbox").checked,
              "errorMessage": ""
            };
          } else {
            formData = {
              "apiName": document.getElementById("selected-api-name").value,
              "conversationIdentifier": document.getElementById("conversationIdForPostRoutingResult").value,
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
  const deleteRouteAPIContainer = document.getElementById("deleteRouteAPIContainer");
  const postRouteAPIContainer = document.getElementById("postRouteAPIContainer");
  const postRouteResultAPIContainer = document.getElementById("postRouteResultAPIContainer");
  const consentAPIContainer = document.getElementById("consentAPIContainer");
  const patchRegisterCapabilitiesAPIContainer = document.getElementById("patchRegisterCapabilitiesAPIContainer");
  const postAgentWorkAPIContainer = document.getElementById("postAgentWorkAPIContainer");
  const apiDropdown = document.getElementById("selected-api-name");
  apiDropdown.addEventListener("change", (event) => {
    const selectedAPI = event.target.value;
    switch (selectedAPI) {
      // show the consentAPIContainer
      case "CONSENT":
        consentAPIContainer.classList.remove("slds-hide");
        postRouteAPIContainer.classList.add("slds-hide");
        deleteRouteAPIContainer.classList.add("slds-hide");
        postRouteResultAPIContainer.classList.add("slds-hide");
        patchRegisterCapabilitiesAPIContainer.classList.add("slds-hide");
        postAgentWorkAPIContainer.classList.add("slds-hide");
        break;
      case "POST_ROUTE":
        postRouteAPIContainer.classList.remove("slds-hide");
        consentAPIContainer.classList.add("slds-hide");
        deleteRouteAPIContainer.classList.add("slds-hide");
        postRouteResultAPIContainer.classList.add("slds-hide");
        patchRegisterCapabilitiesAPIContainer.classList.add("slds-hide");
        postAgentWorkAPIContainer.classList.add("slds-hide");
        break;
      case "DELETE_ROUTE":
        consentAPIContainer.classList.add("slds-hide");
        postRouteAPIContainer.classList.add("slds-hide");
        deleteRouteAPIContainer.classList.remove("slds-hide");
        postRouteResultAPIContainer.classList.add("slds-hide");
        patchRegisterCapabilitiesAPIContainer.classList.add("slds-hide");
        postAgentWorkAPIContainer.classList.add("slds-hide");
        break;
      case "POST_ROUTING_RESULT":
        consentAPIContainer.classList.add("slds-hide");
        postRouteAPIContainer.classList.add("slds-hide");
        deleteRouteAPIContainer.classList.add("slds-hide");
        postRouteResultAPIContainer.classList.remove("slds-hide");
        patchRegisterCapabilitiesAPIContainer.classList.add("slds-hide");
        postAgentWorkAPIContainer.classList.add("slds-hide");
        break;
      case "PATCH_REGISTER_CAPABILITIES":
        consentAPIContainer.classList.add("slds-hide");
        postRouteAPIContainer.classList.add("slds-hide");
        deleteRouteAPIContainer.classList.add("slds-hide");
        postRouteResultAPIContainer.classList.add("slds-hide");
        patchRegisterCapabilitiesAPIContainer.classList.remove("slds-hide");
        capabilitiesPayload.classList.add("slds-hide");
        postAgentWorkAPIContainer.classList.add("slds-hide");
        break;
      case "POST_AGENT_WORK":
        consentAPIContainer.classList.add("slds-hide");
        postAgentWorkAPIContainer.classList.remove("slds-hide");
        postRouteAPIContainer.classList.add("slds-hide");
        deleteRouteAPIContainer.classList.add("slds-hide");
        postRouteResultAPIContainer.classList.add("slds-hide");
        patchRegisterCapabilitiesAPIContainer.classList.add("slds-hide");
        break;
      default:
        consentAPIContainer.classList.add("slds-hide");
        postRouteAPIContainer.classList.add("slds-hide");
        deleteRouteAPIContainer.classList.add("slds-hide");
        postRouteResultAPIContainer.classList.add("slds-hide");
        patchRegisterCapabilitiesAPIContainer.classList.add("slds-hide");
        postAgentWorkAPIContainer.classList.add("slds-hide");
        break;
    }
  });

  const flowInfoContainer = document.getElementById("flowInfoContainer");
  const queueInfoContainer = document.getElementById("queueInfoContainer");
  const routingInfoDropDown = document.getElementById("routingInfo");
  const interactionRequestDropDown = document.getElementById("interactionRequest");
  const capacityPercentageContainer = document.getElementById("capacityPercentageContainer");
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



  // Register custom event to retrieve the replied message from an agent in core app
  const evtSource = new EventSource(SERVER_URL + "/replyMessage");
  evtSource.addEventListener("replymsg", (e) => {
    console.log('\n=============== EventSource - replymsg event:', e.data);
    let replyObj = JSON.parse(e.data);
    if (replyObj.type === messagingConstants.EVENT_TYPE.INTERACTION) {
      appendInboundMessageToChatList(replyObj.replyMessageText, replyObj.attachmentName, replyObj.attachmentUrl, replyObj.payloadField);
    } else if (replyObj.type === messagingConstants.EVENT_TYPE.ROUTING_REQUESTED) {
      appendInboundEventToChatList(replyObj.type, replyObj.payloadField);
    }
  });

  if(document.getElementById('healthCheckButton')) {
    document.getElementById('healthCheckButton').addEventListener('click', runHealthCheck);
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
  initializeAccordion();
}

function initializeAccordion() {
  document.querySelectorAll('.slds-accordion__summary-action').forEach(button => {
      button.addEventListener('click', () => {
          const section = button.closest('.slds-accordion__section');
          const content = section.querySelector('.slds-accordion__content');
          const isExpanded = button.getAttribute('aria-expanded') === 'true';

          button.setAttribute('aria-expanded', !isExpanded);
          content.hidden = isExpanded;
          section.classList.toggle('slds-is-open');
      });
  });
}

  // get settings from middleware server
  axios({
    method: "get",
    url: SERVER_URL + "/getsettings"
  })
    .then((res) => {
      if (res.status === 200) {
        // set settings fields with values retrieved from middleware server
        let settings = res.data;
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

        return axios({
          method: "get",
          url: SERVER_URL + "/getConversationChannelDefinitions",
        });
      }
    })
    .then((ccdResponse) => {
      if (ccdResponse && ccdResponse.status && ccdResponse.status === 200) {
        let ccdData = ccdResponse.data;

        if (ccdData && ccdData.records && ccdData.records.length > 0) {
          const ccdDataRecord = ccdData.records[0];
          document.getElementById("authorizationContext").value = ccdDataRecord.DeveloperName;
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
        } else {
          console.log("No records found in the CCD data");
        }
      } else {
        console.log("Invalid CCD response");
      }
    })
    .catch((err) => {
        throw err;
    });

    chatList = document.getElementById('chatList');
});

function appendOutboundMessageToChatList(message, originalFileName, fileName) {
  if (originalFileName && fileName) {
    appendAttachmentOutboundMessageToChatList(originalFileName, SERVER_URL + "/uploads/" + fileName);
  }

  let outboundMessageHTMLElem = generateOutboundMessageHTMLElem(message);

  appendMessageToChatList(outboundMessageHTMLElem);
}

function generateOutboundMessageHTMLElem(message) {
  let now = new Date();
  let dateTime = now.toLocaleString();
  let html =
    '<li class="slds-chat-listitem slds-chat-listitem_outbound">' +
    '  <div class="slds-chat-message">' +
    '    <div class="slds-chat-message__body">' +
    '      <div class="slds-chat-message__text slds-chat-message__text_outbound">' +
    '        <span>' + message +
    '        </span>' +
    '      </div>' +
    '      <div class="slds-chat-message__meta" aria-label="said ' + endUserClientName + ' at ' + dateTime + '">' + endUserClientName + ' • ' + dateTime + '</div>' +
    '    </div>' +
    '  </div>' +
    '</li>';

  return htmlToElem(html);
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
    '        <span>' + replaceURLsWithHyperLinks(message) +
    '        </span>' +
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

function appendInboundMessageToChatList(message, attachmentName, attachmentUrl, payloadField) {
  if (attachmentName && attachmentUrl) {
    appendAttachmentInboundMessageToChatList(attachmentName, attachmentUrl);
  }

  if (!message && !attachmentName && !attachmentUrl) return;

  let inboundMessageHTMLElem = generateInboundMessageHTMLElem(message, attachmentName, attachmentUrl);

  if (message) {
    appendMessageToChatList(inboundMessageHTMLElem);
  }

  document.getElementById("eventLog").value = JSON.stringify(JSON.parse(payloadField.string), undefined, 4);
}

function generateInboundMessageHTMLElem(message) {
  let now = new Date();
  let dateTime = now.toLocaleString();
  let html =
    '<li class="slds-chat-listitem slds-chat-listitem_inbound">' +
    '  <div class="slds-chat-message">' +
    '    <div class="slds-chat-message__body">' +
    '      <div class="slds-chat-message__text slds-chat-message__text_inbound">' +
    '        <span>' + replaceURLsWithHyperLinks(message) +
    '        </span>' +
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

function htmlToElem(html) {
  let temp = document.createElement('template');
  html = html.trim();
  temp.innerHTML = html;
  return temp.content.firstChild;
}

function appendMessageToChatList(htmlElem) {
  chatList.appendChild(htmlElem);
  chatList.scrollTop = chatList.scrollHeight;
  beep();
}

function replaceURLsWithHyperLinks(message) {
  if (!message) return;

  return message.replace(/((((https?|ftps?|file):\/\/)|(www\.))[^\s]+)/g, function (url) {
    var hyperlink = url;
    if (!hyperlink.match('^https?:\/\/')) {//eslint-disable-line
      hyperlink = 'http://' + hyperlink;
    }
    return '<a href="' + hyperlink + '" target="_blank">' + url + '</a>'
  });
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
  var bell = new Audio("data:audio/mp3;base64,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yXmEk2Q8gY0pKFk92tQYWWFVOWpINDQzxEPt/bWkIOwUPCjCvaoZcM6ZpC9z8tnDU71XJ0MY6wygGSwPGKUTyhUVXAVQXHVhdBFB4RwuSVcnY1wuqxQ48J2iyChDvLrSL20iAgZS3aouOes1ZYRoh2tt1bIG/Ds3ubWzEMTQZhToanns/TekyGTZPfpl+5G1yZoSkEVEsOCuP5TNSZQ2VGuU/zpLyZW38VWNWzL/f7arkemyet8uFD/h+hRRu+ZTLWZmXkT/+1LE5oAMdUMf54xrwWUYI/SCiTBZd8r5nk7U8SH4uQUl222222B1GXqtRJ29XotjFfKkKpZIwlbj5uDbO2Mv9MI5rerZHVWm2VGc9b/8he+e3jf/Hyv/07mrO/k0vWFfwdRBMd3z7M2t3+v/HPfMGHGsqgpHHJJHJGiQN7MgMiO5qe72rxFxmXUdVo7scyVGk8WqhhedkfbphkEnXWx1JbHUBrEfcxmZ2R4Mszzh1o5GeZqcpsc/17PP0ndL3W8eRdqhs6U+WTcX7p//Wb1yKf/7UsTmAAv05ynhmGuhWYzk/DGM4Ee0HXiLoODqAmwIJJbZW0QIQhCEIXqq/8bjdX2Y1XwqqupNqX1dS//USTM3V6rNV9nCszMfG1VVUtS9S9YbNw1UBAWqqX/+u3AxMKAoi6w11u1B0N/3eJRKs7g09QNVTEFNRTMuOTcgKGJldGEpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//tSxOkATLGnH+MMbclKiiQ0UQzhVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy45NyAoYmV0YSlVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+1LE6oAMqVkfowxt2ViiovQRjXJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7UsTqg8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");
  bell.play();
}

