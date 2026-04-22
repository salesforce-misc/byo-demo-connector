/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import Constants from '../common/constants';
import { io } from "socket.io-client";
import { getFlowConfigForStartInboundCall, getRoutingConfigVisibility } from './routingHelpers';
const MAX_PARTICIPANTS_INDEX = 6;
const showLoginPageCheckbox = document.getElementById('showLoginPageCheckbox');
const throwErrorCheckbox = document.getElementById('throwErrorCheckbox');
const customErrorTextArea = document.getElementById('custom-error-text');
const hasMuteCheckbox = document.getElementById('hasMuteCheckbox');
const hasRecordCheckbox = document.getElementById('hasRecordCheckbox');
const hasSwapCheckbox = document.getElementById('hasSwapCheckbox');
const hasSignedRecordingUrlCheckbox = document.getElementById('hasSignedRecordingUrlCheckbox');
const signedRecordingUrl = document.getElementById('signed-recording-url');
const signedRecordingDuration = document.getElementById('signed-recording-duration');
const signedRecordingDetails = document.getElementById('signed-recording-url-details');
const hasMergeCheckbox = document.getElementById('hasMergeCheckbox');
const hasContactSearchCheckbox = document.getElementById('hasContactSearchCheckbox');
const supportsMosCheckbox = document.getElementById('supportsMosCheckbox');
const hasAgentAvailabilityCheckbox = document.getElementById('hasAgentAvailabilityCheckbox');
const hasQueueWaitTimeCheckbox = document.getElementById('hasQueueWaitTimeCheckbox');
const hasBlindTransferCheckbox = document.getElementById('hasBlindTransferCheckbox');
const hasPhoneBookCheckbox = document.getElementById('hasPhoneBookCheckbox');
const canConsultCheckbox = document.getElementById('canConsultCheckbox');
const hasTransferToOmniFlowCheckbox = document.getElementById('hasTransferToOmniFlowCheckbox');
const hasSupervisorListenInCheckbox = document.getElementById('hasSupervisorListenInCheckbox');
const hasSupervisorBargeInCheckbox = document.getElementById('hasSupervisorBargeInCheckbox');
const supportsQueuedAgentStatusCheckbox = document.getElementById('supportsQueuedAgentStatusCheckbox');
const hasDebugLoggingCheckbox = document.getElementById('hasDebugLoggingCheckbox');
const callIsRecordingPaused = document.getElementById('callIsRecordingPaused');
const callIsOnHold = document.getElementById('callIsOnHold');
const callIsExternalTransfer = document.getElementById("callIsExternalTransfer");
const callIsMuted = document.getElementById('callIsMuted');
const callHasAccept = document.getElementById('callHasAccept');
const callHasDecline = document.getElementById('callHasDecline');
const callHasAddParticipant = document.getElementById('callHasAddParticipant');
const callHasMute = document.getElementById('callHasMute');
const callHasHold = document.getElementById('callHasHold');
const callHasRecord = document.getElementById('callHasRecord');
const callHasSwap = document.getElementById('callHasSwap');
const callHasConference = document.getElementById('callHasConference');
const callHasExtensionToggle = document.getElementById('callHasExtensionToggle');
const showMuteButton = document.getElementById('showMuteButton');
const showRecordButton = document.getElementById('showRecordButton');
const showAddCallerButton = document.getElementById('showAddCallerButton');
const showAddBlindTransferButton = document.getElementById('showAddBlindTransferButton');
const phoneNumberInput = document.getElementById('phoneNumber-input');
const ctrVoiceCallIdInput = document.getElementById('ctrVoiceCallId');

const startOutboundCallButton = document.getElementById('start-outbound-call');
const startInboundCallButton = document.getElementById('new-inbound-call');
const customerHangupButton = document.getElementById('customer-hangup');
const connectSupervisorButton = document.getElementById('connect-supervisor');
const acceptCallButton = document.getElementById('accept-call');
const declineCallButton = document.getElementById('decline-call');
const agentEndCallButton = document.getElementById('agent-endcall');
const customerEndCallButton = document.getElementById('customer-endcall');
const thirdPartyEndCallButton = document.getElementById('third-party-endcall');
const participantTypeButton = document.getElementById('participant-types');
const participantTypeDropdownButton = document.getElementById('participant-types-title');
const participantTypeDropdown = document.getElementById('participant-types-options');
const addParticipantButton = document.getElementById('add-participant');
const requestCallbackButton = document.getElementById('request-callback');
const pushDialerButton = document.getElementById('push-dialer');
const progressiveDialerButton = document.getElementById('progressive-dialer');
const ctrSyncButton = document.getElementById('ctr-sync');
const consultButton = document.getElementById('consult');
const additionalFieldsInput= document.getElementById('additionalFields-input');
const muteButton = document.getElementById('mute');
const unmuteButton = document.getElementById('unmute');
const holdButton = document.getElementById('hold');
const resumeButton = document.getElementById('resume');
const pauseRecButton = document.getElementById('pause-rec');
const resumeRecButton = document.getElementById('resume-rec');
const swapButton = document.getElementById('swap');
const conferenceButton = document.getElementById('conference');
const removeSupervisorButton = document.getElementById('remove-supervisor');
const softphoneLogoutButton = document.getElementById('softphone-logout');
const transcriptionVendorCallKey = document.getElementById('transcription-vendor-call-key');
const consultTranscriptionVendorCallKey = document.getElementById('consult-transcription-vendor-call-key');
const transcriptionCustomerPhoneNumber = document.getElementById('transcription-customer-phone-number');
const externalUserIdTextBox = document.getElementById('transcription-external-user-id');
const consultExternalUserIdTextBox = document.getElementById('consult-transcription-external-user-id');
const transcriptionTextArea = document.getElementById('transcription-text-view');
const consultTranscriptionTextArea = document.getElementById('consult-transcription-text-view');
const sendTranscriptionButton = document.getElementById('send-transcription');
const consultSendTranscriptionButton = document.getElementById('consult-send-transcription');
const recordButton = document.getElementById('record-button');
const senderTypeButton = document.getElementById('sender-types');
const senderTypeDropdownButton = document.getElementById('sender-types-title');
const senderTypeDropdown = document.getElementById('sender-types-options');
const consultSenderTypeButton = document.getElementById('consult-sender-types');
const consultSenderTypeDropdownButton = document.getElementById('consult-sender-types-title');
const consultSenderTypeDropdown = document.getElementById('consult-sender-types-options');
const endUserDropdownButton = document.getElementById('endUserButton');
const virtualAgentDropdownButton = document.getElementById('virtualAgentButton');
const humanAgentDropdownButton = document.getElementById('humanAgentButton');
const externalUserDropdownButton = document.getElementById('externalUserButton');
const supervisorDropdownButton = document.getElementById('supervisorButton');
const consultVirtualAgentDropdownButton = document.getElementById('consult-virtualAgentButton');
const consultHumanAgentDropdownButton = document.getElementById('consult-humanAgentButton');
const consultExternalUserDropdownButton = document.getElementById('consult-externalUserButton');
const consultSupervisorDropdownButton = document.getElementById('consult-supervisorButton');
const sendPostCallRecordingButton = document.getElementById('send-post-call-recording');
const sendVoiceMailButton = document.getElementById('send-voice-mail');
const postCallRecordingUrl = document.getElementById('recording-link');
const sendMessageButton = document.getElementById('send-message-button');
const sendRealtimeConversationEventsButton = document.getElementById('send-realtime-conversation-events');
const sendMessageTextArea = document.getElementById('send-message-text');
const receiveMessageTextArea = document.getElementById('receive-message-text');
const interactionDurationInput = document.getElementById('interaction-duration');
const holdDurationInput = document.getElementById('hold-duration');
const voiceCallIdInput =  document.getElementById('voice-id');
const activeCallsCard =  document.getElementById('active-calls-card');
const agentMissedCallButton =  document.getElementById('agent-missed-call');
const callErrorButton =  document.getElementById('call-error');
const demoTitle = document.getElementById('demo-title');
const agentName = document.getElementById('agent-name');
const errorSpan = document.getElementById('error-span');
const sendAudioStatsButton = document.getElementById('send-audioStats-button');
const sendAudioStatsTextArea = document.getElementById('send-audioStats-text');
const statusDropdown = document.getElementById('status-dropdown');
const hardphoneRadio = document.getElementById('hardphone');
const softphoneRadio = document.getElementById('softphone');
const unifiedRoutingFlowParamsDiv = document.getElementById('unifiedRoutingFlowParams');
const federatedRoutingRadio = document.getElementById('federatedRouting');
const unifiedRoutingRadio = document.getElementById('unifiedRouting');
const useRouteFlowApiCheckbox = document.getElementById('useRouteFlowApi');
const flowDevNameInput = document.getElementById('flowDevName');
const fallbackQueueInput = document.getElementById('fallbackQueue');
const callbackNumberInput = document.getElementById('callbackNumber');
const isPreviewCallbackInput = document.getElementById('isPreviewCallback');
const allowRemovingPrimaryCallParticipantDropdown = document.getElementById('allow-removing-primary-call-participant');
const allowRemovingTransferCallParticipantDropdown = document.getElementById('allow-removing-transfer-call-participant');
const agentContactType = document.getElementById('agentContactType');
const queueContactType = document.getElementById('queueContactType');
const phoneBookContactType = document.getElementById('phoneBookContactType');
const phoneNumberContactType = document.getElementById('phoneNumberContactType');
const showMergeButton = document.getElementById('showMergeButton');
const showSwapButton = document.getElementById('showSwapButton');
const voiceSimulatorTabsetHead = document.getElementById('tab-VoiceSimulator');
const voiceSimulatorTabsetHeadLink = document.getElementById('tab-VoiceSimulator__item');
const messagingSimulatorTabsetHead = document.getElementById('tab-MessagingSimulator');
const messagingSimulatorTabsetHeadLink = document.getElementById('tab-MessagingSimulator__item');
const voiceSimulatorTabsetContent = document.getElementById('tab-Content-VoiceSimulator');
const messagingSimulatorTabsetContent = document.getElementById('tab-Content-MessagingSimulator');
const initErrorPanel = document.getElementById('init-error-panel');
const ccaasDemoAppTab = document.getElementById('ccaas-demo-app-tab');
const agentStatusPane = document.getElementById('agent-status-pane');
const showTransferViewButton = document.getElementById('showTransferView-button');
const salesforceAgentDropDown = document.getElementById('agent-username-dropdown');
const startACWButton = document.getElementById('start-acw');
const endACWButton = document.getElementById('end-acw');
const acwAgentWorkField = document.getElementById('acwAgentWorkId');
const acwWorkItemField = document.getElementById('acwWorkItemId');
const retrySubscribeButton = document.getElementById('retrySubscribe');
const multipartyAllowedCheckbox = document.getElementById('isMultipartyAllowed');
const consultAllowedCheckbox = document.getElementById('isConsultAllowed');
const isDialPadDisabled = document.getElementById('isDialPadDisabled');
const isPhoneBookDisabled = document.getElementById('isPhoneBookDisabled');
const agentCall = { callAttributes: { participantType: Constants.PARTICIPANT_TYPE.AGENT }};
let call = { callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }};
const thirdPartyCall = { callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }};
const endCallDisabledCheckbox = document.getElementById('endCallDisabled');
const updateSoftphoneControlsButton = document.getElementById('update-call');
const isHidSupported = document.getElementById('isHidSupported');
const hasSetExternalMicrophoneDeviceSetting = document.getElementById('hasSetExternalMicrophoneDeviceSetting');
const hasSetExternalSpeakerDeviceSetting = document.getElementById('hasSetExternalSpeakerDeviceSetting');
signedRecordingDetails.style.display = "none";
const consultTranscriptArticle = document.getElementById('consult-transcription-article');
const SERVER_URL = "/api";


function getCallId(i) {
    return document.getElementById(`button-group${i}`).getAttribute(`data-call-id`);
}

for (let i = 0; i <= MAX_PARTICIPANTS_INDEX; i++) {
    document.getElementById(`connect-participant${i}`).addEventListener('click', function() {
        if (i===0) {
            connectCall();
        } else {
            connectParticipant(getCallId(i));
        }
    });
    document.getElementById(`remove-participant${i}`).addEventListener('click', function() {
        removeParticipant(getCallId(i));
    });
    document.getElementById(`mute-participant${i}`).addEventListener('click', function() {
        muteCall(getCallId(i));
    });
    document.getElementById(`hold-participant${i}`).addEventListener('click', function() {
        holdCall(getCallId(i));
    });
    document.getElementById(`unmute-participant${i}`).addEventListener('click', function() {
        unmuteCall(getCallId(i));
    });
    document.getElementById(`resume-participant${i}`).addEventListener('click', function() {
        resumeCall(getCallId(i));
    });
}

function setContactTypes() {
    sendMessageToConnector({
        type: Constants.SET_CONTACT_TYPES,
        contactTypes: [
            ... agentContactType.checked ? [Constants.CONTACT_TYPE.AGENT] : [],
            ... queueContactType.checked ? [Constants.CONTACT_TYPE.QUEUE] : [],
            ... phoneBookContactType.checked ? [Constants.CONTACT_TYPE.PHONEBOOK] : [],
            ... phoneNumberContactType.checked ? [Constants.CONTACT_TYPE.PHONENUMBER] : []
        ]
    })
}

function getRemovingParticipantSettings(callType) {
    if (callType === Constants.CALL_TYPE.ADD_PARTICIPANT) {
        return allowRemovingTransferCallParticipantDropdown.value;
    }
    return allowRemovingPrimaryCallParticipantDropdown.value;
}
function getCallInfo(callType) {
    return {
        isSoftphoneCall: softphoneRadio.checked,
        isOnHold: callIsOnHold.checked,
        isMuted: callIsMuted.checked,
        isRecordingPaused: callIsRecordingPaused.checked,
        acceptEnabled: callHasAccept.checked,
        declineEnabled: callHasDecline.checked,
        muteEnabled: callHasMute.checked,
        swapEnabled: callHasSwap.checked,
        conferenceEnabled: callHasConference.checked,
        extensionEnabled: callHasExtensionToggle.checked,
        holdEnabled: callHasHold.checked,
        recordEnabled: callHasRecord.checked,
        addCallerEnabled: callHasAddParticipant.checked,
        isExternalTransfer: callIsExternalTransfer.checked,
        showMuteButton: showMuteButton.checked,
        showRecordButton: showRecordButton.checked,
        showAddCallerButton: showAddCallerButton.checked,
        showAddBlindTransferButton: showAddBlindTransferButton.checked,
        removeParticipantVariant: getRemovingParticipantSettings(callType),
        showMergeButton : showMergeButton.checked,
        showSwapButton : showSwapButton.checked,
        additionalFields: additionalFieldsInput.value,
        endCallDisabled: endCallDisabledCheckbox.checked
    }
}

function toggleHardphoneElements() {
    [startOutboundCallButton, acceptCallButton, declineCallButton, callHasAccept, callHasDecline].forEach(elem => {
        elem.disabled = softphoneRadio.checked;
        elem.title = softphoneRadio.checked ? "This is only enabled when hardphone is selected" :"";
    })
}

function toggleSignedRecordingUrlElements() {
    signedRecordingDetails.style.display = hasSignedRecordingUrlCheckbox.checked ? 'block' : 'none';
}

function updateActiveCalls() {
    sendMessageToConnector({
        type: Constants.GET_ACTIVE_CALLS
    });
}

function updateCallInfo(genericUpdate) {
    sendMessageToConnector({
        type: Constants.CALL_INFO_UPDATED,
        callInfo: getCallInfo(Constants.CALL_TYPE.OUTBOUND),
        update: typeof genericUpdate === "boolean" ? !genericUpdate : true
    });
}

let senderType = Constants.SENDER_TYPE.END_USER;
let endCallParticipantType = Constants.PARTICIPANT_TYPE.AGENT;
let phoneNumber;
let agentToControlRemotely;
let getActiveCallsIntervalID = null;
const remoteControlIdentifier = `remote_control_${Math.random().toString(36)}`;

const socket = io();
socket.on('connectors', payload => {
    const agentConnectors = payload.connectors;
    populateSalesforceUsersDropDown(agentConnectors);
    if (!agentToControlRemotely) {
        agentConnectors.forEach ( (connection) => {
            agentToControlRemotely = connection;
        });
        connectToConnector();
    }
});

socket.on('connect', () => {
    socket.emit('join', {
        connectionType : "remote_control",
        remoteId : remoteControlIdentifier,
        userAgent : window.navigator.userAgent
    });
});

socket.on('message', payload => {
    if (payload.messageType === 'AGENT_WORK_NOTIFICATION') {
        console.log("Received AGENT_WORK_NOTIFICATION");
        if (payload.data && payload.data.workEvent) {
            handleAgentWorkNotification(payload.data);
        } else {
            console.log("Unexpected payload structure:", payload.data);
        }
    } else {
        handleMessageFromConnector(payload);
    }
});

function handleAgentWorkNotification(agentWorkData) {
    const workItemId = agentWorkData.workItemId;
    // Create a payload structure that matches what handleMessageFromConnector expects
    const eventPayload = {
        data: {
            type: Constants.AGENT_WORK_EVENT,
            agentWork: {
                status: agentWorkData.workEvent.toLowerCase(),
                workItemId: workItemId,
            },
        }
    };
    handleMessageFromConnector(eventPayload);
}

function sendMessageToConnector(payload) {
    socket.emit("message", { fromUsername: remoteControlIdentifier,
        toUsername : agentToControlRemotely ,
        data: payload  });
}

function handleMessageFromConnector(event) {
    if (event && event.data) {
        switch (event.data.type) {
            case Constants.AGENT_WORK_EVENT: {
                console.log("Enter AGENT WORK", event.data);
                const agentWork = event.data.agentWork;
                const acceptedNotification = document.getElementById('agentWorkAccepted');
                const declinedNotification = document.getElementById('agentWorkDeclined');

                acceptedNotification.classList.add('slds-hide');
                declinedNotification.classList.add('slds-hide');

                // Function to hide notifications after some time
                const hideNotification = (notification) => {
                    setTimeout(() => {
                        notification.classList.add('slds-hide');
                    }, 5000);
                };

                if (agentWork.status === 'accepted') {
                    console.log("Agent work Accepted");
                    acceptedNotification.classList.remove('slds-hide');
                    hideNotification(acceptedNotification);
                } else if (agentWork.status === 'declined') {
                    fetch('/api/clear-agent-work-cache',{
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ workItemId: agentWork.workItemId}),
                    }).then(response => response.json())
                        .then(data => {
                            console.log(`Clear agent work cache returned with - ${data.success}`);
                        }).catch((err) => {
                        console.log(`Clear agent work cache failed - ${err}`);
                    });
                    console.log("Agent Work Declined");
                    declinedNotification.classList.remove('slds-hide');
                    hideNotification(declinedNotification);
                }
            }
                break;
            case Constants.SHOW_LOGIN_PAGE: {
                showLoginPageCheckbox.checked = event.data.value;
            }
                break;
            case Constants.NEW_TYPE:
                break;
            case Constants.AGENT_CONFIG: {
                demoTitle.innerText = `Connected to ${event.data.referrer} as ${event.data.agentId}`;
                document.title = `SCV Simulator ${event.data.agentId}`;
                agentName.innerText = `Agent (${event.data.agentId})`;
                multipartyAllowedCheckbox.checked = event.data.isMultipartyAllowed;
                consultAllowedCheckbox.checked = event.data.isConsultAllowed;
                if(event.data.value.selectedPhone && event.data.value.selectedPhone.type  === 'DESK_PHONE') {
                    hardphoneRadio.checked = true;
                    softphoneRadio.checked = false;
                } else {
                    softphoneRadio.checked = true;
                    hardphoneRadio.checked = false;
                }
                toggleHardphoneElements();
                populateStatusesDropdown(event.data.userPresenceStatuses);
                const contactCenterChannels = event.data.contactCenterChannels;
                if (contactCenterChannels && contactCenterChannels.length > 0) {
                    const supportsPhone = contactCenterChannels.includes('phone');
                    const supportsMessaging = contactCenterChannels.includes('messaging');

                    const mode = (supportsPhone && supportsMessaging) ? 'VOICE_AND_MESSAGING' :
                        supportsPhone ? 'VOICE_ONLY' :
                            supportsMessaging ? 'MESSAGING_ONLY' :
                                'NONE';

                    setDemoConnectorMode(mode);
                }
            }
                break;
            case Constants.CAPABILITIES: {
                demoTitle.innerText = `Connected to ${event.data.referrer} as ${event.data.agentId}`;
                agentName.innerText = `Agent (${event.data.agentId})`;
                hasMuteCheckbox.checked = event.data.value.hasMute;
                hasRecordCheckbox.checked = event.data.value.hasRecord;
                hasSwapCheckbox.checked = event.data.value.hasSwap;
                hasMergeCheckbox.checked = event.data.value.hasMerge;
                hasContactSearchCheckbox.checked = event.data.value.hasContactSearch;
                supportsMosCheckbox.checked = event.data.value.supportsMos;
                hasAgentAvailabilityCheckbox.checked = event.data.value.hasAgentAvailability;
                hasQueueWaitTimeCheckbox.checked = event.data.value.hasQueueWaitTime;
                hasSupervisorListenInCheckbox.checked = event.data.value.hasSupervisorListenIn;
                hasSupervisorBargeInCheckbox.checked = event.data.value.hasSupervisorBargeIn;
                hasBlindTransferCheckbox.checked = event.data.value.hasBlindTransfer;
                hasPhoneBookCheckbox.checked = event.data.value.hasPhoneBook;
                canConsultCheckbox.checked = event.data.value.canConsult;
                hasDebugLoggingCheckbox.checked = event.data.value.debugEnabled;
                hasSignedRecordingUrlCheckbox.checked = event.data.value.hasSignedRecordingUrl;
                hasTransferToOmniFlowCheckbox.checked = event.data.value.hasTransferToOmniFlow;
                supportsQueuedAgentStatusCheckbox.checked = event.data.value.hasPendingStatusChange;
                signedRecordingUrl.value = event.data.value.signedRecordingUrl ? event.data.value.signedRecordingUrl : '';
                signedRecordingDuration.value = event.data.value.signedRecordingDuration ? event.data.value.signedRecordingDuration : '';
                isDialPadDisabled.checked = event.data.value.isDialPadDisabled;
                isPhoneBookDisabled.checked = event.data.value.isPhoneBookDisabled;
                isHidSupported.checked = event.data.value.isHidSupported;
                toggleSignedRecordingUrlElements();
            }
                break;
            case Constants.MESSAGE: {
                receiveMessageTextArea.value =  JSON.stringify(event.data.payload);
            }
                break;
            case Constants.ACTIVE_CALLS: {
                prettyPrintCalls(event.data.value);
            }
                break;
            case Constants.ERROR: {
                showError(event.data.error);
            }
                break;
            case Constants.CTR_SYNC_RESULT: {
                resetCtrSyncButton(event.data.success, event.data.message);
            }
                break;
        }
    }
}

function populateSalesforceUsersDropDown(usernames) {
    // clearout existing options
    while(salesforceAgentDropDown.options.length > 0) {
        salesforceAgentDropDown.options.remove(0);
    }

    let defaultOption = document.createElement('option');
    defaultOption.text = 'Select a different Salesforce User';
    defaultOption.value = '';
    defaultOption.disabled = true;
    salesforceAgentDropDown.add(defaultOption);
    salesforceAgentDropDown.selectedIndex = 0;
    for (const username of usernames) {
        let option = document.createElement('option');
        option.text = username;
        option.value = username;
        salesforceAgentDropDown.add(option);
    }
}

function populateStatusesDropdown(userPresenceStatuses){
    statusDropdown.length = 0;
    let defaultOption = document.createElement('option');
    defaultOption.text = 'Choose Presence';
    defaultOption.value = '';
    defaultOption.disabled = true;
    statusDropdown.add(defaultOption);
    statusDropdown.selectedIndex = 0;
    const data = typeof userPresenceStatuses === 'string'
        ? JSON.parse(userPresenceStatuses)
        : userPresenceStatuses;
    let option;
    for (const [key, value] of Object.entries(data)) {
        option = document.createElement('option');
        option.text = value.statusName;
        option.value = key;
        statusDropdown.add(option);
    }
}

function showError(error) {
    errorSpan.innerHTML = error ? `<span style="color:red;">&nbsp;&nbsp;&nbsp;${error}&nbsp;</span>` : "";
}

function prettyPrintCalls(activeCalls) {
    const isMultipartyAllowed = document.getElementById('isMultipartyAllowed').checked;
    call.callAttributes.isAutoMergeOn = document.getElementById('callIsAutoMergeOn').checked;
    let isConsultCallPresent = false;
    activeCallsCard.style.display = "none";
    for (let i = 0; i <= MAX_PARTICIPANTS_INDEX; i++) {
        document.getElementById(`active-calls-text${i}`).style.display = "none";
        document.getElementById(`active-calls-header${i}`).style.display = "none";
        document.getElementById(`button-group${i}`).style.display = "none";
        document.getElementById(`button-group${i}`).setAttribute(`data-call-id`, null);
        document.getElementById(`hold-participant${i}`).style.display = isMultipartyAllowed ? 'none' : 'block';
        document.getElementById(`resume-participant${i}`).style.display = isMultipartyAllowed ? 'none' : 'block';
    }
    addParticipantButton.disabled = true;
    consultButton.disabled = true;
    connectSupervisorButton.style.display = "none";
    removeSupervisorButton.style.display = "none";
    swapButton.style.display = isMultipartyAllowed ? 'none' : 'block';

    if (Array.isArray(activeCalls) && activeCalls.length > 0){
        if (hasSupervisorListenInCheckbox.checked) {
            connectSupervisorButton.style.display = "block";
            removeSupervisorButton.style.display = "block";
        }
        consultButton.disabled = !(consultAllowedCheckbox.checked && canConsultCheckbox.checked && activeCalls.length > 1);
        addParticipantButton.disabled = activeCalls.length === MAX_PARTICIPANTS_INDEX || (!call.callAttributes.isAutoMergeOn && activeCalls.length > 1);
        activeCallsCard.style.display = "block";
        acceptCallButton.disabled = softphoneRadio.checked;
        declineCallButton.disabled = softphoneRadio.checked;
        activeCalls.forEach((call,i) => {
            if (call.callAttributes.isConsultCall && !consultButton.disabled) {
                isConsultCallPresent = true;
            }
            document.getElementById(`active-calls-header${i}`).style.display = "block";
            document.getElementById(`button-group${i}`).style.display = "block";
            document.getElementById(`active-calls-header${i}`).innerHTML = `Call Participant&nbsp;${(call.contact && call.contact.name) || call.phoneNumber}&nbsp;</span>(${call.callAttributes.participantType}${call.callAttributes.isConsultCall ? ' - Consult Call' : ''}</span>)&nbsp;<span style="color:green;float:right;border-style:groove;}">&nbsp;${call.state}`;
            document.getElementById(`button-group${i}`).setAttribute(`data-call-id`, call.callId);
            if (call.callAttributes.isConsultCall) {
                document.getElementById(`connect-participant${i}`).addEventListener('click', function() {
                    connectCall();
                });
            }
            if (i===0 && call.callAttributes.participantType === Constants.PARTICIPANT_TYPE.THIRD_PARTY) {
                document.getElementById(`connect-participant${i}`).addEventListener('click', function() {
                    connectParticipant(getCallId(i));
                });
            }
            const elem = document.getElementById(`active-calls-text${i}`)
            elem.style.display = "block";
            elem.value = `Call #${i} ${call.state} to ${call.callAttributes.participantType}:\n`;
            Object.keys(call).forEach(key => {
                elem.value += `${key}: ${JSON.stringify(call[key], null, 2)}\n`;
            })
        })
        const mosElem = sendAudioStatsTextArea;
        let audioStats = JSON.parse(mosElem.value);
        audioStats.callId = activeCalls[0].callId;
        mosElem.value = JSON.stringify(audioStats, undefined, 4);
    }
    if (isConsultCallPresent) {
        consultTranscriptArticle.classList.remove('slds-hide');
    } else {
        consultTranscriptArticle.classList.add('slds-hide');
    }
}
activeCallsCard.style.display = "none";

function switchAgentInRemote() {
    agentToControlRemotely = salesforceAgentDropDown.value;
    connectToConnector();
}

function connectToConnector() {
    updateActiveCalls();
    updateCallInfo(true);
    if (getActiveCallsIntervalID) {
        clearInterval(getActiveCallsIntervalID);
    }
    getActiveCallsIntervalID = setInterval(updateActiveCalls, 3000);

    sendMessageToConnector({
        type: Constants.GET_SHOW_LOGIN_PAGE
    });

    sendMessageToConnector({
        type: Constants.GET_AGENT_CONFIG
    });

    sendMessageToConnector({
        type: Constants.GET_CAPABILITIES
    });

    window.addEventListener('mouseup', function(){
        showError("");
        setTimeout(updateActiveCalls, 200);
    });
}
showLoginPageCheckbox.addEventListener('change', showLoginChanged);
throwErrorCheckbox.addEventListener('change', throwErrorChanged);
customErrorTextArea.addEventListener('input', onCustomErrorChanged);
hasMuteCheckbox.addEventListener('change', setCapabilities);
hasRecordCheckbox.addEventListener('change', setCapabilities);
hasMergeCheckbox.addEventListener('change', setCapabilities);
hasTransferToOmniFlowCheckbox.addEventListener('change', setCapabilities);
hasContactSearchCheckbox.addEventListener('change', setCapabilities);
supportsMosCheckbox.addEventListener('change', setCapabilities);
hasAgentAvailabilityCheckbox.addEventListener('change', setCapabilities);
hasQueueWaitTimeCheckbox.addEventListener('change', setCapabilities);
hasSupervisorListenInCheckbox.addEventListener('change', setCapabilities);
hasSupervisorBargeInCheckbox.addEventListener('change', setCapabilities);
hasDebugLoggingCheckbox.addEventListener('change', setCapabilities);
hasBlindTransferCheckbox.addEventListener('change', setCapabilities);
hasPhoneBookCheckbox.addEventListener('change', setCapabilities);
canConsultCheckbox.addEventListener('change', setCapabilities);
hasSwapCheckbox.addEventListener('change', setCapabilities);
hasSignedRecordingUrlCheckbox.addEventListener('change', setCapabilities);
signedRecordingUrl.addEventListener('change', setCapabilities);
signedRecordingDuration.addEventListener('change', setCapabilities);
isDialPadDisabled.addEventListener('change', setCapabilities);
isPhoneBookDisabled.addEventListener('change', setCapabilities);
isHidSupported.addEventListener('change', setCapabilities);
hasSetExternalMicrophoneDeviceSetting.addEventListener('change', setCapabilities);
hasSetExternalSpeakerDeviceSetting.addEventListener('change', setCapabilities);
supportsQueuedAgentStatusCheckbox.addEventListener('change', setCapabilities);
hardphoneRadio.addEventListener('change', setAgentConfig);
softphoneRadio.addEventListener('change', setAgentConfig);
unifiedRoutingRadio.addEventListener('change', setRoutingConfig);
federatedRoutingRadio.addEventListener('change',setRoutingConfig);
if (callbackNumberInput) {
    callbackNumberInput.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
    });
}
multipartyAllowedCheckbox.addEventListener('change', setAgentConfig);
consultAllowedCheckbox.addEventListener('change', setAgentConfig);
startOutboundCallButton.addEventListener('click', startOutboundCall);
startInboundCallButton.addEventListener('click', startInboundCall);
customerHangupButton.addEventListener('click', customerHangup);
acceptCallButton.addEventListener('click', acceptCall);
declineCallButton.addEventListener('click', declineCall);
agentEndCallButton.addEventListener('click', agentEndCallClicked);
customerEndCallButton.addEventListener('click', customerEndCallClicked);
thirdPartyEndCallButton.addEventListener('click', thirdPartyEndCallClicked);
participantTypeDropdownButton.addEventListener('click', endCall);
participantTypeButton.addEventListener('click', showParticipantTypeOptions);
softphoneLogoutButton.addEventListener('click', softphoneLogout);
recordButton.addEventListener('click', recordClicked);
endUserDropdownButton.addEventListener('click', endUserClicked);
supervisorDropdownButton.addEventListener('click', supervisorClicked);
virtualAgentDropdownButton.addEventListener('click', virtualAgentClicked);
humanAgentDropdownButton.addEventListener('click', humanAgentClicked);
externalUserDropdownButton.addEventListener('click', externalUserClicked);
consultSupervisorDropdownButton.addEventListener('click', consultSupervisorClicked);
consultVirtualAgentDropdownButton.addEventListener('click', consultVirtualAgentClicked);
consultHumanAgentDropdownButton.addEventListener('click', consultHumanAgentClicked);
consultExternalUserDropdownButton.addEventListener('click', consultExternalUserClicked);
transcriptionTextArea.addEventListener('input', onTranscriptionChanged);
consultTranscriptionTextArea.addEventListener('input', onConsultTranscriptionChanged);
sendTranscriptionButton.addEventListener('click', sendTranscription);
consultSendTranscriptionButton.addEventListener('click', consultSendTranscription);
sendPostCallRecordingButton.addEventListener('click', sendPostCallRecording);
sendVoiceMailButton.addEventListener('click', sendVoiceMail);
sendMessageButton.addEventListener('click', sendMessage);
sendRealtimeConversationEventsButton.addEventListener('click', sendRealtimeConversationEvents);
connectSupervisorButton.addEventListener('click', connectSupervisor);
removeSupervisorButton.addEventListener('click', removeSupervisor);
senderTypeButton.addEventListener('click', showSenderTypeOptions);
consultSenderTypeButton.addEventListener('click', showConsultSenderTypeOptions);
addParticipantButton.addEventListener('click', addParticipant);
requestCallbackButton.addEventListener('click', requestCallback);
pushDialerButton.addEventListener('click', pushDialer);
progressiveDialerButton.addEventListener('click', progressiveDialer);
ctrSyncButton.addEventListener('click', ctrSync);
consultButton.addEventListener('click', consult);
muteButton.addEventListener('click', mute);
unmuteButton.addEventListener('click', unmute);
holdButton.addEventListener('click', hold);
resumeButton.addEventListener('click', resume);
resumeRecButton.addEventListener('click', resumeRec);
pauseRecButton.addEventListener('click', pauseRec);
swapButton.addEventListener('click', swap);
conferenceButton.addEventListener('click', conference);
agentMissedCallButton.addEventListener('click', agentMissedCall);
callErrorButton.addEventListener('click', callError);
sendAudioStatsButton.addEventListener('click', sendAudioStats);
statusDropdown.addEventListener('change', setAgentStatus);
allowRemovingTransferCallParticipantDropdown.addEventListener('change', setRemoveTransferParticipantVariant);
agentContactType.addEventListener('change', setContactTypes);
queueContactType.addEventListener('change', setContactTypes);
phoneBookContactType.addEventListener('change', setContactTypes);
phoneNumberContactType.addEventListener('change', setContactTypes);
showTransferViewButton.addEventListener('click', sendShowTransferViewEvent);
salesforceAgentDropDown.addEventListener('change', switchAgentInRemote);
startACWButton.addEventListener('click', startACW);
endACWButton.addEventListener('click', endACW);
retrySubscribeButton.addEventListener('click', retrySubscribe)
updateSoftphoneControlsButton.addEventListener('click', updateSoftphoneControls);
showMuteButton.addEventListener('click', updateCallInfo);
callHasMute.addEventListener('click', updateCallInfo);
showRecordButton.addEventListener('click', updateCallInfo);
callHasRecord.addEventListener('click', updateCallInfo);
showAddCallerButton.addEventListener('click', updateCallInfo);
callHasAddParticipant.addEventListener('click', updateCallInfo);

function showLoginChanged() {
    sendMessageToConnector({
        type: Constants.SET_SHOW_LOGIN_PAGE,
        value: showLoginPageCheckbox.checked
    });
}

function throwErrorChanged() {
    sendMessageToConnector({
        type: Constants.THROW_ERROR,
        value: throwErrorCheckbox.checked
    });
}

function onCustomErrorChanged() {
    sendMessageToConnector({
        type: Constants.CUSTOM_ERROR,
        value: customErrorTextArea.value
    });
}

function setAgentConfig() {
    toggleHardphoneElements();
    startOutboundCallButton.disabled = !hardphoneRadio.checked;
    sendMessageToConnector({
        type: Constants.SET_AGENT_CONFIG,
        value: {
            selectedPhone: hardphoneRadio.checked? {type: "DESK_PHONE", number:"101 101 10001"}: {type: "SOFT_PHONE"}}
    });
}

//This function is used to show/hide unifiedRoutingFlowParms
//When Unified Routing is enabled, then we will show Flow Input Parameters (and Use Route Flow API checkbox below CallBack Information)
function setRoutingConfig() {
    const visibility = getRoutingConfigVisibility({ federatedRoutingRadio, unifiedRoutingRadio });
    if (visibility === 'hide') {
        unifiedRoutingFlowParamsDiv.classList.add('slds-hide');
    } else if (visibility === 'show') {
        unifiedRoutingFlowParamsDiv.classList.remove('slds-hide');
    }
}

function setCapabilities() {
    toggleSignedRecordingUrlElements();
    sendMessageToConnector({
        type: Constants.SET_CAPABILITIES,
        value: {
            hasMute: hasMuteCheckbox.checked,
            hasRecord: hasRecordCheckbox.checked,
            hasSwap: hasSwapCheckbox.checked,
            hasMerge: hasMergeCheckbox.checked,
            hasContactSearch: hasContactSearchCheckbox.checked,
            supportsMos: supportsMosCheckbox.checked,
            hasAgentAvailability: hasAgentAvailabilityCheckbox.checked,
            hasQueueWaitTime: hasQueueWaitTimeCheckbox.checked,
            hasSignedRecordingUrl: hasSignedRecordingUrlCheckbox.checked,
            hasSupervisorListenIn: hasSupervisorListenInCheckbox.checked,
            hasBlindTransfer: hasBlindTransferCheckbox.checked,
            hasPhoneBook : hasPhoneBookCheckbox.checked,
            canConsult : canConsultCheckbox.checked,
            hasSupervisorBargeIn: hasSupervisorBargeInCheckbox.checked,
            debugEnabled: hasDebugLoggingCheckbox.checked,
            signedRecordingUrl: signedRecordingUrl.value,
            signedRecordingDuration: signedRecordingDuration.value,
            hasTransferToOmniFlow: hasTransferToOmniFlowCheckbox.checked,
            hasPendingStatusChange: supportsQueuedAgentStatusCheckbox.checked,
            isDialPadDisabled: isDialPadDisabled.checked,
            isPhoneBookDisabled: isPhoneBookDisabled.checked,
            isHidSupported: isHidSupported.checked,
            hasSetExternalMicrophoneDeviceSetting: hasSetExternalMicrophoneDeviceSetting.checked,
            hasSetExternalSpeakerDeviceSetting: hasSetExternalSpeakerDeviceSetting.checked
        }
    });
}

function startOutboundCall() {
    phoneNumber = phoneNumberInput.value;
    sendMessageToConnector({
        type: Constants.START_OUTBOUND_CALL,
        phoneNumber,
        callInfo: getCallInfo(Constants.CALL_TYPE.OUTBOUND)
    });
}

function connectParticipant(callId) {
    const call = { callId };
    sendMessageToConnector({
        type: Constants.CONNECT_PARTICIPANT,
        callInfo: getCallInfo(Constants.CALL_TYPE.ADD_PARTICIPANT),
        call
    });
}

function removeParticipant(callId) {
    const call = { callId };
    sendMessageToConnector({
        type: Constants.REMOVE_PARTICIPANT,
        participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY,
        call
    });
}

function connectSupervisor() {
    sendMessageToConnector({
        type: Constants.CONNECT_SUPERVISOR
    });
}

function removeSupervisor() {
    sendMessageToConnector({
        type: Constants.REMOVE_SUPERVISOR
    });
}
function setAgentStatus() {
    if (statusDropdown.value) {
        sendMessageToConnector({
            type: Constants.SET_AGENT_STATUS,
            statusId: statusDropdown.value
        });
    }
}

function setRemoveTransferParticipantVariant() {
    sendMessageToConnector({
        type: Constants.REMOVE_PARTICIPANT_VARIANT,
        variant: allowRemovingTransferCallParticipantDropdown.value
    });
}

function connectCall() {
    sendMessageToConnector({
        type: Constants.CONNECT_CALL,
        callInfo: getCallInfo(Constants.CALL_TYPE.OUTBOUND)
    });
}

function customerHangup() {
    sendMessageToConnector({
        type: Constants.REMOVE_PARTICIPANT,
        participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER
    });
}

function acceptCall() {
    sendMessageToConnector({
        type: Constants.CONNECT_CALL,
        callInfo: getCallInfo(Constants.CALL_TYPE.INBOUND)
    });
}

function declineCall() {
    sendMessageToConnector({
        type: Constants.AGENT_HANGUP,
        reason: Constants.HANGUP_REASON.PHONE_CALL_ERROR,
        agentErrorStatus: Constants.AGENT_ERROR_STATUS.DECLINED_BY_AGENT

    });
}

function agentMissedCall() {
    sendMessageToConnector({
        type: Constants.AGENT_HANGUP,
        reason: Constants.HANGUP_REASON.PHONE_CALL_ERROR,
        agentErrorStatus: Constants.AGENT_ERROR_STATUS.MISSED_BY_AGENT

    });
}

function callError() {
    sendMessageToConnector({
        type: Constants.AGENT_HANGUP,
        reason: Constants.HANGUP_REASON.PHONE_CALL_ERROR,
        agentErrorStatus: "AnyVendorError"
    });
}


function startInboundCall() {
    phoneNumber = phoneNumberInput.value;
    const flowConfig = getFlowConfigForStartInboundCall({
        phoneNumberInput,
        flowDevNameInput,
        fallbackQueueInput,
        callbackNumberInput,
        unifiedRoutingRadio,
        useRouteFlowApiCheckbox
    });
    sendMessageToConnector({
        type: Constants.START_INBOUND_CALL,
        phoneNumber,
        callInfo: getCallInfo(Constants.CALL_TYPE.INBOUND),
        flowConfig
    });
}

function addParticipant() {
    phoneNumber = phoneNumberInput.value;
    const contact = { phoneNumber, type: 'PhoneNumber' };
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_ADDED,
        payload: { call: {...call, callInfo: getCallInfo()} , contact }
    });
}

function requestCallback() {
    phoneNumber = phoneNumberInput.value;
    const callbackNumber = callbackNumberInput ? callbackNumberInput.value.replace(/\D/g, '') : '';
    const isUnifiedRouting = unifiedRoutingRadio.checked;
    const isPreviewCallback = isPreviewCallbackInput ? isPreviewCallbackInput.checked : false;

    if (isUnifiedRouting && !callbackNumber) {
        showError('Callback number is required when Unified Routing is selected.');
        return;
    }
    showError('');

    const payload = isUnifiedRouting && callbackNumber
        ? { phoneNumber, callbackNumber, isUnifiedRouting: true, ...(isPreviewCallback && { isPreviewCallback: true }) }
        : { phoneNumber };
    sendMessageToConnector({
        type: Constants.REQUEST_CALLBACK,
        payload
    });
}

function pushDialer() {
    phoneNumber = phoneNumberInput.value;
    sendMessageToConnector({
        type: Constants.PUSH_DIALER,
        payload: { phoneNumber }
    });
}

function progressiveDialer() {
    phoneNumber = phoneNumberInput.value;
    sendMessageToConnector({
        type: Constants.PROGRESSIVE_DIALER,
        phoneNumber,
        callInfo: getCallInfo(Constants.CALL_TYPE.OUTBOUND)
    });
}

function ctrSync() {
    const voiceCallId = ctrVoiceCallIdInput.value.trim();
    
    if (!voiceCallId) {
        alert('Please enter a Voice Call ID');
        return;
    }
    
    ctrSyncButton.disabled = true;
    ctrSyncButton.textContent = 'Syncing...';
    
    sendMessageToConnector({
        type: Constants.CTR_SYNC,
        voiceCallId: voiceCallId
    });
}

function resetCtrSyncButton(success = true) {
    // Clear any existing timeout
    if (window.ctrSyncTimeoutId) {
        clearTimeout(window.ctrSyncTimeoutId);
        window.ctrSyncTimeoutId = null;
    }
    
    if (ctrSyncButton) {
        ctrSyncButton.disabled = false;
        ctrSyncButton.textContent = 'CTR Sync';
        
        // Show visual feedback
        const originalText = ctrSyncButton.textContent;
        ctrSyncButton.textContent = success ? 'Synced!' : 'Failed';
        
        setTimeout(() => {
            ctrSyncButton.textContent = originalText;
            ctrSyncButton.style.backgroundColor = '';
        }, 2000);
    }
}



function consult() {
    phoneNumber = phoneNumberInput.value;
    const contact = { phoneNumber, type: 'PhoneNumber' };
    sendMessageToConnector({
        type: Constants.CONSULT,
        callInfo: getCallInfo(),
        contact
    });
}

function mute() {
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.MUTE_TOGGLE,
        payload: { isMuted: true, call: {...call, isGlobal : true}}
    });
}

function unmute() {
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.MUTE_TOGGLE,
        payload: { isMuted: false, call: {...call, isGlobal : true}}
    });
}

function muteCall(callId) {
    const call = { callId };
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.MUTE_TOGGLE,
        payload: { isMuted: true, call }
    });
}

function unmuteCall(callId) {
    const call = { callId };
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.MUTE_TOGGLE,
        payload: { isMuted: false, call }
    });
}

function hold() {
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.HOLD_TOGGLE,
        payload: { call, isCustomerOnHold: true }
    });
}

function resume() {
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.HOLD_TOGGLE,
        payload: { call, isCustomerOnHold: false }
    });
}

function holdCall(callId) {
    const call = { callId };
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.HOLD_TOGGLE,
        payload: { call, isCustomerOnHold: true }
    });
}

function resumeCall(callId) {
    const call = { callId };
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.HOLD_TOGGLE,
        payload: { call, isCustomerOnHold: false }
    });
}

//TODO: Support for pause/resume other calls (i.e. Consult call)
function resumeRec() {
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.RECORDING_TOGGLE,
        payload: { call: agentCall, isRecordingPaused: false }
    });
}

function pauseRec() {
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.RECORDING_TOGGLE,
        payload: { call: agentCall, isRecordingPaused: true }
    });
}

function swap() {
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANTS_SWAPPED,
        payload: { call, thirdPartyCall }
    });
}

function conference() {
    sendMessageToConnector({
        type: Constants.HARDPHONE_EVENT,
        eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANTS_CONFERENCED
    });
}

function softphoneLogout() {
    sendMessageToConnector({
        type: Constants.SOFTPHONE_LOGOUT
    });
}

function recordClicked() {
    transcriptionTextArea.value = '';

    const SpeechRecognition = SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition ) {
        recordButton.disabled = true;
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        transcriptionTextArea.value = transcript;
      }

      recognition.onspeechend = () => {
        recordButton.disabled = false;
      }

      recognition.onnomatch = () => {
        recordButton.disabled = false;
      }

      recognition.onerror = () => {
        recordButton.disabled = false;
      }
      recognition.start();
      recordButton.disabled = true;
}

function onTranscriptionChanged() {
    recordButton.disabled = transcriptionTextArea.value;
}

function onConsultTranscriptionChanged() {
    recordButton.disabled = consultTranscriptionTextArea.value;
}

function showSenderTypeOptions() {
    senderTypeDropdown.classList.toggle('slds-is-open');
}

function showConsultSenderTypeOptions() {
    consultSenderTypeDropdown.classList.toggle('slds-is-open');
}

function endUserClicked() {
    senderType = Constants.SENDER_TYPE.END_USER;
    senderTypeDropdownButton.innerText = 'Customer';
    senderTypeDropdown.classList.toggle('slds-is-open');
}

function supervisorClicked() {
    senderType = Constants.SENDER_TYPE.SUPERVISOR;
    senderTypeDropdownButton.innerText = 'Supervisor';
    senderTypeDropdown.classList.toggle('slds-is-open');
}

function virtualAgentClicked() {
    senderType = Constants.SENDER_TYPE.VIRTUAL_AGENT;
    senderTypeDropdownButton.innerText = 'Unknown agent';
    senderTypeDropdown.classList.toggle('slds-is-open');
}

function externalUserClicked() {
    senderType = Constants.SENDER_TYPE.EXTERNAL_USER;
    senderTypeDropdownButton.innerText = 'External User';
    senderTypeDropdown.classList.toggle('slds-is-open');
}

function humanAgentClicked() {
    senderType = Constants.SENDER_TYPE.HUMAN_AGENT;
    senderTypeDropdownButton.innerText = 'Human agent';
    senderTypeDropdown.classList.toggle('slds-is-open');
}

function consultSupervisorClicked() {
    senderType = Constants.SENDER_TYPE.SUPERVISOR;
    consultSenderTypeDropdownButton.innerText = 'Supervisor';
    consultSenderTypeDropdown.classList.toggle('slds-is-open');
}

function consultVirtualAgentClicked() {
    senderType = Constants.SENDER_TYPE.VIRTUAL_AGENT;
    consultSenderTypeDropdownButton.innerText = 'Unknown agent';
    consultSenderTypeDropdown.classList.toggle('slds-is-open');
}

function consultExternalUserClicked() {
    senderType = Constants.SENDER_TYPE.EXTERNAL_USER;
    consultSenderTypeDropdownButton.innerText = 'External User';
    consultSenderTypeDropdown.classList.toggle('slds-is-open');
}

function consultHumanAgentClicked() {
    senderType = Constants.SENDER_TYPE.HUMAN_AGENT;
    consultSenderTypeDropdownButton.innerText = 'Human agent';
    consultSenderTypeDropdown.classList.toggle('slds-is-open');
}

function showParticipantTypeOptions() {
    participantTypeDropdown.classList.toggle('slds-is-open');
}

function agentEndCallClicked() {
    endCallParticipantType = Constants.PARTICIPANT_TYPE.AGENT;
    participantTypeDropdownButton.innerText = 'End Call';
    participantTypeDropdown.classList.toggle('slds-is-open');
}

function customerEndCallClicked() {
    endCallParticipantType = Constants.PARTICIPANT_TYPE.INITIAL_CALLER;
    participantTypeDropdownButton.innerText = 'End Customer Leg';
    participantTypeDropdown.classList.toggle('slds-is-open');
}

function thirdPartyEndCallClicked() {
    endCallParticipantType = Constants.PARTICIPANT_TYPE.THIRD_PARTY;
    participantTypeDropdownButton.innerText = 'End Third-Party Leg';
    participantTypeDropdown.classList.toggle('slds-is-open');
}

function endCall() {
    if (endCallParticipantType===Constants.PARTICIPANT_TYPE.AGENT) {
        sendMessageToConnector({
            type: Constants.AGENT_HANGUP,
            reason: Constants.HANGUP_REASON.PHONE_CALL_ENDED
        });
    } else {
        sendMessageToConnector({
            type: Constants.END_CALL,
            participantType: endCallParticipantType
        });
    }
}

function sendTranscription() {
    const content = transcriptionTextArea.value;
    const vendorCallKey = transcriptionVendorCallKey.value;
    phoneNumber = transcriptionCustomerPhoneNumber.value ? transcriptionCustomerPhoneNumber.value : phoneNumber;
    let metaData = "";
    if (senderType === Constants.SENDER_TYPE.HUMAN_AGENT) {
        metaData = agentToControlRemotely;
    }
    if (senderType === Constants.SENDER_TYPE.EXTERNAL_USER) {
        metaData = externalUserIdTextBox.value;
    }
    sendMessageToConnector({
        type: Constants.CREATE_TRANSCRIPTION,
        content,
        messageId: Math.random().toString(36).substring(10),
        senderType,
        phoneNumber,
        vendorCallKey,
        metaData
    });
    transcriptionTextArea.value = '';
    recordButton.disabled = false;
}

function consultSendTranscription() {
    const content = consultTranscriptionTextArea.value;
    const vendorCallKey = consultTranscriptionVendorCallKey.value;
    let metaData = "";
    if (senderType === Constants.SENDER_TYPE.END_USER) {
        senderType = Constants.SENDER_TYPE.HUMAN_AGENT;
    }
    if (senderType === Constants.SENDER_TYPE.HUMAN_AGENT) {
        metaData = agentToControlRemotely;
    }
    if (senderType === Constants.SENDER_TYPE.EXTERNAL_USER) {
        metaData = consultExternalUserIdTextBox.value;
    }
    sendMessageToConnector({
        type: Constants.CREATE_TRANSCRIPTION,
        content,
        messageId: Math.random().toString(36).substring(10),
        senderType,
        phoneNumber,
        vendorCallKey,
        metaData
    });
    consultTranscriptionTextArea.value = '';
}

function sendPostCallRecording() {
    const agentInteractionDuration = interactionDurationInput.value;
    const totalHoldDuration = holdDurationInput.value;
    const recordingUrl = postCallRecordingUrl.value;
    const voiceCallId = voiceCallIdInput.value;
    if(recordingUrl &&  totalHoldDuration && agentInteractionDuration) {
         const recordingInfo = {
             agentInteractionDuration:parseInt(agentInteractionDuration),
             totalHoldDuration:parseInt(totalHoldDuration),
             recordingUrl,
             voiceCallId
         };
         sendMessageToConnector({
                type: Constants.SEND_RECORDING,
                recordingInfo });
         postCallRecordingUrl.value = '';
         interactionDurationInput.value = '';
         holdDurationInput.value = '';
         voiceCallIdInput.value = '';
    }
}

function sendVoiceMail(){
    const dialedPhoneNumber = document.getElementById("voicemail-dialedphone").value;
    const transcripts = document.getElementById("voicemail-transcripts").value;
    const recordingUrl = document.getElementById("voicemail-recording").value;
    const caller =  document.getElementById("voicemail-caller").value;
    const recordingLength = document.getElementById("voicemail-length").value;
    const voiceMailDetails = { dialedPhoneNumber, transcripts, recordingUrl, caller, recordingLength };
    if(dialedPhoneNumber &&  transcripts && recordingUrl) {
         sendMessageToConnector({
                type: Constants.SEND_VOICE_MAIL,
                voiceMailDetails
         });
         document.getElementById("voicemail-dialedphone").value = '';
         document.getElementById("voicemail-transcripts").value = '';
         document.getElementById("voicemail-recording").value = '';
         document.getElementById("voicemail-caller").value = '';
         document.getElementById("voicemail-length").value = '';
    }
}

/**
 * Method to send the message for call updated. This is triggered when update softphone controls
 * button is clicked
 */
function updateSoftphoneControls() {
    sendMessageToConnector({
        type: Constants.CALL_UPDATED,
        eventType: Constants.VOICE_EVENT_TYPE.CALL_UPDATED,
        payload: getCallInfo()
    });
}

function sendMessage() {
    const message = sendMessageTextArea.value;
    sendMessageToConnector({
        type: Constants.MESSAGE_FROM_CONNECTOR,
        message : { message }
    });
}

function sendRealtimeConversationEvents(){
    const vendorCallKey = document.getElementById("sendRealtimeConversationEvents-vendor-call-key").value;
    const service = document.getElementById("sendRealtimeConversationEvents-service").value;
    const persist = document.getElementById("sendRealtimeConversationEvents-persist").checked;
    const events = document.getElementById("sendRealtimeConversationEvents-events").value;
    let eventsArray;
    try {
        eventsArray = JSON.parse(events);
        if(vendorCallKey && service && events) {
            const sendRealtimeConversationEventsDetails = { vendorCallKey, service, persist, eventsArray };
            sendMessageToConnector({
                type: Constants.SEND_REALTIME_CONVERSATION_EVENTS,
                sendRealtimeConversationEventsDetails
            });
        }
    } catch(e) {
        console.error(e); // error in the above string
    }
}

function sendAudioStats() {
    const audioStats = JSON.parse(sendAudioStatsTextArea.value);
    sendMessageToConnector({
        type: Constants.SEND_AUDIO_STATS,
        audioStats : audioStats
    });
}

function sendShowTransferViewEvent() {
    sendMessageToConnector({
        type: Constants.VOICE_EVENT_TYPE.SHOW_TRANSFER_VIEW
    });
}

voiceSimulatorTabsetHeadLink && voiceSimulatorTabsetHeadLink.addEventListener('click', showVoiceSimulatorTab);
messagingSimulatorTabsetHeadLink && messagingSimulatorTabsetHeadLink.addEventListener('click', showMessagingSimulatorTab);

function showVoiceSimulatorTab() {
    messagingSimulatorTabsetHead.classList.remove('slds-is-active');
    voiceSimulatorTabsetHead.classList.add('slds-is-active');

    voiceSimulatorTabsetContent.classList.remove('slds-hide');
    voiceSimulatorTabsetContent.classList.add('slds-show');
    messagingSimulatorTabsetContent.classList.remove('slds-show');
    messagingSimulatorTabsetContent.classList.add('slds-hide');

    return false;
}

function showMessagingSimulatorTab() {
    voiceSimulatorTabsetHead.classList.remove('slds-is-active');
    messagingSimulatorTabsetHead.classList.add('slds-is-active');

    voiceSimulatorTabsetContent.classList.remove('slds-show');
    voiceSimulatorTabsetContent.classList.add('slds-hide');
    messagingSimulatorTabsetContent.classList.remove('slds-hide');
    messagingSimulatorTabsetContent.classList.add('slds-show');

    return false;
}

function showInitErrorPanel() {
    initErrorPanel.classList.remove('slds-hide');
    initErrorPanel.classList.add('slds-show');
    ccaasDemoAppTab.classList.remove('slds-show');
    ccaasDemoAppTab.classList.add('slds-hide');

    return false;
}

function showCcaasDemoAppTab() {
    initErrorPanel.classList.remove('slds-show');
    initErrorPanel.classList.add('slds-hide');
    ccaasDemoAppTab.classList.remove('slds-hide');
    ccaasDemoAppTab.classList.add('slds-show');

    return false;
}

function setDemoConnectorMode(mode) {
    //set the mode to server cache so that OTT client apps can also access this information
    fetch(SERVER_URL + "/setOrgMode", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({orgMode: mode}),
    }).then(response => response.json())
    .then(data => {
        console.log('setOrgMode response: ' + JSON.stringify(data));
    }).catch((err) => {
        console.log(`setOrgMode failed - ${err}`);
    });

    // connector mode only applicable for ccaas remote. 
    if (!window.location.pathname.startsWith('/ccaas')) {
        return false;
    }

    switch(mode) {
      case 'VOICE_ONLY':
        showCcaasDemoAppTab();

        voiceSimulatorTabsetHead.classList.remove('slds-hide');
        voiceSimulatorTabsetHead.classList.add('slds-show');
        voiceSimulatorTabsetHead.classList.add('slds-is-active');

        messagingSimulatorTabsetHead.classList.remove('slds-is-active');
        messagingSimulatorTabsetHead.classList.remove('slds-show');
        messagingSimulatorTabsetHead.classList.add('slds-hide');

        agentStatusPane.classList.remove('slds-hide');
        agentStatusPane.classList.add('slds-show');

        showVoiceSimulatorTab();
        break;
      case 'MESSAGING_ONLY':
        showCcaasDemoAppTab();

        messagingSimulatorTabsetHead.classList.remove('slds-hide');
        messagingSimulatorTabsetHead.classList.add('slds-show');
        messagingSimulatorTabsetHead.classList.add('slds-is-active');

        voiceSimulatorTabsetHead.classList.remove('slds-is-active');
        voiceSimulatorTabsetHead.classList.remove('slds-show');
        voiceSimulatorTabsetHead.classList.add('slds-hide');

        agentStatusPane.classList.remove('slds-hide');
        agentStatusPane.classList.add('slds-show');

        showMessagingSimulatorTab();
        break;
      case 'VOICE_AND_MESSAGING':
        showCcaasDemoAppTab();

        voiceSimulatorTabsetHead.classList.remove('slds-hide');
        voiceSimulatorTabsetHead.classList.add('slds-show');
        voiceSimulatorTabsetHead.classList.add('slds-is-active');

        messagingSimulatorTabsetHead.classList.remove('slds-is-active');
        messagingSimulatorTabsetHead.classList.add('slds-show');
        messagingSimulatorTabsetHead.classList.remove('slds-hide');

        agentStatusPane.classList.remove('slds-hide');
        agentStatusPane.classList.add('slds-show');

        showVoiceSimulatorTab();
        break;
      case 'NONE':
      default:
        showInitErrorPanel();
        break;
    }
}

function startACW(){
    sendMessageToConnector({
        type: Constants.SHARED_EVENT_TYPE.AFTER_CONVERSATION_WORK_STARTED,
        acwInfo: {
            agentWorkId: acwAgentWorkField.value,
            workItemId: acwWorkItemField.value
        }
    });
}

function endACW(){
    sendMessageToConnector({
        type: Constants.SHARED_EVENT_TYPE.AFTER_CONVERSATION_WORK_ENDED,
        acwInfo: {
            agentWorkId: acwAgentWorkField.value,
            workItemId: acwWorkItemField.value
        }
    });
}

function retrySubscribe(){
    fetch(SERVER_URL + "/connect-and-subscribe", {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
    }).then(response => response.json()).then((data) => {
        console.log(data);
    })
}