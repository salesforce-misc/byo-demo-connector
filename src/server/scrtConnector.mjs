/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/*
 * SCRT2 connection utility
 * @author vtikoo
 */
import JWT from 'jsonwebtoken';
import customEnv from 'custom-env';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

customEnv.env();

const tenantInfo = {
    scrtBaseUrl: '',
    orgId: '',
    callCenterName: ''
};

const getScrtUrl = (info) => {
    const telephonyApiPostfix = 'telephony/v1';
    return info.scrtBaseUrl + "/" + telephonyApiPostfix;
    //return "http://127.0.0.1:6324" + "/" + telephonyApiPostfix;
};

const getAxiosClient = (info) => {
    let scrtUrl = getScrtUrl(info);
    return axios.create({ baseURL: getScrtUrl(info) });
}

let vendorCallKey = '';
let voiceCallId = '';
let onlineUserIds = {};
let parentChildCallId = {};

const getToken = () => {
    const privateKey = fs.readFileSync(path.resolve() + '/src/server/private.key');
    const signOptions = {
        issuer: tenantInfo.orgId,
        subject: tenantInfo.callCenterName,
        expiresIn: '4h',
        algorithm: 'RS256'
    };
    return JWT.sign({}, privateKey, signOptions);
};

export const ScrtConnector = {

    setOnlineUserIds(userEmail, user) {
        onlineUserIds[userEmail] = user;
    },

    removeOnlineUserIds(userEmail) {
        delete onlineUserIds[userEmail];
    },

    configureTenantInfo(params) {
        tenantInfo.scrtBaseUrl = params.scrtBaseUrl;
        tenantInfo.orgId = params.orgId;
        tenantInfo.callCenterName = params.callCenterName;

        let updateResult = '';
        Object.keys(tenantInfo).forEach( key => {
            updateResult = updateResult + `${key} : ${tenantInfo[key]}\n`;
        });
        console.log(getToken());
        return updateResult;
    },

    createVoiceCall(params) {
        const mockedVoiceCall = process.env.OVERRIDE_VOICECALLID;
        if (mockedVoiceCall) {
            return Promise.resolve({
                data: { voiceCallId: mockedVoiceCall }
            });
        }
        vendorCallKey = Math.random().toString(36).substring(7);
        const fieldValues = {
            callCenterApiName: tenantInfo.callCenterName,
            initiationMethod: params.type === "inbound" ? "Inbound" : params.type,
            vendorCallKey,
            to: params.to ? params.to : process.env.CALL_CENTER_NO,
            from: params.caller,
            startTime: new Date().toISOString(),
            callAttributes: params.additionalFields,
            participants: [{
                participantKey: params.caller,
                type: "END_USER"
            }]
        };
        if(params.parentCallId) {
            fieldValues.parentVoiceCallId = params.parentCallId;
            parentChildCallId[vendorCallKey.toString()] = params.parentCallId;
        }
        if(params.callOrigin) {
            fieldValues.callOrigin = params.callOrigin;
        }
        const headers = {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                'Telephony-Provider-Name': 'demo-connector'
            }
        };
        console.log("Field Values for creating a Voice Call : " + JSON.stringify(fieldValues));
        
        return getAxiosClient(tenantInfo).post('/voiceCalls', fieldValues, headers).then(response => {
            voiceCallId = response.data.voiceCallId;
            response.data.vendorCallKey = vendorCallKey;
            console.log("Voice call created : " + JSON.stringify(response.data));
            return response;
        });
    },
    
    createTranscription(params) {
        const startTime = Math.ceil(new Date().getTime());
        const endTime = Math.ceil(new Date().getTime()) + 25000;
        const headers = {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                'Telephony-Provider-Name': 'demo-connector'
            }
        };
        let participantId = '';
        let vendorCallKeyApi = params.vendorCallKey ? params.vendorCallKey : vendorCallKey;

        switch(params.senderType) {
            case 'END_USER':
                participantId = this.getParentVendorKey(vendorCallKeyApi) + "END_USER";
                break;
            case 'HUMAN_AGENT':
                participantId = onlineUserIds[params.metaData].userId;
                vendorCallKeyApi = this.getParentVendorKey(vendorCallKeyApi);
                break;
            case 'VIRTUAL_AGENT':
            case 'SUPERVISOR':
                participantId = this.getParentVendorKey(vendorCallKeyApi)
                break;
            case 'EXTERNAL_USER':
                participantId = params.metaData;
                vendorCallKeyApi = this.getParentVendorKey(vendorCallKeyApi);
                break;
        }
        const fieldValues = {
            messageId: params.messageId,
            content: params.content,
            senderType: params.senderType,
            startTime,
            endTime,
            participantId
        };
        console.log("Field Values for creating transcripts : " + JSON.stringify(fieldValues));
        return vendorCallKeyApi && participantId ?
            getAxiosClient(tenantInfo).post(`/voiceCalls/${vendorCallKeyApi}/messages`, fieldValues, headers).then((response) => {
                console.log("Transcription added : " + JSON.stringify(response.data));
                return response;
            }) : Promise.reject('No active call');
    },

    getParentVendorKey(callId) {
        if (parentChildCallId[callId]) {
            return this.getParentVendorKey(parentChildCallId[callId]);
        }
        return callId;
    },

    sendRealtimeConversationEvents(params) {
        const headers = {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                'Telephony-Provider-Name': 'demo-connector'
            }
        };

        let realtimeConversationEvents = params.eventsArray;
        realtimeConversationEvents.forEach((realtimeConversationEvent) => {
            if (!realtimeConversationEvent.startTime) {
                realtimeConversationEvent.startTime = new Date().getTime();
            }
        });

        const fieldValues = {
            service: params.service,
            persist: params.persist,
            events: realtimeConversationEvents
        };
        console.log("Field Values for sendRealtimeConversationEvents: " + JSON.stringify(fieldValues));
        return vendorCallKey ?
            getAxiosClient(tenantInfo).post(`/voiceCalls/${vendorCallKey}/realtimeConversationEvents`, fieldValues, headers).then((response) => {
                console.log("Response for sendRealtimeConversationEvents: " + JSON.stringify(response.data));
                return response;
            }) : Promise.reject('sendRealtimeConversationEvents failed');
    },
    
    updateVoiceCall(params) {
        const fieldValues = {};

        if(params.recordingUrl) {
            fieldValues.recordingLocation = params.recordingUrl;
        }

        if(params.agentInteractionDuration) {
            fieldValues.agentInteractionDuration = params.agentInteractionDuration;
            fieldValues.totalHoldDuration = params.totalHoldDuration;
        }

        if(params.totalRecordingDuration) {
            fieldValues.totalRecordingDuration = params.totalRecordingDuration;
        }
        
        if(params.callOrigin) {
            fieldValues.callOrigin = params.callOrigin;
        }

        if(params.isActiveCall === true) {
            fieldValues.isActiveCall = true;
        } else if(params.isActiveCall != undefined) {
            fieldValues.isActiveCall = params.isActiveCall;
        }

        if(params.endTime) {
            fieldValues.endTime = params.endTime;
        }

        if(params.startTime) {
            fieldValues.startTime = params.startTime;
        }
        
        voiceCallId = params.voiceCallId ? params.voiceCallId : voiceCallId;
        const headers = {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                'Telephony-Provider-Name': 'demo-connector'
            }
        };
        
        console.log("Field Values for updating Voice call : " + JSON.stringify(fieldValues));
        
        return voiceCallId ?
            getAxiosClient(tenantInfo).patch(`/voiceCalls/${voiceCallId}`, fieldValues, headers).then((response) => {
                console.log("Voice Call updated successfully : " + JSON.stringify(response.data));
                return response;
            }).catch((error) => {
                console.error("Voice Call update failed:", error.message);
                throw error;
            }) : Promise.reject('No active call');
    },

    executeOmniFlow(params) {
        const fieldValues = {};

        if(params.fallbackQueue) {
            fieldValues.fallbackQueue = params.fallbackQueue; 
        }

        if(params.flowName) {
            fieldValues.flowName = params.flowName; 
        }

        if(params.flowDevName) {
            fieldValues.flowDevName = params.flowDevName; 
        }

        voiceCallId = params.voiceCallId ? params.voiceCallId : voiceCallId;

        if(params.dialedNumber) {
            fieldValues.dialedNumber = params.dialedNumber;
        }

        if(params.transferTarget) {
            fieldValues.flowInputParameters = {
                transferTarget: params.transferTarget
            };
        }

        const headers = {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                'Telephony-Provider-Name': 'demo-connector'
            }
        };
        console.log("Field Values for executing  omni flow : " + JSON.stringify(fieldValues));
        return voiceCallId ?
            getAxiosClient(tenantInfo).patch(`/voiceCalls/${voiceCallId}/omniFlow`, fieldValues, headers).then((response) => {
                console.log("Omni Flow executed : " + JSON.stringify(response.data));
                return response;
            }) : Promise.reject('Execute Omni Flow Failed');
    },

    sendVoiceMail(params) {
    
        // For sending a voice mail Create a inbound Voice Call and saving vendorCallKey and voiceCallId
        return this.createVoiceCall({type:"inbound", to: params.dialedPhoneNumber, caller: params.caller}).then(() => {

            // Update Voice call with Call Origin as Voice Mail with isActiveCall as true as there are more updates ahead like transcription and recording
            return this.updateVoiceCall({isActiveCall: true, callOrigin:'Voicemail', startTime: new Date().toISOString(), endTime : new Date(new Date().getTime() + 61000).toISOString()}).then(() => {
                    
                    // Add Transcripts in single sendMessage API call or with multiple calls for each utterance
                    return this.createTranscription({phoneNumber: params.caller, content: params.transcripts, messageId: Math.random().toString(36).substring(10), senderType:'END_USER'}).then(() => {
                        
                        // Route the voice mail throuh omni by executing ExecuteOmniFlow api. Make sure voice mail  routing configuration is defined for dialed phone number in contact  enter details page
                        return this.executeOmniFlow({dialedNumber: params.dialedPhoneNumber}).then(() => {
                            
                            // Finally update the Voice mail with  all remaining  details like recording details, duration etc. This will mark the conversation completed
                            return this.updateVoiceCall({ recordingUrl: params.recordingUrl, totalRecordingDuration: parseInt(params.recordingLength) }).then((response) => {
                                return Promise.resolve(response);
                            });

                        });

                    });

            });

        }).catch((error) => {
            return Promise.reject(error);
        });
    
        /*
    
        // If you know beforehand that it is a Voice Mail then you can avoid an extra update call like below

        return this.createVoiceCall({callOrigin:'Voicemail', type:"inbound", to: params.dialedPhoneNumber, caller: params.caller}).then(() => {
                    
            return this.createTranscription({phoneNumber: params.caller, content: params.transcripts, messageId: Math.random().toString(36).substring(10), senderType:'END_USER'}).then(() => {
                
                return this.executeOmniFlow({dialedNumber: params.dialedPhoneNumber}).then(() => {
                    
                    return this.updateVoiceCall({ recordingUrl: params.recordingUrl, totalRecordingDuration: parseInt(params.recordingLength) }).then((response) => {
                        return Promise.resolve(response);
                    });

                });

            });
            
        }).catch((error) => {
            return Promise.reject(error);
        });

        */
    },

    requestCallback(params) {
        const voiceCallIdParam = params.voiceCallId || voiceCallId;
        const callbackNumber = params.callbackNumber;
        const vendorCallKey = params.vendorCallKey;
        const isPreviewCallback = params.isPreviewCallback;
        const telephonyProviderName = params.telephonyProviderName || 'demo-connector';

        if (!callbackNumber) {
            return Promise.reject(new Error('callbackNumber is required'));
        }

        const fieldValues = { callbackNumber, ...(vendorCallKey && { vendorCallKey }), ...(isPreviewCallback === true && { isPreviewCallback: true }) };
        const headers = {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                'Telephony-Provider-Name': telephonyProviderName
            }
        };

        console.log("Field Values for requestCallback: " + JSON.stringify(fieldValues));
        return voiceCallIdParam ?
            getAxiosClient(tenantInfo).post(`/voiceCalls/${voiceCallIdParam}/requestCallback`, fieldValues, headers).then((response) => {
                console.log("Request callback response: " + JSON.stringify(response.data));
                return response;
            }) : Promise.reject(new Error('voiceCallId is required for requestCallback'));
    },

    clearRouting(params) {
        const voiceCallIdParam = params.voiceCallId || voiceCallId;
        const telephonyProviderName = params.telephonyProviderName || 'demo-connector';

        const headers = {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                'Telephony-Provider-Name': telephonyProviderName
            }
        };

        return voiceCallIdParam ?
            getAxiosClient(tenantInfo).patch(`/voiceCalls/${voiceCallIdParam}/clearRouting`, null, headers).then((response) => {
                console.log("Clear routing response: " + JSON.stringify(response.data));
                return response;
            }) : Promise.reject(new Error('voiceCallId is required for clearRouting'));
    },

    routeVoiceCall(params) {
        const voiceCallIdParam = params.voiceCallId || voiceCallId;
        const { routingTarget, fallbackQueue, flowInputParameters } = params;
        const telephonyProviderName = params.telephonyProviderName || 'demo-connector';

        if (!voiceCallIdParam) {
            return Promise.reject(new Error('voiceCallId is required for routeVoiceCall'));
        }
        if (!routingTarget) {
            return Promise.reject(new Error('routingTarget is required for routeVoiceCall'));
        }

        const fieldValues = {
            routingTarget,
            ...(fallbackQueue != null && { fallbackQueue }),
            ...(flowInputParameters != null && { flowInputParameters })
        };
        const headers = {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
                'Telephony-Provider-Name': telephonyProviderName
            }
        };

        console.log("Field Values for routeVoiceCall: " + JSON.stringify(fieldValues));
        return getAxiosClient(tenantInfo).patch(`/voiceCalls/route/${voiceCallIdParam}`, fieldValues, headers).then((response) => {
            console.log("Route voice call response: " + JSON.stringify(response.data));
            return response;
        });
    }
};
