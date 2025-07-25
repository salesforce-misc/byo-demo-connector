/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

/* 
 * Sample Telephony Vendor SDK 
 * @author dlouvton
 */

/** @module vendor-sdk **/
import { publishEvent, log, ActiveCallsResult, AgentConfigResult, SharedCapabilitiesResult, VoiceCapabilitiesResult, RecordingToggleResult, ParticipantResult, MuteToggleResult,
    PhoneContactsResult, ContactsResult, CallResult, HangupResult, HoldToggleResult, InitResult, GenericResult, SetAgentConfigResult, SignedRecordingUrlResult,
    LogoutResult, CallInfo, PhoneCall, PhoneCallAttributes, Contact, Constants, Phone, StatsInfo, AudioStats, AgentStatusInfo, AudioStatsElement, 
    SuperviseCallResult, SupervisorHangupResult, SupervisedCallInfo, CustomError, HidDevice } from '@salesforce/scv-connector-base';
import { io } from "socket.io-client";
import { USER_MESSAGE, FILTER_TYPES_TO_CONTACT_TYPES } from '../common/constants';
import { EventEmitter } from 'events';
import { hidDeviceHandler } from "../hid/hidDeviceHandler";
/**
 * Class representing a Phone Call
 */
class Call extends PhoneCall {

     /**
     * Create a Call.
     * @param {string} callType - Outbound, Inbound or Transfer
     * @param {Contact} contact - Contact associated with this Call
     * @param {string} callAttributes - call attributes 
     * @param {string} callInfo - call info 
     */
    constructor(callType, contact, callAttributes, callInfo, callId) {
        const state = Constants.CALL_STATE.RINGING;
        callAttributes.initialCallHasEnded = false;
        callAttributes.isOnHold = callInfo && callInfo.isOnHold;
        callId = callId || Math.random().toString(36).substring(7);
        if (callAttributes.participantType === Constants.PARTICIPANT_TYPE.INITIAL_CALLER) {
            callInfo.parentCallId = callId;
        }
        super({ callId, callType, contact, state, callAttributes, phoneNumber: contact && contact.phoneNumber, callInfo }); 
    }

    /**
     * set callId of parent call
     */
    set parentCallId(parentCallId) {
        this.callInfo.parentCallId = parentCallId;
    }
}

class ContactCenterAdditionalSettings {
    /**
     * Create an object that includes all the additional data retrieved from core and to be rendered dynamically
     */
    constructor() {
        this.userId;
        this.scrtUrl;
        this.orgId;
        this.instanceUrl;
        this.authorizationContext;
        this.customPlatformEvent;
        this.customEventPayloadField;
        this.customEventTypeField;
        this.routingOwner;
        this.channelAddressIdentifier;
    }
}

class ConnectorEventEmitter extends EventEmitter {}
const eventEmitter = new ConnectorEventEmitter();

/** 
 * Class representing a Softphone SDK
 */
export class Sdk {
    /**
     * Create a Softphone SDK instance.
     * @param {object} state - SDK state
     */
    constructor(state = { 
        isLoginRequired: true, 
        agentConfig: JSON.parse(localStorage.getItem('agentConfig')) || {
            phones : [ "SOFT_PHONE", "DESK_PHONE"],
            selectedPhone : {type:"SOFT_PHONE"}
        },
        updateRemoveTransferCallParticipantVariant: Constants.REMOVE_PARTICIPANT_VARIANT.ALWAYS,
        capabilities: JSON.parse(localStorage.getItem('capabilities')) || {
            hasMute: true,
            hasRecord: true,
            hasMerge: true,
            hasSwap: true,
            hasSignedRecordingUrl: false,
            debugEnabled: true,
            signedRecordingUrl: '',
            signedRecordingDuration: null,
            hasContactSearch: true,
            hasAgentAvailability: true,
            hasQueueWaitTime: true,
            supportsMos : false,
            hasSupervisorListenIn: true,
            hasSupervisorBargeIn: true,
            hasBlindTransfer : true,
            hasTransferToOmniFlow : true,
            hasPendingStatusChange: true,
            hasPhoneBook : false,
            canConsult : true,
            isDialPadDisabled: false,
            isPhoneBookDisabled: false,
            isHidSupported: false,
            hasSetExternalMicrophoneDeviceSetting: false,
            hasSetExternalSpeakerDeviceSetting: false
        },
        agentId: null,
        userFullName: null,
        activeCalls: this.getActiveCallsObj(),
        destroyedCalls: [],
        agentStatus: "Available",
        publishHardphoneErrors: true,
        agentAvailable: false,
        messagingContacts: this.getAllMessagingContacts(20),
        phoneContacts: this.getAllPhoneContacts(20),
        onlineUsers: [],
        activeConferenceCalls: [],
        callInfoObj: {},
        userFullNames : {},
        userPresenceStatuses: null,
        isMultipartyAllowed: null,
        isConsultAllowed: null,
        contactCenterChannels: null,
        delayMs: 0, //Delay in milliseconds before resolving a promise
        contactTypes: JSON.parse(localStorage.getItem('contactTypes')) || 
            [ Constants.CONTACT_TYPE.AGENT, Constants.CONTACT_TYPE.QUEUE, Constants.CONTACT_TYPE.PHONEBOOK, Constants.CONTACT_TYPE.PHONENUMBER ],
        contactCenterAdditionalSettings: new ContactCenterAdditionalSettings(),
        flowConfig : null
    }){
        this.state = {...state, 
            showLoginPage: !!JSON.parse(localStorage.getItem('showLoginPage')),
            throwError: !!JSON.parse(localStorage.getItem('throwError'))
        };
        this.eventEmitter = eventEmitter;
    }
    /**
     * Get a call from the active calls stored on localStorage)
     */
    getCall(call) {
        if (!this.hasActiveCalls()){
            throw new Error("Couldn't find an active call", call);
        }
        if (call.callId) {
            const callByCallId = this.state.activeCalls[call.callId];
            if (!callByCallId) {
                throw new Error("Couldn't find an active call for callId " + call.callId);
            }
            return callByCallId;
        }
        if (call.callAttributes && call.callAttributes.isConsultCall) {
            const consultCall = Object.values(this.state.activeCalls).filter((obj) => obj['callAttributes']['isConsultCall'] === true).pop();
            if (!consultCall) {
                throw new Error("Couldn't find an active consult call " + call.callAttributes.participantType);
            }
            return consultCall;
        } 
        if (call.callAttributes && call.callAttributes.participantType) {
            // During a consult call in list there can be 2 Initial callers, so we do shift() to get the first non-consult one
            const callByParticipant = Object.values(this.state.activeCalls).filter((obj) => obj['callAttributes']['participantType'] === call.callAttributes.participantType).shift();
            if (!callByParticipant) {
                throw new Error("Couldn't find an active call for participant " + call.callAttributes.participantType);
            }
            return callByParticipant;
        }
        if (call.contact && call.contact.id) {
            const callByContactId = Object.values(this.state.activeCalls).filter((obj) => obj['contact']['id'] === call.contact.id).pop();
            if (!callByContactId) {
                return null;
            }
            return callByContactId;
        }
        if (call.callInfo && call.callInfo.renderContactId) {
            const callByRenderContactId =  Object.values(this.state.activeCalls).filter((obj) => obj['callInfo']['renderContactId'] === call.callInfo.renderContactId).pop();
            if (!callByRenderContactId) {
                return null;
            }
            return callByRenderContactId;
        }
        throw new Error("Call is not defined or invalid.", call);
    }
    /**
     * Add a call to the active calls (persisted on localStorage)
     */
    addCall(call) {
        if (call instanceof Call || call instanceof  PhoneCall) {
            this.state.activeCalls[call.callId] = call;
        } else {
            // Have noticed that `call` object comes in as an object instead of Call class OR PhoneCall class . So converting it into the PhoneCall class.
            let callObj = new PhoneCall({});
            Object.assign(callObj, {callId : call.callId, callType : call.callType, contact : call.contact, state :  call.state,
                callAttributes : call.callAttributes, phoneNumber : call.contact && call.contact.phoneNumber, callInfo : call.callInfo});
            this.state.activeCalls[call.callId] = callObj;
        }
        localStorage.setItem('activeCalls', JSON.stringify(this.state.activeCalls));
    }

    /**
     * Message a user (via websocket)
     * if toUsername is null, the message is broadcasted to all users
     */
    messageUser(toUsername, messageType, data){
        const socket = io();
        const fromUsername = this.state.agentId;
        socket.emit("message", { fromUsername, toUsername, messageType, data });
    }
    /**
     * Notify users about your presence (via websocket)
     */
    toggleAgentPresence(isAvailable){
        const socket = io();
        const username = this.state.agentId;
        const fullName = this.state.userFullName;
        const userId = this.state.userId;
        socket.emit("presence", { isAvailable, username , fullName, userId});
    }
    
    /**
     * Get the primary call
     * @returns {Call} - The primary call
     */    
    getPrimaryCall() {
        let primaryCall;
        try {
            primaryCall = this.getCall({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
        } catch (e) {
            try {
                primaryCall = this.getCall({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR }});
            } catch (e) {
                try {
                    primaryCall = this.getCall({callAttributes: { isConsultCall: true }});
                } catch (e) {
                    return this.getActiveCallsList()[0];
                }
            }
        }
        return primaryCall;
    }

    /**
     * for multiparty - update a call with a value to callInfo. 
     * otherwise, Update the Main Call Info (with the initial caller or supervisor)
     * @param call - PhoneCall object if null use INITIAL_CALLER or SUPERVISOR
     * @param value - call.callInfo.value to update 
     */
    updateCallInfo(value, call) {
        let activeCall;
        try {
            activeCall = this.getCall({...(call || {}), callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
        } catch(e) {
            activeCall = this.getCall({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR }});
        }
        Object.assign(activeCall.callInfo, value);
        this.addCall(activeCall);
        return activeCall;
    }

    /*
    * This method is for demo purposes. Enables/disables the show login page for testing
    */
    showLoginPage(enable) {
        localStorage.setItem('showLoginPage', enable);
        this.state.showLoginPage = enable;
    }

    setAgentConfig(config) {
        if (!config) {
            return;
        }

        if (config.selectedPhone && Object.keys(config.selectedPhone).length > 0) {
            this.state.agentConfig.selectedPhone = config.selectedPhone;
        }
        if (config.hidDeviceInfo && Object.keys(config.hidDeviceInfo).length > 0) {
            this.state.agentConfig.hidDeviceInfo = config.hidDeviceInfo;
        }
        localStorage.setItem('agentConfig', JSON.stringify(this.state.agentConfig));
        if(config.hidDeviceInfo !== undefined) {
            hidDeviceHandler(config, this);
        }
        return this.executeAsync("setAgentConfig", new SetAgentConfigResult({
            success: true
        }));
    }

    /*
    * Update Agent Config used only for Voice call simulator
    */
   updateAgentConfig(agentConfig) {
       this.state.agentConfig.selectedPhone = agentConfig.selectedPhone;
       localStorage.setItem('agentConfig', JSON.stringify(this.state.agentConfig));
    }

    setCapabilities() {
        localStorage.setItem('capabilities', JSON.stringify(this.state.capabilities));
        return this.executeAsync("setCapabilities", new GenericResult({ success: true }));
    }

    /*
    * Update Capabilities used only for Voice call simulator
    */
    updateCapabilities(capabilities) {
        this.state.capabilities.hasSignedRecordingUrl = capabilities.hasSignedRecordingUrl;
        this.state.capabilities.signedRecordingUrl = capabilities.signedRecordingUrl;
        this.state.capabilities.signedRecordingDuration = capabilities.signedRecordingDuration;
        this.state.capabilities.hasMute = capabilities.hasMute;
        this.state.capabilities.hasRecord = capabilities.hasRecord;
        this.state.capabilities.hasSwap = capabilities.hasSwap;
        this.state.capabilities.hasMerge = capabilities.hasMerge;
        this.state.capabilities.hasContactSearch = capabilities.hasContactSearch;
        this.state.capabilities.supportsMos = capabilities.supportsMos;
        this.state.capabilities.hasAgentAvailability = capabilities.hasAgentAvailability;
        this.state.capabilities.hasQueueWaitTime = capabilities.hasQueueWaitTime;
        this.state.capabilities.hasSupervisorListenIn = capabilities.hasSupervisorListenIn;
        this.state.capabilities.hasSupervisorBargeIn = capabilities.hasSupervisorBargeIn;
        this.state.capabilities.hasBlindTransfer = capabilities.hasBlindTransfer;
        this.state.capabilities.hasTransferToOmniFlow = capabilities.hasTransferToOmniFlow;
        this.state.capabilities.debugEnabled = capabilities.debugEnabled;
        this.state.capabilities.hasPendingStatusChange = capabilities.hasPendingStatusChange;
        this.state.capabilities.hasPhoneBook = capabilities.hasPhoneBook;
        this.state.capabilities.canConsult = capabilities.canConsult;
        this.state.capabilities.isDialPadDisabled = capabilities.isDialPadDisabled;
        this.state.capabilities.isPhoneBookDisabled = capabilities.isPhoneBookDisabled;
        this.state.capabilities.isHidSupported = capabilities.isHidSupported;
        this.state.capabilities.hasSetExternalMicrophoneDeviceSetting = capabilities.hasSetExternalMicrophoneDeviceSetting;
        this.state.capabilities.hasSetExternalSpeakerDeviceSetting = capabilities.hasSetExternalSpeakerDeviceSetting;
        localStorage.setItem('capabilities', JSON.stringify(this.state.capabilities));
    }

    /*
    * Update contact types for add participant for voice call simulator
    */
   updateContactTypes(contactTypes) {
       this.state.contactTypes = contactTypes;
       localStorage.setItem('contactTypes', JSON.stringify(this.state.contactTypes));
   }

    /*
    * This method is for demo purposes. Enables/disables throwing sdk errors for testing
    */
   throwError(enable) {
        localStorage.setItem('throwError', enable);
        this.state.throwError = enable;
    }

    /*
    * This method is for demo purposes. Enables throwing custom errors for testing
    */
    customErrorChanged(value) {
        localStorage.setItem('customError', value);
        this.state.customError = value;
    }

    /*
    * This method simulates the vendor sending a login result
    */
    subsystemLoginResult(success) {
        this.state.agentAvailable = success;
        publishEvent({ eventType: Constants.SHARED_EVENT_TYPE.LOGIN_RESULT, payload: new GenericResult({
            success: (this.state.showLoginPage && success)
        })});
    }

    /**
     * log a message
     */
    log(...args) {
        if(this.state.capabilities.debugEnabled) {
            const message = args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
            log({ message }, Constants.LOG_LEVEL.INFO);
            return;
        }
        Function.apply.call(console.log, console, ["[sdk]", ...args]);
    }

    /** 
        filter contacts
    */
    filterContacts(contacts, filter) {
        if (!filter) {
            return contacts;
        }
        let result = contacts;
        if (filter.contains) {
            result = result.filter(obj => Object.keys(obj).some(key => obj[key] && obj[key].toLowerCase().includes(filter.contains.toLowerCase())));
        }
        let contactTypes = filter.types || [filter.type && filter.type.toUpperCase()] || [];
        contactTypes.forEach(type => {
            const value = FILTER_TYPES_TO_CONTACT_TYPES[type] || type;
            const key = FILTER_TYPES_TO_CONTACT_TYPES[type] ? "type" : "availability";
            result = result.filter(obj =>  obj[key] === value);
        });
        const startIndex = filter.offset ? filter.offset : 0; 
        const endIndex = filter.limit ? startIndex + filter.limit : result.length;
        return result.slice(startIndex, endIndex);  
    }

    /**
     * @returns {unknown[]}
     */
    getActiveCallsList() {
        return Object.values(this.state.activeCalls);
    }

    /**
     * retrieve the call object from attributes. Logic is not perfect and breaks the Multiparty flow,
     * so separating it in order to not create regression.
     * @param call
     * @returns {*[]}
     */
    getCallsToDestroy(call) {
        let callsToDestroy = [];
        if (call.callAttributes && call.callAttributes.participantType === Constants.PARTICIPANT_TYPE.AGENT) {
            //TODO: Revisit this logic.
            try {
                const customerCall = this.getCall({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
                callsToDestroy.push(customerCall);
            } catch(e) {
                //noop
            }
            try {
                const thirdPartyCall = this.getCall({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }});
                callsToDestroy.push(thirdPartyCall);
            } catch(e) {
                //noop
            }
            if (callsToDestroy.length === 0) {
                callsToDestroy.push(this.getCall(call));
            }
        } else {
            callsToDestroy.push(this.getCall(call));
        }
        return callsToDestroy;
    }
    /**
     * destroy one or more calls
     * @param call
     * @param {string} reason - reason
     */
    destroyCalls(call, reason) {
        let callsToDestroy = [];
        if (this.state.isMultipartyAllowed) {
            if(call.callId) {
                callsToDestroy.push(call);
            } else {
                callsToDestroy.push(this.getCall(call));
            }
        } else {
            callsToDestroy = this.getCallsToDestroy(call);
        }
        return this.processCallsToDestroy(callsToDestroy, reason);
    }

    processCallsToDestroy(callsToDestroy, reason) {
        callsToDestroy.forEach((callToDestroy) => {
            const state = Constants.CALL_STATE.ENDED;
            callToDestroy.state = state;
            callToDestroy.reason = reason;
            if (!this.state.isMultipartyAllowed && this.shouldMessageOtherUser(callToDestroy)) {
                this.messageUser(null, USER_MESSAGE.CALL_DESTROYED, {callId: callToDestroy.callId, reason: reason});
            }
            this.state.destroyedCalls.push(callToDestroy);
            delete this.state.activeCalls[callToDestroy.callId];
        })
        localStorage.setItem("activeCalls", JSON.stringify(this.state.activeCalls));
        this.state.agentAvailable = Object.keys(this.state.activeCalls).length === 0;
        return callsToDestroy;
    }

    shouldMessageOtherUser(callToDestroy) {
        return callToDestroy.callType === Constants.CALL_TYPE.INTERNAL_CALL.toLocaleLowerCase();
    }

    /**
     * destroy specified call
     * @param {string} reason - reason
     */
    destroyCall(call, reason) {
        return this.destroyCalls(call, reason).pop();
    }
    /**
     * perform sso on a container element
     * @param {object} callCenterConfig - Call Center configuration
     */

    async init(callCenterConfig) {
        const username = this.state.agentId = callCenterConfig['userName'];
        this.state.userFullName = callCenterConfig['userFullName'];
        this.state.userId = callCenterConfig['userId'];
        this.state.userPresenceStatuses = callCenterConfig['userPresenceStatuses'];
        this.state.contactCenterChannels = callCenterConfig['contactCenterChannels'];
        this.state.isMultipartyAllowed = callCenterConfig['isSCVMultipartyAllowed'];
        this.state.isConsultAllowed = callCenterConfig['isSCVMultipartyConsultAllowed'];
        
        // Only fetch when there're messaging channels. Voice doesn't need these information
        if (callCenterConfig['messagingChannel'] && callCenterConfig['messagingChannel'].length !== 0) {
            let IS_LOCAL_CONFIG = await this.fetchServer("/is-local-config", 'GET');
            if(!IS_LOCAL_CONFIG){
                try {
                    this.readCallCenterConfigAndSetState(callCenterConfig);
                } catch (e) {
                    return Promise.reject("Failed to configure tenant information");
                }
            }
        }

        const socket = io();

        socket.on('onlineUsers', onlineUsers => {
            this.state.onlineUsers = onlineUsers.users;
            this.state.userFullNames = new Map(JSON.parse(onlineUsers.userNames));
        });

        socket.on('connect', () => {
            socket.emit('join', { username, id: this.state.userId });
        });

        socket.on('message', message => {
            this.handleSocketMessage(message);
        });

        const tenantInfo = {
            scrtBaseUrl: callCenterConfig['scrtUrl'],
            orgId: callCenterConfig['organizationId'],
            callCenterName: callCenterConfig['/reqGeneralInfo/reqInternalName']
        };

        return fetch('/api/configureTenantInfo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(tenantInfo)
        }).then(response => response.json())
          .then((data) => {
            if (data.success) {
                this.toggleAgentPresence(true);
                this.state.agentAvailable = !this.state.showLoginPage;
                return this.executeAsync('ssoLogin', this.state.showLoginPage ?
                new InitResult({ showLogin: true, loginFrameHeight: 350 }) :
                new InitResult({}));
            } else {
                return Promise.reject("Failed to configure tenant information");
            }
        });
    }

    fetchServer(endpoint, method, body) {
        return fetch(`/api/fetchServer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ...body, method: method, endpoint: endpoint })
        }).then(response => response.json()).then((result) => {
            return result;
        })
    }
    /**
     * This function:
     * (1) retrieve setting from /getsettings,
     * (2) use setting.channelAddressIdentifier to select the conversationChannelDefinition we are looking for,
     * (3) update this.state data (ConversationDefinitionChannel, MessagingChannel, Domain)
     * (4) fetch back to current setting by calling /setcallcenterconfig endpoint.
     * @param {*} callCenterConfig 
     */

    readCallCenterConfigAndSetState(callCenterConfig) {
        this.fetchServer("/getsettings",'GET').then((setting) => {
            if (setting) {
                //HINT: setting.channelAddressIdentifier needs to be specified by user 
                this.state.channelAddressIdentifier = setting.channelAddressIdentifier;
                this.state.contactCenterAdditionalSettings.userId = callCenterConfig['userId'];
                this.state.contactCenterAdditionalSettings.scrtUrl = callCenterConfig['scrtUrl'];
                this.state.contactCenterAdditionalSettings.orgId = callCenterConfig['organizationId'];
                let domain = callCenterConfig['domain']
                this.state.contactCenterAdditionalSettings.instanceUrl = domain; 
                if (callCenterConfig['messagingChannel']){
                    Object.keys(callCenterConfig['messagingChannel']).forEach(mckey =>{
                        let mc = callCenterConfig['messagingChannel'][mckey];
                        if (mc['ChannelAddressIdentifier'] === this.state.channelAddressIdentifier) {
                            let cdId = mc['ChannelDefinitionId'];
                            Object.keys(callCenterConfig['conversationChannelDefinition']).forEach(ccdkey => {
                                let ccd = callCenterConfig['conversationChannelDefinition'][ccdkey];
                                if (ccd['Id'] === cdId) {
                                    this.state.contactCenterAdditionalSettings.authorizationContext = ccd['DeveloperName'];
                                    this.state.contactCenterAdditionalSettings.customPlatformEvent = ccd['CustomPlatformEvent'];
                                    this.state.contactCenterAdditionalSettings.customEventPayloadField = ccd['CustomEventPayloadField'];
                                    this.state.contactCenterAdditionalSettings.customEventTypeField = ccd['CustomEventTypeField'];
                                    this.state.contactCenterAdditionalSettings.routingOwner = ccd['RoutingOwner'];
                                }
                            })
                        }
                    })
                }
                this.fetchContactCenterConfigToEnv();
            } else {
            return new Error("Couldn't fetch settings from /getsettings");
            }
        });
    }
    /**
     * Fetch CCD and domain state data to process
     * @returns 
     */
    async fetchContactCenterConfigToEnv() {
        const formData = {
            "authorizationContext": this.state.contactCenterAdditionalSettings.authorizationContext,
            "userId": this.state.contactCenterAdditionalSettings.userId,
            "userName": this.state.agentId,
            "customEventPayloadField": this.state.contactCenterAdditionalSettings.customEventPayloadField,
            "customPlatformEvent": this.state.contactCenterAdditionalSettings.customPlatformEvent,
            "customEventTypeField": this.state.contactCenterAdditionalSettings.customEventTypeField,
            "routingOwner": this.state.contactCenterAdditionalSettings.routingOwner,
            "instanceUrl": this.state.contactCenterAdditionalSettings.instanceUrl,
            "scrtUrl": this.state.contactCenterAdditionalSettings.scrtUrl,
            "orgId": this.state.contactCenterAdditionalSettings.orgId,
        };

        return await this.fetchServer("/setcallcenterconfig", 'POST', formData)
            .then((data) => {
            if (data.status === 200) {
                console.log(data);
            } else {
                return new Error("Couldn't fetch settings to /setcallcenterconfig");
            }
        });
    }

    /**
     * handle socket message event
     */
    handleSocketMessage(message) {
        if (message.messageType) {
            switch(message.messageType){
                case USER_MESSAGE.CALL_STARTED:
                    this.startTransferOrConsultCall(message);
                    break;
                case USER_MESSAGE.INTERNAL_CALL_STARTED:
                    this.startInternalCall(message);
                    break;
                case USER_MESSAGE.PARTICIPANT_CONNECTED:
                    if (message.fromUsername !== this.state.agentId && !this.isSupervisorListeningIn()) {
                        this.connectParticipant(message.data.callInfo, message.data.callType, message.data.call);
                    }
                    break;
                case USER_MESSAGE.CALL_BARGED_IN:
                    this.publishCallBargedInEventToAgents(message.data);
                    break;
                case USER_MESSAGE.CALL_DESTROYED:
                    if (!this.isSupervisorListeningIn()) {
                        this.processCallDestroyed(message.data);
                    }
                    break;
                case USER_MESSAGE.MUTE:
                    if (message.fromUsername !== this.state.agentId) {
                        this.processBroadcastMute(message.data, true);
                    }
                    break;
                case USER_MESSAGE.UNMUTE:
                    if (message.fromUsername !== this.state.agentId) {
                        this.processBroadcastMute(message.data, false);
                    }
                    break;
                case USER_MESSAGE.MERGE:
                    // Dont merge if there are no active calls
                    if (!this.hasActiveCalls()) {
                        return;
                    }

                    // Don't merge the supervisor if the supervisor is actively listening into a call
                    if (message.fromUsername !== this.state.agentId && message.data.consultCall && !this.isSupervisorListeningIn()) {
                        this.state.activeConferenceCalls = message.data.activeConferenceCalls;
                        let primaryCall;
                        let activeCallList = this.getActiveCallsList();

                        // goal is to find the primary call and change its participantType / receiverContact before merging
                        if (activeCallList.length === 1 && this.hasConsultCall(activeCallList)) {
                            // if we are merging activeCalls into consult user, then currently there is no primary call ID
                            // and the consult user will have only 1 call. and that is as good as a primary call
                            primaryCall = activeCallList[0];
                        } else {
                            // if we are merging consult call into multiparty group user, then they will have a primary call
                            primaryCall = this.getPrimaryCall();
                        }

                        // update the correct participanttype in the MPC
                        let elem = this.state.activeConferenceCalls.find(({callId}) => callId === primaryCall.callId);
                        if (elem) {
                            elem.callAttributes.participantType = Constants.PARTICIPANT_TYPE.INITIAL_CALLER;
                            elem.receiverContact = elem.receiverContact || this.state.activeCalls[primaryCall.callId].receiverContact;
                        }
                        if (message.data.consultCall.callId === primaryCall.callId) {
                            message.data.consultCall.callAttributes.participantType = Constants.PARTICIPANT_TYPE.INITIAL_CALLER;
                        }
                        message.data.consultCall.contact = new Contact({id: message.fromUsername});
                        message.data.consultCall.callInfo.renderContactId = message.fromUsername;

                        this.mergeConsultCall(message.data.consultCall);
                        this.updateConferenceUsers(true);
                    }
                    break;
                default:
                    this.log("Could not handle message "+message.messageType, message)
            }
        } else if (message.data && message.data.type) {
            // bubble event to the event emitter for remote event handling
            this.eventEmitter.emit('event', message);
        }
    }

    /**
     * This method updates the callInfo object for the connected Agent
     * on page load, config changes etc.
     * This callInfo object is then used by the agents when making the call.
     * @param message
     */
    updateCallInfoObj(message) {
        this.state.callInfoObj = message.data.callInfo;
        localStorage.setItem('callInfo', JSON.stringify(this.state.callInfoObj));
    }

    generateCallId() {
        return Math.random().toString(36).substring(7);
    }

    startTransferOrConsultCall(message) {
        const isConsultCall = message.data.isConsultCall;
        let flowConfig = message.data.flowConfig || { isUnifiedRoutingEnabled: false };
        flowConfig.isTransferFlow = true;
        const callInfo = message.data.callInfo || {};
        callInfo.callStateTimestamp = message.data.callInfo?.callStateTimestamp ? new Date(message.data.callInfo.callStateTimestamp) : new Date();
        const call = new PhoneCall({
            callType: isConsultCall ? Constants.CALL_TYPE.CONSULT : Constants.CALL_TYPE.TRANSFER,
            phoneNumber: message.data.phoneNumber,
            callId: message.data.callId || this.generateCallId(),
            callAttributes: new PhoneCallAttributes({
                participantType: isConsultCall ? Constants.PARTICIPANT_TYPE.THIRD_PARTY : Constants.PARTICIPANT_TYPE.INITIAL_CALLER,
                voiceCallId: message.data.voiceCallId,
                parentId: message.data.callAttributes?.parentId,
                isConsultCall
            }),
            state: Constants.CALL_STATE.RINGING  // Explicitly set initial state to RINGING
        });
        
        const renderContact = callInfo.renderContact || message.data.renderContact;
        call.callInfo = Object.assign(callInfo, JSON.parse(localStorage.getItem('callInfo')));

        if (!this.state.isMultipartyAllowed) {
            call.callInfo.isOnHold = false;
        }
        if (renderContact) {
            call.contact = new Contact(renderContact);
            call.toContact = this.getCurrentUserContact();
        }
        call.callInfo.renderContactId = message.fromUsername;
        this.addCall(call);
        //When Unified Routing is enabled, we need to invoke OmniFlow, otherwise regular flow to publish CALL_STARTED event.
        if(flowConfig?.isUnifiedRoutingEnabled) {
            //this.executeOmniFlowForUnifiedRouting(message.data, flowConfig);
        } else {
            let callResult = new CallResult({call});
            publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED, payload: callResult});
        }
        if (this.state.isMultipartyAllowed && !isConsultCall) {
            this.state.activeConferenceCalls = message.data.activeConferenceCalls;
        }
    }

    startInternalCall(message) {
        const currContact = new Contact({
            phoneNumber : message.data.contact.phoneNumber,
            id : message.data.contact.id,
            type : message.data.contact.type,
            name : message.data.contact.name
        });
        const call = new PhoneCall({
            callType: Constants.CALL_TYPE.INTERNAL_CALL,
            phoneNumber: message.data.contact.phoneNumber,
            callId: message.data.callId,
            contact: currContact,
            callInfo: new CallInfo({isOnHold:false, renderContactId: message.data.renderContact.name}),
            callAttributes: new PhoneCallAttributes({participantType: Constants.PARTICIPANT_TYPE.AGENT })
        });
        this.addCall(call);
        let callResult = new CallResult({call});
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED, payload: callResult});
    }


    updateConferenceUsers(updateActiveCallToo) {
        if (this.state.isMultipartyAllowed) {
            if (this.state.activeConferenceCalls.length > 0) {
                setTimeout(()=> {
                    this.state.activeConferenceCalls.forEach(call => {
                        const activeCall = this.state.activeCalls[call.callId];
                        if (updateActiveCallToo || !activeCall) {
                            const callAttributes = activeCall ? activeCall.callAttributes : { isAutoMergeOn: true };
                            let callInfo = this.state.isMultipartyAllowed
                                ? Object.assign(call.callInfo, JSON.parse(localStorage.getItem('callInfo')))
                                : call.callInfo || {};
                            callInfo.callStateTimestamp = callInfo.callStateTimestamp
                                ? new Date(callInfo.callStateTimestamp)
                                : new Date();
                            if (activeCall) {
                                call.contact = activeCall.contact;
                                callInfo.renderContactId = activeCall.callInfo.renderContactId;
                            }
                            const useContact = call.contact;
                            const newCall = new Call(
                                Constants.CALL_TYPE.ADD_PARTICIPANT,
                                new Contact(useContact),
                                new PhoneCallAttributes({
                                    participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY,
                                    ...callAttributes
                                }),
                                new CallInfo(callInfo),
                                call.callId
                            );
                            newCall.fromContact = call.fromContact;
                            newCall.toContact = call.toContact;
                            this.addCall(newCall);
                            this.connectParticipant(null, null, newCall);
                        }
                    });
                    this.state.activeConferenceCalls = [];
                },1000);
            }
        }
    }

    processCallDestroyed(messageData) {
        if (messageData.callId) {
            let callToDestroy = null;
            try {
                callToDestroy = this.getCall({ callId : messageData.callId});
            } catch(e) {
                //noop
            }
            if (callToDestroy) {
                if (this.state.isMultipartyAllowed) {
                    if (messageData.target === this.state.agentId) {
                        if (callToDestroy.callType === Constants.CALL_TYPE.CONSULT.toString()) {
                            let destroyedCall = this.destroyCalls(callToDestroy, messageData.reason);
                            let payload = new CallResult({call: destroyedCall.pop()});
                            publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_REMOVED, payload });
                        } else {
                            this.hangupMultiParty(callToDestroy, messageData.reason, null);
                        }
                    } else {
                        let primaryCall;
                        try {
                            primaryCall = this.getPrimaryCall();
                        } catch (e) {
                            //noop
                        }
                        let destroyedCall = this.processEndCall(callToDestroy, null, messageData.reason, false);
                        let payload = new CallResult({call: destroyedCall.pop()});
                        // If the ending call is the agent's primary call, update the callInfo to it's parent node
                        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_REMOVED, payload });
                        // this.destroyCalls(callToDestroy, messageData.reason);
                        if (primaryCall && primaryCall.callInfo && primaryCall.callInfo.renderContactId && messageData.target === primaryCall.callInfo.renderContactId) {
                            publishEvent({eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_CONNECTED, 
                                            payload: new ParticipantResult({
                                                callId: primaryCall.callId,
                                                contact: new Contact(payload.call.contact),
                                                phoneNumber: payload.call.contact && payload.call.contact.phoneNumber,
                                                callInfo: new CallInfo(payload.call.callInfo),
                                                initialCallHasEnded: payload.call.callAttributes && payload.call.callAttributes.initialCallHasEnded
                                            })})
                        }
                    }
                } else {
                    this.hangup(messageData.reason);
                }
            }
        }
    }
    /**
     * simulate logout from the telephony sub system
     */
    subsystemLogout() {
        publishEvent({ eventType: Constants.SHARED_EVENT_TYPE.LOGOUT_RESULT, payload: new LogoutResult({
            success: !this.state.throwError,
            loginFrameHeight: 350
        })});
    }

    /**
     * perform logout from Omni
     */
    omniLogout() {
        return this.executeAsync("SubsystemLogout", new LogoutResult({
            success: true,
            loginFrameHeight: 350
        }));
    }

    /**
     * request the agent contacts when transfer is clicked 
     * @param {Object} filter
     * @param {string} workItemId
     */
    getContacts(filter, workItemId) {
        let contacts = this.filterContacts(this.state.messagingContacts, filter) ;
        return this.executeAsync("getContacts", new ContactsResult({
            contacts
        }));
    }

    /**
     * execute an async action and return a promise
     * @param {string} action
     * @param {object} payload
     * @param {number} delay Delay in milliseconds before resolving the promise
     * @return {Promise}
     */
    executeAsync(action, payload) {
        this.log(`Executing action - ${action}`, payload);
        if (this.state.throwError) {
            if (this.state.customError) {
                const obj = this.state.customError.split('.');
                return Promise.reject(new CustomError({ namespace: obj[0], labelName: obj[1]  }));
            } else {
                return Promise.reject('demo error');
            }
        }
        switch (action) {
            case "mute":
            case "unmute":
                if (!this.state.capabilities.hasMute) {
                    return Promise.reject(new Error('Mute is not supported'));
                }
            break;
            case "conference":
                if (!this.state.capabilities.hasMerge) {
                    return Promise.reject(new Error('Conference is not supported'));
                }
            break;
            case "swapCalls":
                if (!this.state.capabilities.hasSwap) {
                    return Promise.reject(new Error('Swap Calls is not supported'));
                }
            break;
            case "pauseRecording":
            case "resumeRecording":
                if (!this.state.capabilities.hasRecord) {
                    return Promise.reject(new Error('Recording is not supported'));
                }
            break;
            case "getSignedRecordingUrl":
                if (!this.state.capabilities.hasSignedRecordingUrl || !this.state.capabilities.signedRecordingUrl) {
                    return Promise.reject(new Error('Signed recording url is not supported'));
                }
            break;
            case "onAgentWorkEvent":
                /* Pause and unpause work will be received here but nothing yet implemented */
                switch (payload.workEvent) {
                    case Constants.WORK_EVENT.PAUSED:
                        /* implementation for pause work */
                        return Promise.resolve(payload);
                    case Constants.WORK_EVENT.UNPAUSED:
                        /* implementation for unpause work */
                        return Promise.resolve(payload);
                    case Constants.WORK_EVENT.ACCEPTED:
                        console.log('Agent accepted the work', payload);
                        return Promise.resolve(payload);
                    case Constants.WORK_EVENT.DECLINED:
                        console.log('Agent declined the work', payload);
                        return Promise.resolve(payload);
                }
            break;
        }

        if (this.state.delayMs === 0) {
            return Promise.resolve(payload)
        }

        return this.delay(this.state.delayMs).then(() => {
            return Promise.resolve(payload)
        });
    }

    delay(t, v) {
        return new Promise(resolve => {
            setTimeout(resolve.bind(null, v), t)
        });
    }

    getCurrentUserContact() {
        return new Contact({
            phoneNumber: this.state.agentId,
            id: this.state.agentId,
            type: this.state.type,
            name: this.state.userFullName
        });
    }

    /**
     * start a call
     * @param {Contact} contact ToContact
     * @param {Object} callInfo (callInfo.isSoftphoneCall is false if dialing from a desk phone)
     * @param {Boolean} fireCallStarted boolean to indicate whether to fire the call started event
     * @param {Boolean} isCallback boolean providing hint from click-to-dial whether this is a callback.
     * @param {Boolean} isConsultCall boolean to check if it is a consult call
     */
    dial(contact, callInfo, fireCallStarted, isCallback, isConsultCall) {
        if (!isConsultCall && this.hasActiveCalls(Constants.PARTICIPANT_TYPE.INITIAL_CALLER)) {
            return Promise.reject(new Error(`Agent is not available for an outbound call`));
        }
        
        callInfo = {
            ...callInfo,
            isOnHold: callInfo?.isOnHold ?? false,
            callStateTimestamp: new Date(),
            renderContactId: contact.id,
        };
        
        const callAttributes = {
            participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER,
            parentId: isConsultCall
                ? this.getPrimaryCall().callId // send primary callId to createConsultConversation
                : null,
            ...(isConsultCall && { isConsultCall }),
        };

        let callType = Constants.CALL_TYPE.OUTBOUND.toLowerCase();
        if (isConsultCall) {
            callType = Constants.CALL_TYPE.CONSULT;
        } else if (isCallback) {
            callType = Constants.CALL_TYPE.DIALED_CALLBACK;
        } else if (contact.type === Constants.CONTACT_TYPE.AGENT) {
            callType = Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase();
        } 

        const call = new Call(callType, contact, callAttributes, new CallInfo(callInfo));
        call.fromContact = this.getCurrentUserContact();
        this.addCall(call);
        const callResult = new CallResult({ call });

        if (!callInfo.isSoftphoneCall && fireCallStarted ) {
            publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED, payload: callResult });
        }
        
        this.state.agentAvailable = false;
        if (this.state.onlineUsers.includes(contact.id) && contact.type === Constants.CONTACT_TYPE.AGENT) {
            const renderContact = this.getCurrentUserContact();
            const fromContact = new Contact(renderContact);
            const toContact = new Contact(contact);
            this.messageUser(contact.id, isConsultCall ? USER_MESSAGE.CALL_STARTED : USER_MESSAGE.INTERNAL_CALL_STARTED, {phoneNumber: contact.phoneNumber, callId: call.callId, contact, renderContact: renderContact, fromContact, toContact, isConsultCall, callAttributes});
        }
        
        return this.executeAsync('dial', callResult);
    }
    /**
     * start a call
     * @param {string} phoneNumber - The phone number associcated with this contact
     * @param {string} callInfo
     */
    startInboundCall(phoneNumber, callInfo, flowConfig) {
        callInfo = callInfo || { isOnHold: false };
        flowConfig = flowConfig || { isUnifiedRoutingEnabled: false };
        callInfo.callStateTimestamp = new Date();
        if (!this.state.agentAvailable) {
            const message = `Agent is not available for a inbound call from phoneNumber - ${phoneNumber}`;
            this.log(message);
            return Promise.reject(new Error(message));
        }
        let callAttributes = { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER };
        const id = Math.random().toString(36).substring(5);
        let contact = new Contact({ phoneNumber, id, name: 'Customer '+ id });
        return this.createVoiceCall(undefined, Constants.CALL_TYPE.INBOUND, phoneNumber, callInfo && callInfo.additionalFields).then((data) => {
            callAttributes.voiceCallId = data.voiceCallId;
            const call = new Call(Constants.CALL_TYPE.INBOUND.toLowerCase(), contact, callAttributes, new CallInfo(callInfo), data.vendorCallKey || this.generateCallId());
            call.fromContact = contact;
            call.toContact = this.getCurrentUserContact();
            //delete call.toContact;
            this.addCall(call);
            const callResult = new CallResult({
                call
            });
            //When Unified Routing is enabled, we need to invoke OmniFlow, otherwise regular flow to publish CALL_STARTED event.
            if(flowConfig?.isUnifiedRoutingEnabled) {
                if (this.state.flowConfig == null) {
                    this.state.flowConfig = { ...flowConfig };
                } else {
                    Object.assign(this.state.flowConfig, flowConfig);
                }
                console.log('Inside isUnifiedRoutingEnabled ' + flowConfig.isUnifiedRoutingEnabled);
                var response = this.executeOmniFlowForUnifiedRouting(data, flowConfig);
                console.log('response From execute onmi flow' + response);
            } else {
                console.log('Non UnifiedRouting flow');
                publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED, payload: callResult });
            }
            return this.executeAsync('startInboundCall', callResult);
        });
    }

    getAllPhoneContacts(numOfContactsPerType) {
        let contacts = [];
        for (let i=1; i<=numOfContactsPerType; i++) {
            contacts = contacts.concat(new Contact ({
                id: 'id'+i,
                type: Constants.CONTACT_TYPE.AGENT,
                name : ["Agent Name "]+i,
                phoneNumber: "555555444"+i,
                availability: this.getRandomAvailability()
            }))
        }
        for (let i=numOfContactsPerType+1; i<=numOfContactsPerType*2; i++) {
            contacts = contacts.concat(new Contact ({
                id: 'id'+i,
                type: Constants.CONTACT_TYPE.QUEUE,
                name : "Queue Name "+i,
                queue: "Queue"+i,
                queueWaitTime: (Math.random() * 400).toString()
            }))
        }
        for (let i=numOfContactsPerType*2+1; i<=numOfContactsPerType*3; i++) {
            contacts = contacts.concat(new Contact ({
                id: 'id'+i,
                type: Constants.CONTACT_TYPE.PHONEBOOK,
                name : "Phonebook Entry "+i,
                phoneNumber: "55566644"+i
            }))
        }
        for (let i=numOfContactsPerType*3+1; i<=numOfContactsPerType*4; i++) {
            contacts = contacts.concat(new Contact ({
                id: 'id'+i,
                type: Constants.CONTACT_TYPE.PHONENUMBER,
                name : "Phone Number "+i,
                phoneNumber: "5557774"+i
            }))
        }
        for (let i=numOfContactsPerType*4+1; i<=numOfContactsPerType*5; i++) {
            contacts = contacts.concat(new Contact ({
                endpointARN: 'arn'+i,
                type: Constants.CONTACT_TYPE.PHONENUMBER,
                name : ["ARN "]+i,
                phoneNumber: "5555554"+i
            }))
        }
        return contacts;
    }

    getAllMessagingContacts(numOfContactsPerType) {
        let contacts = [];
        let contactListTypeMap = {
            0: Constants.CONTACT_LIST_TYPE.ALL,
            1: Constants.CONTACT_LIST_TYPE.CONFERENCE,
            2: Constants.CONTACT_LIST_TYPE.TRANSFER
        };
        for (let i=1; i<=numOfContactsPerType; i++) {
            contacts = contacts.concat(new Contact ({
                id: 'id'+i,
                type: Constants.CONTACT_TYPE.AGENT,
                name : ["Agent Name "]+i,
                availability: this.getRandomAvailability(),
                listType: contactListTypeMap[i%3]
            }))
        }
        for (let i=numOfContactsPerType+1; i<=numOfContactsPerType*2; i++) {
            contacts = contacts.concat(new Contact ({
                id: 'id'+i,
                type: Constants.CONTACT_TYPE.QUEUE,
                name : "Queue Name "+i,
                queue: "Queue"+i,
                queueWaitTime: (Math.random() * 400).toString(),
                listType: contactListTypeMap[i%3]
            }))
        }
        for (let i=numOfContactsPerType*2+1; i<=numOfContactsPerType*3; i++) {
            contacts = contacts.concat(new Contact ({
                id: 'id'+i,
                type: Constants.CONTACT_TYPE.PHONENUMBER,
                name : "External Contact "+i,
                phoneNumber: "55566644"+i,
                listType: contactListTypeMap[i%3]
            }))
        }
        return contacts;
    }

    getRandomAvailability() {
        const randomAvailabilityMap = {
            0: Constants.AGENT_AVAILABILITY.AVAILABLE,
            1: Constants.AGENT_AVAILABILITY.BUSY,
            2: Constants.AGENT_AVAILABILITY.OFFLINE,
        }
        return randomAvailabilityMap[Math.floor(Math.random()*3)];
    }

    getActiveCallsObj() {
        const activeCalls = JSON.parse(localStorage.getItem('activeCalls')) || {};
        Object.keys(activeCalls).forEach(callId => {
            if (activeCalls[callId].contact) {
                activeCalls[callId].contact = new Contact(activeCalls[callId].contact);
            } 
            if (activeCalls[callId].toContact) {
                activeCalls[callId].toContact = new Contact(activeCalls[callId].toContact);
            }
            if (activeCalls[callId].fromContact) {
                activeCalls[callId].fromContact = new Contact(activeCalls[callId].fromContact);
            }
            activeCalls[callId].callInfo.callStateTimestamp = activeCalls[callId].callInfo.callStateTimestamp ? new Date(activeCalls[callId].callInfo.callStateTimestamp) : new Date();
            activeCalls[callId].callInfo = new CallInfo(activeCalls[callId].callInfo);
            activeCalls[callId].callAttributes = new PhoneCallAttributes(activeCalls[callId].callAttributes);
            activeCalls[callId] = new PhoneCall(activeCalls[callId]);
        });
        return activeCalls;
    }

    hasActiveCalls(participantType) {
        if (!participantType) {
            return this.state.activeCalls && Object.keys(this.state.activeCalls).length > 0;
        }
        return Object.values(this.state.activeCalls).filter((obj) => obj['callAttributes']['participantType'] === participantType).length > 0;
    }

    /**
     * get agent  configs, for example if mute or recording is supported, phones supported for agent
     */
    getAgentConfig() {
        return this.executeAsync("getAgentConfig", new AgentConfigResult({
            phones: this.state.agentConfig.phones,
            selectedPhone: new Phone (this.state.agentConfig.selectedPhone)
        }));
    }

    /**
     * get agent  configs, for example if mute or recording is supported, phones supported for agent
     */
    getSharedCapabilities() {
        return this.executeAsync("getSharedCapabilities", new SharedCapabilitiesResult({
            hasContactSearch: this.state.capabilities.hasContactSearch,
            hasAgentAvailability: this.state.capabilities.hasAgentAvailability,
            hasQueueWaitTime: this.state.capabilities.hasQueueWaitTime,
            debugEnabled: this.state.capabilities.debugEnabled,
            hasTransferToOmniFlow: this.state.capabilities.hasTransferToOmniFlow,
            hasPendingStatusChange: this.state.capabilities.hasPendingStatusChange,
            hasSFDCPendingState: this.state.capabilities.hasSFDCPendingState
        }));
    }

    /**
     * get agent  configs, for example if mute or recording is supported, phones supported for agent
     */
    getVoiceCapabilities() {
        return this.executeAsync("getVoiceCapabilities", new VoiceCapabilitiesResult({
            hasMute: this.state.capabilities.hasMute,
            hasMerge: this.state.capabilities.hasMerge,
            hasRecord: this.state.capabilities.hasRecord,
            hasSwap:  this.state.capabilities.hasSwap,
            hasSignedRecordingUrl: this.state.capabilities.hasSignedRecordingUrl,
            supportsMos: this.state.capabilities.supportsMos,
            hasSupervisorListenIn: this.state.capabilities.hasSupervisorListenIn,
            hasSupervisorBargeIn: this.state.capabilities.hasSupervisorBargeIn,
            hasBlindTransfer: this.state.capabilities.hasBlindTransfer,
            hasPhoneBook : this.state.capabilities.hasPhoneBook,
            canConsult : this.state.capabilities.canConsult,
            signedRecordingUrl: '',
            signedRecordingDuration: null,
            isDialPadDisabled: this.state.capabilities.isDialPadDisabled,
            isPhoneBookDisabled: this.state.capabilities.isPhoneBookDisabled,
            isHidSupported: this.state.capabilities.isHidSupported,
            hasSetExternalMicrophoneDeviceSetting: this.state.capabilities.hasSetExternalMicrophoneDeviceSetting,
            hasSetExternalSpeakerDeviceSetting: this.state.capabilities.hasSetExternalSpeakerDeviceSetting
        }));
    }

     /**
     * get all active calls
     */
    getActiveCalls() {
        try {
            const activeCalls = this.getActiveCallsObj();
            const result = Object.values(activeCalls);
            return this.executeAsync('getActiveCalls', new ActiveCallsResult({ activeCalls: result }));
        } catch (e) {
            return Promise.reject('Error getting active calls. '+ e); 
        }
        
    }

    /**
     * accept the  call
     * @param {PhoneCall} call
     */
    acceptCall(call){
        let callResult = null;
        if (!this.state.throwError) {
            let callToAccept = this.getCall(call);
            const receiverContact = new Contact({
                phoneNumber: this.state.agentId, 
                id: this.state.agentId, 
                name: this.state.userFullName
            })
            callToAccept.receiverContact = receiverContact;
            callToAccept.toContact = this.getCurrentUserContact();
            /* If it's not internal call , contact is the source of truth of which participant we are rendering*/
            if (callToAccept.callType === 'internalcall') {
                /* If it's an internal call, contact will be ourself. We render the initiator's name passed from startInternalCall */
                callToAccept.contact.name = callToAccept.callInfo.renderContactId;
            }
            const currType = callToAccept.callType.toLowerCase();
            const state = ((
                currType === Constants.CALL_TYPE.CALLBACK.toLowerCase() ||
                currType === Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase()) &&
            callToAccept.state !== Constants.CALL_STATE.CONNECTED) ?
            Constants.CALL_STATE.RINGING : Constants.CALL_STATE.CONNECTED;
            
            callToAccept.state = state;
            // callToAccept.callAttributes.state = state;
            this.log("acceptCall", callToAccept);
            this.addCall(callToAccept);
            this.state.agentAvailable = false;
            if (currType === Constants.CALL_TYPE.TRANSFER.toLowerCase() || 
                currType === Constants.CALL_TYPE.CONSULT.toLowerCase()) {
                this.messageUser(null, USER_MESSAGE.PARTICIPANT_CONNECTED, { 
                    callInfo: callToAccept.callInfo, 
                    callType: currType, 
                    call: callToAccept
                });
            }
            callResult = new CallResult({ call: callToAccept });
            this.updateConferenceUsers(false);
        }
        return this.executeAsync("acceptCall", callResult);
    }

    /**
     * decline call
     * @param {PhoneCall} call
     */
    declineCall(call) {
        this.log("declineCall", call);
        const destroyedCall = this.destroyCall(this.getCall(call), Constants.HANGUP_REASON.PHONE_CALL_ENDED);
        this.state.activeConferenceCalls = [];
        this.state.agentAvailable = true;
        return this.executeAsync("declineCall", new CallResult({ call: destroyedCall }));
    }
    /**
     * end call
     * @param {PhoneCall} call
     * @param {string} agentErrorStatus
     */
    endCall(call, agentErrorStatus) {
        this.log("endCall", call, agentErrorStatus);
        let destroyedCalls = this.processEndCall(call, agentErrorStatus, Constants.HANGUP_REASON.PHONE_CALL_ENDED, true);
        return this.executeAsync("endCall", new HangupResult({ calls: destroyedCalls }));
    }

    /**
     *
     * @param call
     * @param agentErrorStatus
     * @param reason
     * @param messageUsers
     */
    processEndCall(call, agentErrorStatus, reason, messageUsers) {
        let destroyedCalls = [];
        if (!this.state.throwError) {
            if (this.state.isMultipartyAllowed) {
                let callObj = {};
                if (call.callId) {
                    callObj = this.getCall(call);
                    if (callObj.callAttributes &&
                        callObj.callAttributes?.participantType === Constants.PARTICIPANT_TYPE.INITIAL_CALLER &&
                        (!callObj.contact || (this.state.agentId === callObj.contact.id))) {
                        destroyedCalls = this.hangupMultiParty(callObj, reason, agentErrorStatus);
                    } else if (callObj.callType?.toLowerCase() === Constants.CALL_TYPE.CONSULT.toString().toLowerCase() &&
                        callObj.callAttributes?.participantType.toLowerCase() === Constants.PARTICIPANT_TYPE.THIRD_PARTY.toString().toLowerCase()) {
                        destroyedCalls = this.hangupMultiParty(callObj, reason, agentErrorStatus);
                    } else {
                        destroyedCalls = this.destroyCalls(callObj, reason);
                        this.beginWrapup(destroyedCalls[0]);
                    }
                } else {
                    const consultCall = Object.values(this.state.activeCalls).filter((obj) => obj.callAttributes?.isConsultCall === true)[0];
                    if (consultCall) {
                        callObj = consultCall;
                    } else {
                        callObj = this.getCall({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
                    }
                    destroyedCalls = this.hangupMultiParty(callObj, reason, agentErrorStatus);
                }

                if(messageUsers) {
                    this.messageUser(null, USER_MESSAGE.CALL_DESTROYED, {callId: callObj.callId, reason: reason, target: call.callId ? callObj.callInfo.renderContactId : this.state.agentId});
                }
             } else {
                destroyedCalls = this.destroyCalls(call, reason);
                this.beginWrapup(destroyedCalls[0]);
            }
        }
        this.state.agentAvailable = Object.keys(this.state.activeCalls).length === 0;
        return destroyedCalls;
    }
    /**
     * Mute
     */
    mute(call) {
        const isMuted = true;
        return this.processMute(call, isMuted)
    }

    /**
     * Unmute
     */
    unmute(call) {
        const isMuted = false;
        return this.processMute(call, isMuted)
    }

    /**
     * Process mute and unmute initiated my myself
     * @param {*} call 
     * @param {*} isMuted 
     * @returns 
     */
    processMute(call, isMuted) {
        const isGlobal = call ? call.isGlobal : false;
        const isSupervisor = call && call.isSupervisor;
        call = this.updateCallInfo({ isMuted }, call);
        const targetIsPrimaryCaller = this.getPrimaryCall().callId === call.callId;
        /* Find the muting target
         * (1) Muting myself? Check call.isGlobal passed from core. True while clicking on global action, false while clicking on entry mute.
         * (2) Muting my primary call (but not me)? Check call.contact.id for primary call initiator's info
         * (3) Muting someone else: Read the renderContactId
        */
        const target = isGlobal ? this.state.agentId : (targetIsPrimaryCaller && call.contact) ? (call.contact.id ? call.contact.id : call.contact.phoneNumber) : call.callInfo.renderContactId;
        /* Setting target in call.callAttribute and it will be broadcasted to other agents */
        call.callAttributes.target = target;
        /* Broadcast the mute message to all the users */
        const userMessage = isMuted ? USER_MESSAGE.MUTE : USER_MESSAGE.UNMUTE;
        if (this.state.isMultipartyAllowed && isSupervisor === false) {
            this.messageUser(null, userMessage, call, isMuted);
        }
        return this.executeAsync("mute", new MuteToggleResult({ isMuted,  call, isGlobal }));
    }
    /**
     * Process broadcast mute and unmute
     */
    async processBroadcastMute(call, isMuted) {
        /* Read the target param passed in call attribute by the mute initiator */
        const target = call.callAttributes.target;
        /* Find the target call to mute
         * (1) Muting myself? Check isGlobal
         * (2) Muting my primary call (but not me)? Check if the target is primary call contact id
         * (3) Muting someone else? Find that call through renderContactId
         * In (1) (2) we return the same call, only difference is isGlobal
         */
        const isGlobal = this.state.agentId === target;
        const callForTarget = this.getCall({callInfo: {renderContactId: target}})
        const targetIsPrimaryCaller = this.getPrimaryCall().contact.id === target;
        let targetCall = ( isGlobal || targetIsPrimaryCaller ) ? this.getPrimaryCall() : callForTarget;
        targetCall = this.updateCallInfo({ isMuted }, targetCall);
        let payload = await this.executeAsync("mute", new MuteToggleResult({ isMuted, call:targetCall, isGlobal }));
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.MUTE_TOGGLE, payload });
    }

    /**
     * hold the call
     * @param {PhoneCall} call
     */
    hold(call) {
        // TODO - send HOLD_TOGGLE to all participants in MP
        this.updateHoldState(call, true);
        return this.executeAsync("hold", new HoldToggleResult({
            isThirdPartyOnHold: this.isOnHold({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }}),
            isCustomerOnHold: this.isOnHold({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }}),
            calls: this.state.activeCalls
        }));
    }

    /**
     * resume the call
     * @param {PhoneCall} call
     */
    resume(call) {
        this.updateHoldState(call, false);
        return this.executeAsync("resume", new HoldToggleResult({
            isThirdPartyOnHold: this.isOnHold({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }}),
            isCustomerOnHold: this.isOnHold({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }}),
            calls: this.state.activeCalls
        }));
    }
    /**
     * pause recording for the call
     * @param {PhoneCall} call
     */
    pauseRecording(call) {
        const isRecordingPaused = true;
        call = call || this.getCall({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
        if (this.isConsultCall(call)) {
            call = this.getCall({ callAttributes: { isConsultCall : true }});
        } 
        return this.executeAsync("pauseRecording", new RecordingToggleResult({ isRecordingPaused, contactId : call.callId }, this.updateCallInfo({ isRecordingPaused }, call)));
    }
    /**
     * resume recording for the call
     * @param {PhoneCall} call
     */
    resumeRecording(call) {
        const isRecordingPaused = false;
        call = call || this.getCall({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
        if (this.isConsultCall(call)) {
            call = this.getCall({ callAttributes: { isConsultCall : true }});
        }
        return this.executeAsync("resumeRecording", new RecordingToggleResult({ isRecordingPaused, contactId : call.callId }, this.updateCallInfo({ isRecordingPaused }, call)));
    }
    /**
    * Supervise a call
    * @param {SuperviseCallResult} SuperviseCallResult
    */
    superviseCall(parentCall) {
        if (this.hasActiveCalls()) {
            return Promise.reject(new Error(`Agent is not available to supervise a call`));
        }
        const call = new PhoneCall({
            callType: parentCall.callType,
            contact: new Contact({ phoneNumber: parentCall.callType === Constants.CALL_TYPE.INBOUND ? parentCall.from : parentCall.to }),
            callId: parentCall.callId,
            callInfo: new CallInfo({ initialCallId : parentCall.callId, callStateTimestamp: new Date() }),
            callAttributes: { voiceCallId: parentCall.voiceCallId, participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR },
            state: this.state.agentConfig.selectedPhone.type === Constants.PHONE_TYPE.SOFT_PHONE ? Constants.CALL_STATE.CONNECTED : Constants.CALL_STATE.RINGING
        })
        this.addCall(call);
        return this.executeAsync("superviseCall", new SuperviseCallResult({ call }));
    }
    /**
    * Disconnect from a Supervised call
    * @param {SupervisorHangupResult} SupervisorHangupResult
    */
    supervisorDisconnect(supervisedCall) {
        let calls;
        if (!this.state.throwError) {
            calls = this.destroyCalls({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR }});
        }
        return this.executeAsync("supervisorDisconnect", new SupervisorHangupResult({ calls }));
    }

    /**
    * Barge in into a call as a supervisor
    * @param {SuperviseCallResult} SuperviseCallResult
    */
    supervisorBargeIn(supervisedCall) {
        const call = this.getCall({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR }});
        call.callAttributes.hasSupervisorBargedIn = supervisedCall.isBargedIn = true;
        supervisedCall.supervisorName = this.state.userFullName;
        this.addCall(call);
        this.messageUser(null, USER_MESSAGE.CALL_BARGED_IN, supervisedCall);
        return this.executeAsync("supervisorBargeIn", new SuperviseCallResult({ call }));
    }

    /**
     * Return true if a call is on hold. If the call does not exist return undefined
     * @param {PhoneCall} call
     * @return true if a call is on hold
     */
    isOnHold(call) {
        try {
            return this.getCall(call).callAttributes.isOnHold;
        } catch(e) {
            return undefined;
        }
    }
    /**
     * @param {PhoneCall} activeCall call object or call index
     * @param {boolean} onHold
     */
    updateHoldState(activeCall, onHold) {
        const call = this.getCall(activeCall);
        call.callAttributes.isOnHold = onHold;
        call.callInfo.isOnHold = onHold;
        this.addCall(call);
    }
    /**
     * swap calls
     * @param {PhoneCall} call1 first call to be swapped
     * @param {PhoneCall} call2 second call to be swapped
     */
    swapCalls(call1, call2) {
        const activeCall1 = this.getCall(call1);
        const activeCall2 = this.getCall(call2);
        this.updateHoldState(call1, !activeCall1.callAttributes.isOnHold);
        this.updateHoldState(call2, !activeCall2.callAttributes.isOnHold);
        return this.executeAsync("swapCalls", new HoldToggleResult({
            isThirdPartyOnHold: this.isOnHold(call1),
            isCustomerOnHold: this.isOnHold(call2),
            calls: this.state.activeCalls
        }));
    }
    
    /**
     * join calls
     * @param {PhoneCall[]} calls to be joined
     */
    conference(callArray) {
        const calls = callArray || Object.values(this.state.activeCalls);
        let holdToggleResult;
        // there is a transfer call to merge or consult call to merge
        if (this.state.isMultipartyAllowed && (this.hasConsultCall(calls) || Object.keys(this.state.activeCalls).length === 2)) {
            let callToMerge;
            try {
                callToMerge = this.getCall({ callAttributes: { isConsultCall : true }});
            } catch(error) {
                callToMerge = this.getCall({ callAttributes: { participantType : Constants.PARTICIPANT_TYPE.THIRD_PARTY }});
            }

            if (callToMerge) {
                this.mergeConsultCall(callToMerge);
                // change consult call participantType
                callToMerge.callAttributes.participantType = Constants.PARTICIPANT_TYPE.THIRD_PARTY;
                this.messageUser(null, USER_MESSAGE.MERGE, { consultCall: callToMerge, activeConferenceCalls: Object.values(this.state.activeCalls) });
            }
            // When call is merged and primary call is on Hold, we should resume the primary call
            let primaryCall = this.getPrimaryCall();
            this.updateHoldState(primaryCall, false);
        } else {
            calls.forEach((call) => {
                this.updateHoldState(call, false);
            });
        }

        //TODO: update HoldToggleResult for Consult
        holdToggleResult = new HoldToggleResult({
            isThirdPartyOnHold: false,
            isCustomerOnHold: false
        });

        if (this.state.isMultipartyAllowed) {
            holdToggleResult.calls = this.state.activeCalls;
            holdToggleResult.isCallMerged = true;
        }

        return this.executeAsync("conference", holdToggleResult);
    }

    hasConsultCall(calls) {
        return (
            this.state.isConsultAllowed &&
            this.state.capabilities.canConsult &&
            calls?.some(call => call?.callAttributes?.isConsultCall === true)
        );
    }

    mergeConsultCall(consultCall) {
        consultCall.callAttributes.isConsultCall = false;
        consultCall.callType = Constants.CALL_TYPE.ADD_PARTICIPANT;
        consultCall.callAttributes.isAutoMergeOn = true;
        consultCall.reason = Constants.HANGUP_REASON.PHONE_CALL_ENDED;
        let callToUpdate = this.state.activeCalls[consultCall.callId];
        if (callToUpdate) {
            let params = {
                callAttributes: {
                    isConsultCall: false,
                    isAutoMergeOn: true,
                    isOnHold: false,
                    participantType: consultCall.callAttributes.participantType
                },
                callInfo: {
                    isOnHold: false
                },
                callType: Constants.CALL_TYPE.ADD_PARTICIPANT,
                reason: Constants.HANGUP_REASON.PHONE_CALL_ENDED,
            }
            for (const key in params) {
                callToUpdate[key] = typeof params[key] === 'object' ? Object.assign({}, callToUpdate[key], params[key]) : params[key];
            }
        } else {
            this.addCall(consultCall);
            this.updateHoldState(consultCall, false);
        }
    }

    /**
     * set agent status
     * @param {string} agentStatus agent status, Constants.AGENT_STATUS.ONLINE or Constants.AGENT_STATUS.OFFLINE
     * @param {AgentStatusInfo} agentStatusInfo object contains statusId, statusApiName and statusName
     * @param {boolean} enqueueNextState true if the state should be enqueued, which will update the agent's status after a call ends
     */
    setAgentStatus(agentStatus, agentStatusInfo, enqueueNextState) {
        this.agentStatus = agentStatus;
        this.toggleAgentPresence(!(agentStatus === Constants.AGENT_STATUS.OFFLINE));
        return this.executeAsync("setAgentStatus", new GenericResult({
            success: true
        }));
    }
    /**
     * send digits to the active call
     * @param {string} digits - digits to be sent (i.e. 123#)
     */
    sendDigits(digits) {
        return this.executeAsync("sendDigits");
    }
    /**
     * Get Agent Phone Book Contacts
     */
    getPhoneContacts(filter) {
        let onlineContacts = [];
        this.state.onlineUsers.forEach((user) => {
            if (this.state.agentId !== user) {
                onlineContacts = onlineContacts.concat(new Contact({
                    id: user,
                    type: Constants.CONTACT_TYPE.AGENT,
                    name : this.state.userFullNames.get(user),
                    availability: "AVAILABLE",
                    phoneNumber: user
                }))
            }
        })
        let contacts = this.filterContacts(onlineContacts.concat(this.state.phoneContacts), filter) ;
        return this.executeAsync("getPhoneContacts", new PhoneContactsResult({
            contacts, contactTypes: this.state.contactTypes
        }));
    }
    /**
     * add participant to call through a new contact
     * @param {Contact} contact - new contact
     * @param {PhoneCall} call - call to be transferred
     * @param {boolean} isBlindTransfer - True if blind transfering a call and hanging up upon transfer
     */
    async addParticipant(contact, call, isBlindTransfer) {
        const parentCall = this.getCall(call);
        const isAutoMergeOn = call.callAttributes?.isAutoMergeOn;
        const callAttributes = {
            ...parentCall.callAttributes,
            isAutoMergeOn,
            isBlindTransfer,
        };
        const initiatorContact = new Contact({
            phoneNumber: this.state.agentId, 
            id: this.state.agentId, 
            type: this.state.type,
            name: this.state.userFullName
        })
        let isExternalTransfer;
        let callInfo = { ...(parentCall.callInfo ? new CallInfo(parentCall.callInfo) : {}), 
            renderContact: initiatorContact, renderContactId: contact.id};
        if (callInfo.isExternalTransfer !== undefined) {
            isExternalTransfer = callInfo.isExternalTransfer;
        } else if(contact) {
            isExternalTransfer = !!contact.phoneNumber;
        }
        callInfo.isExternalTransfer = isExternalTransfer;
        callInfo.callStateTimestamp = new Date();
        callInfo.initialCallId = parentCall.callId;
        let additionalFields = callInfo.additionalFields ? callInfo.additionalFields : parentCall.callInfo && parentCall.callInfo.additionalFields;
        let transferCall = await this.createVoiceCall(parentCall.callId, Constants.CALL_TYPE.TRANSFER, parentCall.phoneNumber, additionalFields);
        let transferTo = contact.id;
        if(contact.type === Constants.CONTACT_TYPE.FLOW) {
            let routingInstruction = await this.executeOmniFlow(transferCall, contact.id);
            transferTo = routingInstruction.agent || routingInstruction.queue;
        }
        if (!contact.id) {
            contact.id = Math.random().toString(36).substring(5);
        }

        //newTransferVendorkey is created so that we dont have generate vendor key for transfer call everytime.
        let newTransferVendorkey = transferCall.vendorCallKey || this.generateCallId();

        /*
         executeOmniFlow API is required for Unified routing. Adding it here will take care of warm & Blind transfer.
         */
        if(this.state?.flowConfig?.isUnifiedRoutingEnabled) {
            let callInfoData = {
                transferTo,
                voiceCallId : newTransferVendorkey
            };
            let flowConfigData = {
                dialedNumber : this.state.flowConfig.dialedNumber
            };
            await this.executeOmniFlowForUnifiedRouting(callInfoData,flowConfigData);
        }
        
        if (isBlindTransfer) {
            if (this.state.onlineUsers.includes(transferTo)) {
                this.messageUser(transferTo, USER_MESSAGE.CALL_STARTED, {phoneNumber: parentCall.phoneNumber, callId: newTransferVendorkey, voiceCallId: transferCall.voiceCallId});
            } else{
                //Only for unified routing - Transfer to queue use case is supported in demo connector
                if(this.state?.flowConfig?.isUnifiedRoutingEnabled) {
                    // to handle Transfer to queue use case
                    this.messageUser(null, USER_MESSAGE.CALL_STARTED, {
                        phoneNumber: parentCall.phoneNumber,
                        callId: newTransferVendorkey,
                        voiceCallId: transferCall.voiceCallId,
                        flowConfig: this.state.flowConfig
                    });
                }
            }
            const destroyedCall = this.destroyCall(call, Constants.HANGUP_REASON.PHONE_CALL_ENDED);
            this.log("addParticipant - cold transfer (destroyed call)", destroyedCall);
            this.beginWrapup(destroyedCall);
            return this.executeAsync("addParticipant", new ParticipantResult({
                contact: contact,
                phoneNumber: contact.phoneNumber,
                callInfo: new CallInfo(callInfo),
                callAttributes,
                initialCallHasEnded: true,
                callId: call.callId
            }));
        }

        callAttributes.isOnHold = parentCall.callInfo.isOnHold = !this.state.isMultipartyAllowed && !isAutoMergeOn; //FIXME: remove callAttributes.isOnHold in core, we don't need isOnHold in two places
        callInfo.isOnHold = false;

        const parentVoiceCallId = callAttributes.voiceCallId;
        if (this.state.isMultipartyAllowed) {
            callInfo = Object.assign(
                callInfo,
                JSON.parse(localStorage.getItem('callInfo')),
                {
                    isRecordingPaused : parentCall.callInfo ? parentCall.callInfo.isRecordingPaused : false
                }
            );
        }
        const newCall = new Call(Constants.CALL_TYPE.ADD_PARTICIPANT, contact, { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY, voiceCallId: parentVoiceCallId, isAutoMergeOn }, new CallInfo(callInfo), transferCall.vendorCallKey || this.generateCallId());
        newCall.parentCallId = parentCall.callId;
        newCall.callAttributes.isOnHold = false; // same FIXME
        newCall.state = Constants.CALL_STATE.TRANSFERRING;
        newCall.fromContact = initiatorContact;

        this.log("addParticipant to parent voiceCall " + parentVoiceCallId, newCall);
        this.addCall(parentCall);
        if (this.state.onlineUsers.includes(transferTo)) {
            this.messageUser(transferTo, USER_MESSAGE.CALL_STARTED, {phoneNumber: this.state.userFullName, callInfo, contact, initiatorContact, callId: newCall.callId, voiceCallId: transferCall.voiceCallId, activeConferenceCalls: isAutoMergeOn ? Object.values(this.state.activeCalls) : [], flowConfig: this.state.flowConfig });
        }else{
            if(this.state?.flowConfig?.isUnifiedRoutingEnabled) {
                // to handle Transfer to queue use case
                this.messageUser(null, USER_MESSAGE.CALL_STARTED, {
                    phoneNumber: this.state.userFullName,
                    callInfo,
                    contact,
                    initiatorContact,
                    callId: newCall.callId,
                    voiceCallId: transferCall.voiceCallId,
                    activeConferenceCalls: isAutoMergeOn ? Object.values(this.state.activeCalls) : [],
                    flowConfig: this.state.flowConfig
                });
            }
        }
        this.addCall(newCall);
        return this.executeAsync("addParticipant", new ParticipantResult({
            contact: contact,
            phoneNumber: contact.phoneNumber,
            callInfo: new CallInfo(callInfo),
            callAttributes,
            initialCallHasEnded: callAttributes.initialCallHasEnded,
            callId: newCall.callId
        }));
    }

    onAgentWorkEvent(agentWork) {
        this.messageUser(null, USER_MESSAGE.AGENT_WORK_NOTIFICATION, agentWork);
        return this.executeAsync("onAgentWorkEvent", agentWork);
    }

    executeOmniFlow(call, flowName) {
        return  fetch('/api/executeOmniFlow', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ flowName:flowName, voiceCallId:call.vendorCallKey || this.generateCallId()})
        }).then(response => response.json()).then((payload) => {
            return payload;
        }).catch((err) => {
            return Promise.reject(err);
        });
    }

    //This is a new method where we are passing all the flowInput parameters.
    executeOmniFlowForUnifiedRouting(call, flowConfig) {
        var dialedNumber = flowConfig.dialedNumber;
        var flowDevName = flowConfig.flowDevName;
        var fallbackQueue = flowConfig.fallbackQueue;
        let requestObject = {
            dialedNumber: dialedNumber,
            voiceCallId:call.voiceCallId,
            fallbackQueue: fallbackQueue
        };
        if(call?.transferTo){
            requestObject.transferTarget = call.transferTo;
        }
        if (flowConfig?.isTransferFlow) {
            requestObject.flowDevName = flowDevName;
        } else {
            requestObject.flowName = flowDevName;
        }

        return  fetch('/api/executeOmniFlow', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestObject)
        }).then(response => response.json()).then((payload) => {
            return payload;
        }).catch((err) => {
            console.log('ERR ',err);
            return Promise.reject(err);
        });
    }
/*



*/ 
    /**
     * Create a Voice call
     */
     createVoiceCall(parentCallId, callType, caller, additionalFields) {
        let url = '/api/createVoiceCall?caller=' + caller + '&type=' +  callType  + (parentCallId ? '&parentCallId=' + parentCallId : '') + (additionalFields  ? '&additionalFields=' + additionalFields : ''); // Consider passing the call attributes through the body if there are issues with special characters in the string 
        return  fetch(url, {
            headers: {
                'Strict-Transport-Security': 'max-age=31536000'
            }
        }).then(response => response.json())
        .then((data) => {
            if (!data.voiceCallId){
                this.log("Could not contact Service Cloud Real ,Time. VoiceCall will be created by Salesforce Service Degradation Service.")
            }
            return data;
        }).catch((err) => {
            return Promise.reject(err);
        });
    }
    /**
     * connect a participant
     */
    connectParticipant(callInfo, callType, call) {
        // Verify if this participant is newly joined.
        if (!this.hasActiveCalls()) {
            return; //need to have at least an initial call to connect a participant
        }

        // avoid connecting consult call to an agent who did not initiate the conversation
        if (call?.callType === Constants.CALL_TYPE.CONSULT &&
            Object.keys(this.state.activeCalls).indexOf(call.callId) === -1) {
            return;
        }

        let receiverContact;
        if (call) {
            if (call.receiverContact) {
                call.callInfo.renderContactId = call.receiverContact.id;
                receiverContact = call.receiverContact;
            } else {
                if (call.contact && call.contact.id) {
                    call.callInfo.renderContactId = call.contact.id;
                } else if (call.contact && call.contact.phoneNumber) {
                    call.callInfo.renderContactId = call.contact.phoneNumber;
                }
            }
        }

        if (this.state.isMultipartyAllowed && call && !this.state.activeCalls[call.callId]) {
            call.callType = Constants.CALL_TYPE.ADD_PARTICIPANT;
            call.callAttributes.participantType = Constants.PARTICIPANT_TYPE.THIRD_PARTY;
            this.addCall(call);
        }
        if (callType === Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase()) {
            call = this.getCall({...(call || {}), callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
            call.state = Constants.CALL_STATE.CONNECTED;
        } else if (callType === Constants.CALL_TYPE.CONSULT.toLowerCase()) {
            call = this.getCall({...(call || {}),callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }});
            call.state = Constants.CALL_STATE.CONNECTED;
        } else {
            call = this.getCall({...(call || {}),callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }});
            call.state = Constants.CALL_STATE.TRANSFERRED;
        }      
        this.log("connectParticipant", call);
        this.addCall(call);
        if (!callType) {
            callType = call.callType.toLowerCase();
        }
        if (callType !==  Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase() && callType !==  Constants.CALL_TYPE.CONSULT.toLowerCase()) {
            let publishedCallInfo = call.callInfo || {};
            publishedCallInfo.callStateTimestamp = publishedCallInfo.callStateTimestamp ? new Date(publishedCallInfo.callStateTimestamp) : new Date();
            publishEvent({eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_CONNECTED, payload: new ParticipantResult({
                contact: receiverContact ? receiverContact : call.contact,
                phoneNumber: call.contact && call.contact.phoneNumber,
                callAttributes: call.callAttributes,
                callInfo: new CallInfo(publishedCallInfo),
                initialCallHasEnded: call.callAttributes && call.callAttributes.initialCallHasEnded,
                callId: call.callId
            })});
        } else {
            publishEvent({eventType: Constants.VOICE_EVENT_TYPE.CALL_CONNECTED, payload: new CallResult({call})});
        }
    }
    /**
     * connect the last added supervisor
     */
    connectSupervisor() {
        const call = this.getCall({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR }});
        call.state = Constants.CALL_STATE.CONNECTED;
        this.log("connectSupervisor", call);
        this.addCall(call);
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.SUPERVISOR_CALL_CONNECTED, payload: new SuperviseCallResult({ call })});
    }

    /**
     * Simulate removing the participantType from the conversation
     * @param {PARTICIPANT_TYPE} participantType need to be removed
     * @param call
     */
    removeParticipant(participantType, call) {
        call = this.getCall({...(call || {}), callAttributes: { participantType: participantType }});
        const reason = Constants.HANGUP_REASON.PHONE_CALL_ENDED;
        const destroyedCall = this.destroyCall(call, reason);
        this.log("removeParticipant", call);
        if (this.state.isMultipartyAllowed) {
            this.messageUser(null, USER_MESSAGE.CALL_DESTROYED, {callId: call.callId, reason: reason});
        }
        this.state.agentAvailable = Object.keys(this.state.activeCalls).length === 0;
        this.beginWrapup(destroyedCall);
        
        const payload = new CallResult({ call: destroyedCall });
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_REMOVED, payload });
        return this.executeAsync("removeParticipant", payload);
    }

    removeSupervisor() {
        const call = this.getCall({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR }});
        const destroyedCall = this.destroyCall(call);
        this.log("removeSupervisor", call);
        const payload = new SupervisorHangupResult({ calls: destroyedCall });
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.SUPERVISOR_HANGUP, payload });
        return this.executeAsync("removeSupervisor", payload);
    }

    /**
     * Simulate connecting caller
     */
    connectCall(callInfo, callToConnect) {
        const call = callToConnect || this.getCall({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
        call.state = Constants.CALL_STATE.CONNECTED;
        call.callInfo = Object.assign(call.callInfo, callInfo);
        // call.callAttributes.state = Constants.CALL_STATE.CONNECTED;
        this.addCall(call);
        this.log("connectCall", call);
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.CALL_CONNECTED, payload: new CallResult({ call })});
    }
    /**
     * Simulate hanging up the phone from the agent (either decline or end the call from hardphone)
     */
    hangup(reason, agentErrorStatus) {
        let destroyedCalls = this.destroyCalls({callAttributes: { participantType: Constants.PARTICIPANT_TYPE.AGENT }}, reason);
        destroyedCalls.map((call) => {
            call.callInfo.isSoftphoneCall = false;
            call.agentStatus = agentErrorStatus;
            call.reason = reason;
            return call;
        });
        this.state.agentAvailable = Object.keys(this.state.activeCalls).length === 0;
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.HANGUP, payload: new HangupResult({ calls: destroyedCalls })});
        this.beginWrapup(destroyedCalls[0]);
        return this.executeAsync("hangup", destroyedCalls);
    }

    /**
     * Hang up user's call in a multiparty
     * @param call
     * @param reason
     * @param agentErrorStatus
     * @returns {?[]}
     */
    hangupMultiParty(call, reason, agentErrorStatus) {
        let destroyedCalls = this.getActiveCallsList();
        this.processCallsToDestroy(destroyedCalls, reason);
        destroyedCalls.map((call) => {
            call.callInfo.isSoftphoneCall = false;
            call.agentStatus = agentErrorStatus;
            call.reason = reason;
            return call;
        });
        this.state.agentAvailable = Object.keys(this.state.activeCalls).length === 0;
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.HANGUP, payload: new HangupResult({ calls: [call] })});
        this.beginWrapup(call);
        return destroyedCalls;
    }

    isConsultCall(call) {
        return this.state.isConsultAllowed && this.state.capabilities.canConsult &&
            (call?.callAttributes?.isConsultCall === true || call?.callType?.toLowerCase() === Constants.CALL_TYPE.CONSULT.toLowerCase()) ;
    }

    initiateHangupMultiParty(reason, agentErrorStatus) {
        let call;
        try {
            call = this.getCall({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
        } catch (e) {
            call = this.getCall({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }});
        } 
        this.hangupMultiParty(call, reason, agentErrorStatus);
        this.messageUser(null, USER_MESSAGE.CALL_DESTROYED, {callId: call.callId, reason: reason});
    }

    /**
     * begin after call wrap-up
     * @param {PhoneCall} call - call to begin wrap-up
     * 
     * The implementation publishes AFTER_CALL_WORK_STARTED inside a setTimeout to 
     * give demo connector enough time to finish executing HANGUP/END_CALL code/events. 
     */
    beginWrapup(call) {
        setTimeout(()=> {
            if (this.state.agentAvailable) {
                publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.AFTER_CALL_WORK_STARTED, payload: { callId: call.callId }});
            }
        },0);
    }

    /**
     * 
     * end after call wrap-up
     */
    endWrapup() {
        this.log("endWrapup");
    }

    /**
     * send  message to Voice Call Record Home
     * @param {object} message - Message
     */
    publishMessage(message) {
        this.log("publishMessage", message);
        publishEvent({ eventType: Constants.SHARED_EVENT_TYPE.MESSAGE, payload: message });
    }
    /**
     * Handle  message received from sfdc component
     * @param {object} message - Message
     */
    handleMessage(message) {
        const requestBroadcastChannel = new BroadcastChannel('rc-request');
        requestBroadcastChannel.postMessage({type: Constants.SHARED_EVENT_TYPE.MESSAGE, payload: message});
        this.log("handleMessage", message);
    }

    getSignedRecordingUrl(recordingUrl, vendorCallKey, callId) {
        return this.executeAsync("getSignedRecordingUrl", new SignedRecordingUrlResult({
            success: this.state.capabilities.hasSignedRecordingUrl,
            url: this.state.capabilities.signedRecordingUrl,
            duration: parseInt(this.state.capabilities.signedRecordingDuration),
            callId
        }));
    }

    /**
     * Simulate callback
     */
    requestCallback(payload) {
        const { phoneNumber } = payload;
        const callInfo = new CallInfo({ callStateTimestamp: new Date() });
        const call = new PhoneCall({ callId: this.generateCallId(),
            phoneNumber,
            callInfo,
            callType: Constants.CALL_TYPE.CALLBACK.toLowerCase(),
            contact: new Contact({ phoneNumber }),
            callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER } });
        this.addCall(call);
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.QUEUED_CALL_STARTED, payload: new CallResult({ call })});
    }

    /**
     * Simulate preview call
     */
    previewCall(payload) {
        const { phoneNumber } = payload;
        const callInfo = new CallInfo({ callStateTimestamp: new Date() });
        const call = new PhoneCall({ callId: this.generateCallId(),
            phoneNumber,
            callInfo,
            callType: Constants.CALL_TYPE.OUTBOUND.toLowerCase(),
            contact: new Contact({ phoneNumber }),
            callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER, dialerType: Constants.DIALER_TYPE.OUTBOUND_PREVIEW } });
        this.addCall(call);
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.PREVIEW_CALL_STARTED, payload: new CallResult({ call })});
    }

    /**
     * Simulate update Audio Stats for MOS
     */
    updateAudioStats(audioStats) {
        this.log("updateAudioStats", audioStats);
        let statsArray = [];
        audioStats.stats.forEach(stats => {
            let inputChannelStats;
            let outputChannelStats;
            if (stats.inputChannelStats) {
                inputChannelStats = new StatsInfo(stats.inputChannelStats);
            }
            if (stats.outputChannelStats) {
                outputChannelStats = new StatsInfo(stats.outputChannelStats);
            }
            statsArray.push(new AudioStatsElement({inputChannelStats, outputChannelStats}));
        });
        const payload = new AudioStats({stats: statsArray, callId: audioStats.callId, isAudioStatsCompleted: audioStats.isAudioStatsCompleted});
        publishEvent({ eventType: Constants.VOICE_EVENT_TYPE.UPDATE_AUDIO_STATS, payload: payload });
    }

    /**
     * cache the value of remove participant variant for the third party transfer participant
     * This allows disabling the remove participant button during the dialing phase of a transfer call. 
     */
    updateRemoveTransferCallParticipantVariant(variant) {
        this.state.updateRemoveTransferCallParticipantVariant = variant;
    }

    publishSetAgentStatus(statusId) {
        publishEvent({ eventType: "SET_AGENT_STATUS", payload: new AgentStatusInfo({statusId}) });
    }

    publishCallBargedInEventToAgents(parentCall) {
        publishEvent({ eventType: "CALL_BARGED_IN", payload: new SupervisedCallInfo(parentCall)});
    }

    isSupervisorListeningIn() {
        return this.state.capabilities.hasSupervisorListenIn && Object.values(this.state.activeCalls || {}).some(
            (obj) => obj?.callAttributes?.participantType === Constants.PARTICIPANT_TYPE.SUPERVISOR
        );
    }
}