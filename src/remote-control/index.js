/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import Constants from '../common/constants'
import { ACWInfo, Contact, publishEvent, publishError } from '@salesforce/scv-connector-base';

export function  initializeRemoteController(connector) {
    connector.sdk.eventEmitter.on('event', async (event) => {
        if (event && event.data) {
            try {
                switch (event.data.type) {
                    case Constants.LOGIN_SUBMIT: {
                        connector.sdk.subsystemLoginResult(event.data.success);
                    }
                    break;
                    case Constants.GET_SHOW_LOGIN_PAGE: {
                        const { showLoginPage } = connector.sdk.state;
                        connector.sdk.messageUser(event.fromUsername, 
                                                  Constants.SHOW_LOGIN_PAGE, 
                                                  {
                                                        type: Constants.SHOW_LOGIN_PAGE,
                                                        value: showLoginPage
                                                  })
                    }
                    break;
                    case Constants.GET_AGENT_CONFIG: {
                        const { agentConfig, contactCenterChannels, agentId, userPresenceStatuses } = connector.sdk.state;
                        connector.sdk.messageUser(event.fromUsername, 
                                                  Constants.AGENT_CONFIG,
                                                 {
                                                    type: Constants.AGENT_CONFIG,
                                                    value: agentConfig,
                                                    userPresenceStatuses,
                                                    contactCenterChannels,
                                                    from: `${document.referrer} as ${agentId}` 
                                                 })
                    }
                    break;
                    case Constants.GET_CAPABILITIES: {
                        const { capabilities, agentId } = connector.sdk.state;
                        connector.sdk.messageUser(event.fromUsername, 
                                                  Constants.CAPABILITIES,
                                                 {
                                                    type: Constants.CAPABILITIES,
                                                    value: capabilities,
                                                    from: `${document.referrer} as ${agentId}`
                                                 })
                    }
                        break;
                    case Constants.GET_ACTIVE_CALLS: {
                        connector.sdk.messageUser(event.fromUsername, 
                                                 Constants.ACTIVE_CALLS,
                                                 {
                                                    type: Constants.ACTIVE_CALLS,
                                                    value: Object.values(connector.sdk.getActiveCallsObj())
                                                 })
                    }
                    break;
                    case Constants.THROW_ERROR: {
                        connector.sdk.throwError(event.data.value)
                    }
                    break;
                    case Constants.CUSTOM_ERROR: {
                        connector.sdk.customErrorChanged(event.data.value)
                    }
                    break;
                    case Constants.SET_SHOW_LOGIN_PAGE: {
                        connector.sdk.showLoginPage(event.data.value);
                    }
                    break;
                    case Constants.SET_AGENT_CONFIG: {
                        connector.sdk.updateAgentConfig({
                            selectedPhone: event.data.value.selectedPhone
                         });
                    }
                    break;
                    case Constants.SET_CAPABILITIES: {
                        connector.sdk.updateCapabilities({
                            hasMute: event.data.value.hasMute,
                            hasRecord: event.data.value.hasRecord,
                            hasSwap: event.data.value.hasSwap,
                            hasMerge: event.data.value.hasMerge,
                            hasContactSearch: event.data.value.hasContactSearch,
                            hasSignedRecordingUrl: event.data.value.hasSignedRecordingUrl,
                            signedRecordingUrl: event.data.value.signedRecordingUrl,
                            signedRecordingDuration: event.data.value.signedRecordingDuration,
                            supportsMos: event.data.value.supportsMos,
                            hasSupervisorListenIn: event.data.value.hasSupervisorListenIn,
                            hasSupervisorBargeIn: event.data.value.hasSupervisorBargeIn,
                            hasBlindTransfer: event.data.value.hasBlindTransfer,
                            hasPhoneBook: event.data.value.hasPhoneBook,
                            debugEnabled: event.data.value.debugEnabled,
                            hasAgentAvailability: event.data.value.hasAgentAvailability,
                            hasQueueWaitTime: event.data.value.hasQueueWaitTime,
                            hasTransferToOmniFlow: event.data.value.hasTransferToOmniFlow,
                            hasPendingStatusChange: event.data.value.hasPendingStatusChange,
                            canConsult: event.data.value.canConsult
                        });
                    }
                    break;
                    case Constants.SET_CONTACT_TYPES: {
                        connector.sdk.updateContactTypes(event.data.contactTypes)
                    }
                    break;
                    case Constants.START_OUTBOUND_CALL: {
                        await connector.sdk.dial(new Contact({ phoneNumber: event.data.phoneNumber}), event.data.callInfo, true);
                    }
                    break;
                    case Constants.START_INBOUND_CALL:
                    case Constants.PROGRESSIVE_DIALER:
                        await connector.sdk.startInboundCall(event.data.phoneNumber, event.data.callInfo);
                    break;
                    case Constants.CONNECT_PARTICIPANT: {
                        connector.sdk.connectParticipant(event.data.callInfo);
                    }
                    break;
                    case Constants.SET_AGENT_STATUS: {
                        connector.sdk.publishSetAgentStatus(event.data.statusId);
                    }
                    break;
                    case Constants.CONNECT_SUPERVISOR: {
                        connector.sdk.connectSupervisor();
                    }
                    break;
                    case Constants.REMOVE_PARTICIPANT:
                    case Constants.END_CALL: {
                        connector.sdk.removeParticipant(event.data.participantType);
                    }
                    break;
                    case Constants.REMOVE_SUPERVISOR: {
                        connector.sdk.removeSupervisor();
                    }
                    break;
                    case Constants.CONNECT_CALL: {
                        connector.sdk.connectCall(event.data.callInfo);
                    }
                    break;
                    case Constants.AGENT_HANGUP: {
                        connector.sdk.hangup(event.data.reason, event.data.agentErrorStatus);
                    }
                    break;
                    case Constants.SOFTPHONE_LOGOUT: {
                        connector.sdk.subsystemLogout();
                    }
                    break;
                    case Constants.CREATE_TRANSCRIPTION: {
                        fetch('/api/createTranscription', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(event.data)
                        }).then((payload) => {
                            connector.sdk.log(`Create transcript returned with ${payload.success}`);
                        }).catch((err) => {
                            connector.sdk.log(`Create transcript failed - ${err}`);
                        });
                    }
                    break;
                    case Constants.SEND_VOICE_MAIL: {
                        fetch('/api/sendVoiceMail', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(event.data.voiceMailDetails)
                        }).then((payload) => {
                            connector.sdk.log(`Store recording link returned with ${payload.success}`);
                        }).catch((err) => {
                            connector.sdk.log(`Store recording link failed - ${err}`);
                        });
                    }
                    break;
                    case Constants.SEND_REALTIME_CONVERSATION_EVENTS: {
                        fetch('/api/sendRealtimeConversationEvents', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(event.data.sendRealtimeConversationEventsDetails)
                        }).then((payload) => {
                            connector.sdk.log(`sendRealtimeConversationEvents returned with ${payload.success}`);
                        }).catch((err) => {
                            connector.sdk.log(`sendRealtimeConversationEvents failed - ${err}`);
                        });
                    }
                    break;
                    case Constants.SEND_RECORDING: {
                        fetch('/api/updateVoiceCall', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(event.data.recordingInfo)
                        }).then((payload) => {
                            connector.sdk.log(`Store recording link returned with ${payload.success}`);
                        }).catch((err) => {
                            connector.sdk.log(`Store recording link failed - ${err}`);
                        });
                    }
                    break;
                    case Constants.MESSAGE_FROM_CONNECTOR:{
                        await connector.sdk.publishMessage(event.data.message);
                    }
                    break;
                    case Constants.REQUEST_CALLBACK: {
                        connector.sdk.requestCallback(event.data.payload);
                    }
                    break;
                    case Constants.PUSH_DIALER: {
                        connector.sdk.previewCall(event.data.payload);
                    }
                    break;
                    case Constants.SEND_AUDIO_STATS: {
                        await connector.sdk.updateAudioStats(event.data.audioStats);
                    }
                    break;
                    case Constants.REMOVE_TRANSFER_PARTICIPANT_VARIANT: {
                        connector.sdk.updateRemoveTransferCallParticipantVariant(event.data.variant);
                    }
                    break;
                    case Constants.HARDPHONE_EVENT: {
                        const eventType = event.data.eventType;
                        const payload = event.data.payload;
                        let result;
                        switch (eventType) {
                            case Constants.VOICE_EVENT_TYPE.MUTE_TOGGLE: {
                                if (payload.isMuted) {
                                    result = await connector.sdk.mute();
                                } else {
                                    result = await connector.sdk.unmute();
                                }
                            }
                            break;
                            case Constants.VOICE_EVENT_TYPE.HOLD_TOGGLE: {
                                if (payload.isCustomerOnHold) {
                                    result = await connector.sdk.hold(payload.call);
                                } else {
                                    result = await connector.sdk.resume(payload.call);
                                }
                            }
                            break;
                            case Constants.VOICE_EVENT_TYPE.RECORDING_TOGGLE: {
                                if (payload.isRecordingPaused) {
                                    result = await connector.sdk.pauseRecording(payload);
                                } else {
                                    result = await connector.sdk.resumeRecording(payload);
                                }
                            }
                            break;
                            case Constants.VOICE_EVENT_TYPE.PARTICIPANT_ADDED: {
                                result = await connector.sdk.addParticipant(new Contact(payload.contact), payload.call);
                            }
                            break;
                            case Constants.VOICE_EVENT_TYPE.PARTICIPANTS_SWAPPED: {
                                result = await connector.sdk.swapCalls(payload.call, payload.thirdPartyCall);
                            }
                            break;
                            case Constants.VOICE_EVENT_TYPE.PARTICIPANTS_CONFERENCED: {
                                result = await connector.sdk.conference(payload);
                            }
                            break;
                        }
                        publishEvent({ eventType, payload: result });
                    }
                    break;
                    case Constants.SHARED_EVENT_TYPE.AFTER_CONVERSATION_WORK_STARTED:
                    case Constants.SHARED_EVENT_TYPE.AFTER_CONVERSATION_WORK_ENDED:
                        publishEvent({eventType: event.data.type, payload: new ACWInfo(event.data.acwInfo)});
                    break;
                    default:
                        publishEvent({eventType: event.data.type});
                    break;
                }
            } catch (error) {
                const eventType = event.data.eventType;
                connector.sdk.messageUser(event.fromUsername, 
                                          Constants.ERROR, 
                                         {
                                            type: Constants.ERROR,
                                            error: `${error.message} (Event: ${eventType || event.data.type})`
                                         })
                console.error(`Error occured when published event ${eventType} from the hardphone simulator: ${error.message}`);
                if (connector.sdk && connector.sdk.state.publishHardphoneErrors) {
                    publishError({ eventType, error });
                }
            }
        }
    });
}
