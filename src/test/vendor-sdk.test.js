/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

jest.mock('@salesforce/scv-connector-base', () => ({
    ...(jest.requireActual('@salesforce/scv-connector-base')),
    publishEvent: jest.fn(),
    log: jest.fn()
}));
import fetchMock from "jest-fetch-mock";
import constants from './testConstants';
import { publishEvent, log, GenericResult, PhoneCall, Contact, CallInfo, DialOptions,
    LogoutResult, Constants, Phone, AgentStatusInfo, SupervisedCallInfo, PhoneCallAttributes, CustomError,
    HidDevice } from '@salesforce/scv-connector-base';
import { Connector } from '../main/connector';
import { hidDeviceHandler } from "../hid/hidDeviceHandler";
import { getHIDParser } from '../hid/hidDeviceParserFactory';
jest.mock('../hid/hidDeviceParserFactory');
import { Sdk } from '../main/vendor-sdk';
import { USER_MESSAGE } from '../common/constants';

global.console.log = jest.fn(); //do not print console.log 
global.fetch = fetchMock;
jest.useFakeTimers();
describe('Vendor Sdk tests', () => {
    const connector = new Connector();
    const telephonyConnector = connector.getTelephonyConnector();
    const vendorSdk = connector.sdk;
    const dummyPhoneNumber = 'dummyPhonenumber';
    const globalDummyCallInfo = { isMuted : false , isOnHold : false};

    beforeAll(async () => {
        global.fetch = jest.fn(() =>
            Promise.resolve({
                json: () => Promise.resolve({ voiceCallId: "someId" })
            })
        );
        vendorSdk.remoteStorage = {
            getItem: jest.fn().mockResolvedValue(null),
            setItem: jest.fn().mockResolvedValue({}),
            upsertCall: jest.fn().mockResolvedValue({}),
            endCall: jest.fn().mockResolvedValue({})
        };
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        publishEvent.mockClear();
        const contactCenterAdditionalSettings = {
            'authorizationContext':'authorizationContext',
            'userId':'userId',
            'customEventPayloadField':'customEventPayloadField',
            'customPlatformEvent':'customPlatformEvent',
            'customEventTypeField':'customEventTypeField',
            'routingOwner':'routingOwner',
            'instanceUrl':'instanceUrl',
            'scrtUrl':'scrtUrl',
            'orgId':'orgId'
        }
        vendorSdk.state.activeCalls = {};
        vendorSdk.state.destroyedCalls = vendorSdk.state.destroyedCalls || [];
        vendorSdk.state.agentAvailable = true;
        vendorSdk.state.agentConfig = {
            selectedPhone : {type:"SOFT_PHONE"}
        };
        vendorSdk.state.capabilities = {
            hasMute: true,
            hasMerge: true,
            hasRecord: true,
            hasSwap: true,
            hasSignedRecordingUrl: false,
            hasContactSearch: true,
            hasAgentAvailability: true,
            hasQueueWaitTime: true,
            debugEnabled: true,
            isDialPadDisabled: false,
            isPhoneBookDisabled: false,
            isHidSupported: false,
            hasSetExternalMicrophoneDeviceSetting: true,
            hasSetExternalSpeakerDeviceSetting: true
        };
        vendorSdk.state.agentId = 'agentId';
        vendorSdk.state.contactCenterAdditionalSettings = contactCenterAdditionalSettings;
    });

    describe('handleSocketMessage', () => {
        beforeEach(() => {
            publishEvent.mockClear();
            jest.spyOn(vendorSdk, 'connectParticipant').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'publishCallBargedInEventToAgents').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'processMute').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'processBroadcastMute').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'log').mockImplementation((args) => args);
            jest.spyOn(vendorSdk.eventEmitter, 'emit').mockImplementation((args) => args);
        });
        afterEach(() => {
            jest.restoreAllMocks();
            vendorSdk.state.isMultipartyAllowed = false;
        })
        it('Should handle CALL_STARTED message', async () => {
            const message = { fromUsername: "fromUserName",
                messageType: constants.USER_MESSAGE.CALL_STARTED,
                data: {
                    phoneNumber: "phoneNumber",
                    callId: "callId",
                    voiceCallId: "voiceCallId",
                    callInfo: {isOnHold:false},
                    fromContact: {id: "fromUserName"},
                    activeConferenceCalls: [],
                }
            };
            await vendorSdk.handleSocketMessage(message);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(1);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED
            }));
       });

        it('[Multi-Party] Should handle CALL_STARTED message', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.userFullName = "ag1";
            const message = {
                messageType: constants.USER_MESSAGE.CALL_STARTED,
                data: { phoneNumber: "phoneNumber",
                    callId: "callId",
                    voiceCallId: "voiceCallId",
                    callInfo: {isOnHold:false},
                    fromContact: {id: "id"},
                    activeConferenceCalls: [],
                }
            };
            await vendorSdk.handleSocketMessage(message);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(1);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED
            }));
        });

        it('Should handle INTERNAL_CALL_STARTED message', () => {
            const message = {
                eventType: constants.USER_MESSAGE.INTERNAL_CALL_STARTED,
                data: {
                    contact: {
                        phoneNumber: "phoneNumber",
                        type: Constants.CONTACT_TYPE.AGENT
                    },
                    renderContact: {
                        name: "name"
                    }
                 }
             };
             vendorSdk.handleServerEvent(message);
             expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(1);
             expect(publishEvent).toBeCalledWith(expect.objectContaining({
                 eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED
             }));
        });

        it('Should handle PARTICIPANT_CONNECTED message', () => {
            const message = {
                eventType: constants.USER_MESSAGE.PARTICIPANT_CONNECTED,
                data: {
                    call: {
                        phoneNumber: 'dummyNumber',
                        callInfo: 'dummyCallInfo'
                    }
                }
             };
            vendorSdk.handleServerEvent(message);
            expect(vendorSdk.connectParticipant).toBeCalled();
        });

        it('Should handle CALL_BARGED_IN message', () => {
            const message = {
                eventType: constants.USER_MESSAGE.CALL_BARGED_IN,
                data: {
                    phoneNumber: 'dummyNumber',
                    callInfo: 'dummyCallInfo'
                }
             };
            vendorSdk.handleServerEvent(message);
            expect(vendorSdk.publishCallBargedInEventToAgents).toBeCalled();
        });

        it('Should handle CALL_DESTROYED message', () => {
            const message = {
                eventType: constants.USER_MESSAGE.CALL_DESTROYED,
                data: {
                    call: {
                        callId : "dummyCallInfo"
                    }
                }
             };
            vendorSdk.handleServerEvent(message);
        });

        it('Should handle MUTE message', () => {
            const message = {
                eventType: constants.USER_MESSAGE.MUTE,
                data: {
                    call: { callId : "dummyCallInfo" },
                    isMuted: true
                },
                fromUsername: "dummyUsername"
             };
            vendorSdk.handleServerEvent(message);
            expect(vendorSdk.processBroadcastMute).toBeCalled();
        });

        it('Should handle UNMUTE message', () => {
            const message = {
                eventType: constants.USER_MESSAGE.UNMUTE,
                data: {
                    call: { callId : "dummyCallInfo" },
                    isMuted: false
                },
                fromUsername: "dummyUsername"
             };
            vendorSdk.handleServerEvent(message);
            expect(vendorSdk.processBroadcastMute).toBeCalled();
        });

        it('log message that cannot be handled', () => {
            const message = {
                messageType: 'invalidMessage'
             };
            vendorSdk.handleSocketMessage(message);
            expect(global.console.log).toBeCalledWith("Could not handle message " + message.messageType, message);
        });

        it('forward remote control messages to event Emitter', () => {
            const message = { 
                data: { 
                    type: 'START_INBOUND_CALL' 
                }
             };
            vendorSdk.handleSocketMessage(message);
            expect(vendorSdk.eventEmitter.emit).toBeCalledWith('event', message);
        });
    });


    describe('init', () => {
        let fetchServerMock;
        let mockSocket;
        let fetchCCCMock;

        beforeEach(() => {
            fetchServerMock = jest.spyOn(vendorSdk, 'fetchServer').mockResolvedValue({}); // Reset fetchServerMock for each test
            fetchCCCMock = jest.spyOn(vendorSdk, 'readCallCenterConfigAndSetState').mockResolvedValue({});
            mockSocket = {
                on: jest.fn(),
                emit: jest.fn(),
            };
            jest.mock('socket.io', () => () => mockSocket);
            global.fetch = jest.fn(() => 
                Promise.resolve({
                    json: () => Promise.resolve({ success: true })
                })
            );
        });
        
        afterEach(() => {
            jest.restoreAllMocks(); // Restore mocks after each test
            fetchCCCMock.mockRestore();
        });
        
        it('Should fail when tenant info is not configured properly', async () => {
            global.fetch = jest.fn(() => 
                Promise.resolve({
                    json: () => Promise.resolve({ success: false })
                })
            );
            await expect(connector.init(constants.CALL_CENTER_CONFIG)).rejects.toBe("Failed to configure tenant information");
        });

        it('Should return a showLogin when showLoginPage is true', async () => {
            vendorSdk.remoteStorage.getItem.mockImplementation((ctx, key) => {
                if (key === 'showLoginPage') return Promise.resolve(true);
                return Promise.resolve(null);
            });
            const result = await connector.init(constants.CALL_CENTER_CONFIG);
            expect(result.showLogin).toBeTruthy();
            expect(result.loginFrameHeight).toBe(350);
            vendorSdk.remoteStorage.getItem.mockResolvedValue(null);
        });

        it('Should NOT return a showLogin when showLoginPage is false', async () => {
            vendorSdk.state.showLoginPage = false;
            const result = await connector.init(constants.CALL_CENTER_CONFIG);
            expect(result.showLogin).toBeFalsy();
        });

        it('should handle is-local-config true', async () => {
            // Mock the fetchServer function to resolve with true or false
            fetchServerMock.mockResolvedValue(true); // Mocking is-local-config check true
            const result = await connector.init({...constants.CALL_CENTER_CONFIG, messagingChannel: {"id":"abc"}});
            // Assert fetchServer function was called with correct parameter
            expect(fetchServerMock).toHaveBeenCalledWith("/is-local-config", 'GET');
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith('/api/configureTenantInfo', expect.any(Object));
            expect(vendorSdk.readCallCenterConfigAndSetState).toBeCalledTimes(0);
            expect(result).toBeDefined();
        });
    
        it('should handle is-local-config false', async () => {
            // Mock the fetchServer function to resolve with true or false
            fetchServerMock.mockResolvedValue(false); // Mocking is-local-config check false
            fetchCCCMock.mockResolvedValue({});
            // Call init function
            await connector.init({...constants.CALL_CENTER_CONFIG, messagingChannel: {"id":"abc"}});
            // Assert fetchServer function was called with correct parameter
            expect(fetchServerMock).toHaveBeenCalledWith("/is-local-config", 'GET');
            expect(fetchCCCMock).toBeCalledTimes(1);
        });
        it('should handle exception in readCallCenterConfigAndSetState', async () => {
            fetchServerMock.mockResolvedValue(false);
            fetchCCCMock.mockImplementation(() => {
                throw new Error('Simulated error');
            });
    
            await expect(connector.init({...constants.CALL_CENTER_CONFIG, messagingChannel: {"id":"abc"}}))
                .rejects.toBe("Failed to configure tenant information");
    
            expect(fetchServerMock).toHaveBeenCalledWith("/is-local-config", 'GET');
        });
    });
    describe('readCallCenterConfigAndSetState', () => {
        let fetchMock;
        let fetchCCCMock;
        const messagingChannel = [
            {'ChannelAddressIdentifier': 'testCAI1'},
            {'ChannelAddressIdentifier': 'testCAI2'},
        ]
        const callCenterConfig = {
            'userId': 'userId',
            'scrtUrl': 'scrtUrl',
            'organizationId': 'organizationId',
            'domain':'domain',
            'conversationChannelDefinition': {
                'conversationChannelDefinition':'conversationChannelDefinition',
                'DeveloperName':'DeveloperName',
            },
            'messagingChannel': {
                messagingChannel
            }
        }
        beforeEach(() => {
            fetchCCCMock = jest.spyOn(vendorSdk, 'fetchContactCenterConfigToEnv').mockResolvedValue({});
            fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() =>
                Promise.resolve({
                    json: () => Promise.resolve()
                })
            );
        });

        afterEach(() => {
            jest.restoreAllMocks();
            fetchCCCMock.mockRestore();
        });
        it('test readCallCenterConfigAndSetState ', async () => {
            vendorSdk.readCallCenterConfigAndSetState(callCenterConfig);
            expect(vendorSdk.state.contactCenterAdditionalSettings.authorizationContext).toEqual("authorizationContext");
        });
        it('should handle a setting undefined correctly', async () => {
            await vendorSdk.readCallCenterConfigAndSetState(callCenterConfig);
            fetchMock.mockImplementationOnce(() =>
                Promise.resolve({
                    json: () => Promise.resolve({ setting: null })
                })
            );
            expect(vendorSdk.readCallCenterConfigAndSetState(callCenterConfig)).resolves.toBeUndefined;
        });
    });
    describe('fetchContactCenterConfigToEnv', () => {
        let fetchMock;

        beforeEach(() => {
            fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() =>
                Promise.resolve({
                    json: () => Promise.resolve({ status: 200 })
                })
            );
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should call the correct endpoint with the correct data', async () => {
            await vendorSdk.fetchContactCenterConfigToEnv();
            expect(fetchMock).toHaveBeenCalledWith("/api/fetchServer", {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                authorizationContext: 'authorizationContext',
                userId: 'userId',
                userName: 'agentId',
                customEventPayloadField: 'customEventPayloadField',
                customPlatformEvent: 'customPlatformEvent',
                customEventTypeField: 'customEventTypeField',
                routingOwner: 'routingOwner',
                instanceUrl: 'instanceUrl',
                scrtUrl: 'scrtUrl',
                orgId: 'orgId',
                method: 'POST',
                endpoint: '/setcallcenterconfig'
                })
            });
        });

        it('should handle a successful response correctly', async () => {
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            await vendorSdk.fetchContactCenterConfigToEnv();
            expect(consoleLogSpy).toHaveBeenCalledWith({ status: 200 });        
            consoleLogSpy.mockRestore();
        });

        it('should handle a non-200 response correctly', async () => {
        fetchMock.mockImplementationOnce(() =>
            Promise.resolve({
                json: () => Promise.resolve({ status: 500 })
            })
        );

        await expect(vendorSdk.fetchContactCenterConfigToEnv()).resolves.toEqual(new Error("Couldn't fetch settings to /setcallcenterconfig"));
        });
    });
    describe('fetchServer', () => {
        let fetchMock;
    
        beforeEach(() => {
            // Create a mock for the global fetch function
            fetchMock = jest.fn();
            global.fetch = fetchMock;
        });
    
        afterEach(() => {
            // Restore the global fetch function after each test
            jest.restoreAllMocks();
        });
    
        it('should handle a successful fetch request', async () => {
            // Setup the mock to return a successful response
            fetchMock.mockResolvedValue({
                json: () => Promise.resolve({ success: true, data: 'test data' })
            });
    
            // Call the function
            const result = await vendorSdk.fetchServer('test-endpoint', 'GET');
    
            // Assert the fetch function was called with the correct parameters
            expect(fetchMock).toHaveBeenCalledWith('/api/fetchServer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    method:"GET", 
                    endpoint:"test-endpoint"
                }),
            });
    
            // Assert the result is as expected
            expect(result).toEqual({ success: true, data: 'test data' });
        });
    
        it('should handle a fetch request with network errors', async () => {
            // Setup the mock to simulate a network error
            fetchMock.mockRejectedValue(new Error('Network error'));
    
            // Call the function and expect it to reject with an error
            await expect(vendorSdk.fetchServer('test-endpoint', 'GET')).rejects.toThrow('Network error');
        });
    
        it('should handle a fetch request with an unsuccessful response', async () => {
            // Setup the mock to return an unsuccessful response
            fetchMock.mockResolvedValue({
                json: () => Promise.resolve({ success: false, error: 'Something went wrong' })
            });
    
            // Call the function
            const result = await vendorSdk.fetchServer('test-endpoint', 'POST');
    
            // Assert the fetch function was called with the correct parameters
            expect(fetchMock).toHaveBeenCalledWith('/api/fetchServer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    method:"POST", 
                    endpoint:"test-endpoint"
                })
            });
    
            // Assert the result is as expected
            expect(result).toEqual({ success: false, error: 'Something went wrong' });
        });
    });
    describe('getActiveCalls', () => {
        beforeEach(() => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    json: () => Promise.resolve({ voiceCallId: "someId", success : true })
                })
            );
        });
        
        it('Should return a valid active calls result on getActiveCalls', async () => {
            const callResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            vendorSdk.remoteStorage.getItem.mockImplementation((ctx, key) => {
                if (key === 'activeCalls') return Promise.resolve(vendorSdk.state.activeCalls);
                return Promise.resolve(null);
            });
            const result = await telephonyConnector.getActiveCalls();
            expect(Object.keys(result.activeCalls).length).toEqual(1);
            Object.values(result.activeCalls).forEach(call => {
                expect(call.callId).toBeTruthy();
            });
            await vendorSdk.endCall(callResult.call);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(0);
            vendorSdk.remoteStorage.getItem.mockResolvedValue(null);
        });

        it('Should return a empty active calls result on getActiveCalls', async () => {
            const result = await telephonyConnector.getActiveCalls();
            expect(Object.keys(result.activeCalls).length).toEqual(0);
        });
    });

    describe('acceptCall', () => {
        beforeEach(() => {
            vendorSdk.messageUser = jest.fn();
        });
        it('Should reject on invalid call', async () => {
            const nonExistantCall = new PhoneCall({ callId: 'callId', callType: 'inbound', state: 'state', callAttributes: {}, phoneNumber: '100'});
            try {
                await telephonyConnector.acceptCall(nonExistantCall);
            } catch (e) {
                expect(e.message).toEqual("Couldn't find an active call");
            }
        });

        it('Should return a valid call result on acceptCall when object is not a call instance ', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            vendorSdk.addCall({...call});
            expect(Object.values(vendorSdk.state.activeCalls).length).toBe(1);
        });
        
        it('Should return a valid call result on acceptCall', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            const result = await telephonyConnector.acceptCall(call);
            expect(result.call.callId).toEqual(call.callId);
        });

        it('Should return a valid call result on acceptCall for callback', async () => {
            connector.sdk.requestCallback({ phoneNumber: '100' });

            const result = await telephonyConnector.acceptCall(new PhoneCall({
                callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }
            }));
            expect(result.call.state).toBe(Constants.CALL_STATE.RINGING);
        });

        it('Should return a replay activeConferenceCalls if available ', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            vendorSdk.state.activeConferenceCalls = Object.values(vendorSdk.state.activeCalls);

            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const result = await telephonyConnector.acceptCall(call);
            expect(result.call.callId).toEqual(call.callId);
            expect(publishEvent).toBeCalledTimes(2);
        });

        it('Should not broadcast participant connected for non transfer/inbound calls ', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            vendorSdk.state.activeConferenceCalls = Object.values(vendorSdk.state.activeCalls);

            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const result = await telephonyConnector.acceptCall(call);
            expect(result.call.callId).toEqual(call.callId);
            expect(publishEvent).toBeCalledTimes(2);
            expect(vendorSdk.messageUser).not.toBeCalled();
        });

        it('Should return a rejected promise if throwError is set', async () => {
            vendorSdk.throwError(true);
            connector.sdk.requestCallback({ phoneNumber: '100' });
            const phoneCall = new PhoneCall({
                callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }
            });
            await expect(telephonyConnector.acceptCall(phoneCall)).rejects.toStrictEqual('demo error');
        });

        afterAll(() => {
            vendorSdk.throwError(false);
        });
    });

    describe('connectCall', () => {
        it('Should publish a valid call result on connectCall', async () => {
            await telephonyConnector.dial(new Contact({ phoneNumber: '100'}));
            vendorSdk.connectCall({ removeParticipantVariant : Constants.REMOVE_PARTICIPANT_VARIANT.ALWAYS });
            expect(publishEvent).toBeCalledWith(expect.objectContaining({ eventType: Constants.VOICE_EVENT_TYPE.CALL_CONNECTED }));
        });
    });

    describe('declineCall', () => {
        it('Should return a valid call result on declineCall', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            const result = await telephonyConnector.declineCall(call);
            expect(result.call.callId).toEqual(call.callId);
        });

        it('Should return a valid call result on declineCall', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            const result = await telephonyConnector.declineCall();
            expect(result.call.callId).toEqual(call.callId);
        });
    });

    describe('endCall', () => {
        afterEach(() => {
            vendorSdk.state.isMultipartyAllowed = false;
        });

        it('Should return a valid call result on endCall', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            const result = await telephonyConnector.endCall(call);
            expect(result.calls.pop().callId).toEqual(call.callId);
        });

        it('[Multi-party] Should return a valid call result on endCall by others', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            let call;
            //to make sure its an endcall by the user itself clicking on small end call button
            const startCallResult2 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            ({call} = startCallResult2);
            vendorSdk.state.agentId = call.contact.id;
            const result2  = await telephonyConnector.endCall(call);
            expect(result2.calls.pop().callId).toEqual(call.callId);

            //to make sure its a endcall by another user
            vendorSdk.state.agentId = 'agentId';
            const startCallResult3 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            ({call} = startCallResult3);
            const result3  = await telephonyConnector.endCall(call);
            expect(result3.calls.pop().callId).toEqual(call.callId);

            //end call of intial caller
            vendorSdk.state.agentId = 'agentId';
            const startCallResult4 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            ({call} = startCallResult4);
            delete call.callId;
            const result4 = await vendorSdk.destroyCalls(call);
            expect(result4.pop().callId).toBeDefined();
        });

        it('[Multi-party] Should return a valid call result on endCall by own user', async () => {
            vendorSdk.state.isMultipartyAllowed = true;

            //to make sure its an endcall by the user itself clicking on main end call button
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.PHONENUMBER});
            const startCallResult = await telephonyConnector.dial(contact);
            const {call} = startCallResult;
            vendorSdk.state.agentId = call.contact.id;
            const result  = await telephonyConnector.endCall({callAttributes : { participantType : constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
            expect(result.calls.pop().callId).toEqual(call.callId);
        });

        it('[Multi-party] Should end call from demo connector', async () => {
            vendorSdk.state.isMultipartyAllowed = true;

            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.PHONENUMBER});
            const startCallResult = await telephonyConnector.dial(contact);
            const {call} = startCallResult;
            vendorSdk.state.agentId = call.contact.id;

            connector.sdk.initiateHangupMultiParty("ended", null);
            expect(Object.values(vendorSdk.state.activeCalls).length).toEqual(0);
        });

        it('Should return a valid call result for end call on an internal call', async () => {
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const startCallResult = await telephonyConnector.dial(contact);
            const { call } = startCallResult;
            expect(startCallResult.call.callType).toBe(Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase());
            const result = await telephonyConnector.endCall(call);
            expect(result.calls.pop().callId).toEqual(call.callId);
        });

        it('Should not return a valid call for internal call that is destroyed by processcall', async () => {
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const startCallResult = await telephonyConnector.dial(contact);
            const { call } = startCallResult;
            expect(startCallResult.call.callType).toBe(Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase());
            try {
                vendorSdk.processCallDestroyed({call: {callId :call.callId}});
            } catch(e) {
                // Expected in new architecture — hangup may throw for non-AGENT participantType
            }
            try {
                telephonyConnector.endCall(call);
            } catch(e) {
                expect(e.message).toContain("Couldn't find an active call");
            }
        });

        it('[Multi-party] Should not return a valid call for internal call that is destroyed by processcall by someone else', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.PHONENUMBER});
            const startCallResult = await telephonyConnector.dial(contact);
            const { call } = startCallResult;
            expect(startCallResult.call.callType).toBe(Constants.CALL_TYPE.OUTBOUND.toLowerCase());
            startCallResult.call.callAttributes.participantType = Constants.PARTICIPANT_TYPE.AGENT;
            vendorSdk.processCallDestroyed({call: {callId :call.callId}});
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(0);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({ eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_REMOVED }));
        });

        it('[Multi-party] Should hangup call, when agent is kicked', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const message1 = {
                fromUsername: "fromUserName",
                messageType: constants.USER_MESSAGE.CALL_STARTED,
                data: {
                    phoneNumber: "100",
                    callId: "callId1",
                    voiceCallId: "voiceCallId1",
                    callInfo: new CallInfo({isMuted : false}),
                    callAttributes : {
                        isConsultCall : false
                    },
                    fromContact: {id: "fromUserName"},
                    activeConferenceCalls: [],
                    isConsultCall : false
                }
            };
            await vendorSdk.handleSocketMessage(message1);
            const call = vendorSdk.state.activeCalls['callId1'];
            await telephonyConnector.acceptCall(call);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(1);

            // main user leaves call. They will send a message to the consult user that the call is destroyed.

            const message2 = {
                fromUsername: "fromUserName",
                eventType: constants.USER_MESSAGE.CALL_DESTROYED,
                data: {
                    call: {
                        callId: "callId1",
                        target: 'agentId',
                        reason: "ENDED"
                    }
                }
            };
            vendorSdk.handleServerEvent(message2);

            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(0);
        });

        it('[Multi-party] Should not return a valid call for internal call that is destroyed by processcall by owner', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const startCallResult = await telephonyConnector.dial(contact);
            const { call } = startCallResult;
            expect(startCallResult.call.callType).toBe(Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase());
            vendorSdk.processCallDestroyed({call: {callId :call.callId}});
            try {
                telephonyConnector.endCall(call);
            } catch(e) {
                expect(e.message).toEqual("Couldn't find an active call");
            }
        });

        it('[Multi-party] Should return a valid call for consult call , when an agent removes consult call', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const inbound1 = await vendorSdk.startInboundCall("102", globalDummyCallInfo);
            const { call } = inbound1;
            const contact1 = new Contact({ id: 'dummyUser', phoneNumber: "101" });
            await telephonyConnector.addParticipant(contact1, call);

            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            let dialOptions = {
                isConsultCall: true
            };
            const startCallResult = await telephonyConnector.dial(contact, dialOptions);
            const consultCall = startCallResult.call;
            expect(consultCall.callType).toBe(Constants.CALL_TYPE.CONSULT);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(3);

            // agent removes consult caller.
            const consultCallDestroyed = await telephonyConnector.endCall(consultCall, null);
            expect(consultCallDestroyed.calls[0].callType).toBe(Constants.CALL_TYPE.CONSULT);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(2);
        });

        it('[Multi-party] Should return a valid call for consult call , when consult caller leaves', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const inbound1 = await vendorSdk.startInboundCall("102", globalDummyCallInfo);
            const { call } = inbound1;
            const contact1 = new Contact({ id: 'dummyUser', phoneNumber: "101" });
            await telephonyConnector.addParticipant(contact1, call);

            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            let dialOptions = {
                isConsultCall: true
            };
            const startCallResult = await telephonyConnector.dial(contact, dialOptions);
            const consultCall = startCallResult.call;
            expect(consultCall.callType).toBe(Constants.CALL_TYPE.CONSULT);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(3);

            // consult user leaves call.
            const messageData = {call: {callId :consultCall.callId, target: 'agentId'}};
            await vendorSdk.processCallDestroyed(messageData);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(2);
        });

        it('[Multi-party] [agent perspective] Should hangup consult call, when main agent leaves', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const inbound1 = await vendorSdk.startInboundCall("102", globalDummyCallInfo);
            const { call } = inbound1;
            const contact1 = new Contact({ id: 'dummyUser', phoneNumber: "101" });
            await telephonyConnector.addParticipant(contact1, call);

            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            let dialOptions = {
                isConsultCall: true
            };
            const startCallResult = await telephonyConnector.dial(contact, dialOptions);
            const consultCall = startCallResult.call;
            expect(consultCall.callType).toBe(Constants.CALL_TYPE.CONSULT);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(3);

            // consult user leaves call.
            const messageData = {callInfo: { participantType: constants.PARTICIPANT_TYPE.AGENT }};
            await vendorSdk.endCall(messageData);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(0);
        });

        it('[Multi-party] [Consult agent perspective] Should hangup consult call, when main agent leaves', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const message1 = {
                fromUsername: "fromUserName",
                messageType: constants.USER_MESSAGE.CALL_STARTED,
                data: {
                    phoneNumber: "100",
                    callId: "callId1",
                    voiceCallId: "voiceCallId1",
                    callInfo: new CallInfo({isMuted : false}),
                    callAttributes : {
                        isConsultCall : true
                    },
                    fromContact: {id: "fromUserName"},
                    activeConferenceCalls: [],
                    isConsultCall : true
                }
            };
            await vendorSdk.handleSocketMessage(message1);
            const consultCall = vendorSdk.state.activeCalls['callId1'];
            await telephonyConnector.acceptCall(consultCall);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(1);

            // main user leaves call. They will send a message to the consult user that the call is destroyed.

            const message2 = {
                fromUsername: "fromUserName",
                eventType: constants.USER_MESSAGE.CALL_DESTROYED,
                data: {
                    call: {
                        callId: "callId1",
                        target: 'agentId',
                        reason: "ENDED"
                    }
                }
            };
            vendorSdk.handleServerEvent(message2);

            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(0);
        });

        it('[MP] Should call PARTICIPANT_CONNECTED when primary caller hangs up', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const initialContact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const initialCall = {
                    "callAttributes": {
                        "initialCallHasEnded": false,
                        "isOnHold": false,
                        "participantType": "Initial_Caller"
                    },
                    "callId": "dummyCallId2",
                    "callInfo": new CallInfo(globalDummyCallInfo),
                    "callType": "inboundcall",
                    "contact": initialContact,
                    "phoneNumber": "100",
                    "receiverContact": {}, "state": "ringing"};
            const transferContact = new Contact({ id: 'dummyUser2', phoneNumber: '200', type: Constants.CONTACT_TYPE.AGENT});
            const transferCallResult = await telephonyConnector.dial(transferContact);
            const { call } = transferCallResult;
            call.callInfo = new CallInfo({renderContactId: "dummyUser"});
            vendorSdk.addCall(call);
            const acceptCallResult = await telephonyConnector.acceptCall(call);
            vendorSdk.addCall(initialCall);

            // check that transfer call is created
            expect(vendorSdk.state.activeCalls).not.toBeNull();
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(2);
            expect(vendorSdk.getCall({callId:acceptCallResult.call.callId})).not.toBeNull();

            // broadcast info of destroying the first call
            const messageData = {call: {callId :initialCall.callId, target: 'dummyUser'}};
            vendorSdk.processCallDestroyed(messageData);

            // expect passing the condition check in processCallDestroyed
            expect(vendorSdk.getPrimaryCall()).not.toBeNull();
        });

        it('Should return a valid call result on endCall for Agent for Initial Caller & Third party', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.THIRD_PARTY });
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.AGENT });
            const { call } = startCallResult;

            await expect(telephonyConnector.endCall(call)).resolves.not.toThrow();
        });

        it('Should return a valid call result on endCall for Agent for just Initial caller', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.AGENT });
            const { call } = startCallResult;
            try {
                telephonyConnector.endCall(call);
            } catch(e) {
                expect(e.message).toEqual("Couldn't find an active call for participant " + constants.PARTICIPANT_TYPE.THIRD_PARTY);
            }
        });

        it('Should throw an error on endCall for Agent with just Third party but no initial caller', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.THIRD_PARTY });
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.AGENT });
            const { call } = startCallResult;
            try {
                telephonyConnector.endCall(call);
            } catch(e) {
                expect(e.message).toEqual("Couldn't find an active call for participant " + constants.PARTICIPANT_TYPE.INITIAL_CALLER);
            }
        });

        it('Should publish wrap-up started', async () => {
            jest.useFakeTimers();
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            await telephonyConnector.endCall(call);
            jest.runAllTimers();
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.AFTER_CALL_WORK_STARTED, payload: { callId: call.callId }});
        });

        it('Should return a rejected promise if throwError is set', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            vendorSdk.throwError(true);
            const { call } = startCallResult;
            await expect(telephonyConnector.endCall(call)).rejects.toStrictEqual('demo error');
        });
        
        afterAll(() => {
            vendorSdk.throwError(false);
        });
    });

    describe('processCallDestroyed', () => {
        beforeEach(() => {
            jest.spyOn(vendorSdk, 'hangupMultiParty').mockImplementation((args) => args);
        });
        afterEach(() => {
            vendorSdk.state.isMultipartyAllowed = false;
            jest.restoreAllMocks();
        });

        it('Should not hang up while the target is not yourself', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.isMultipartyAllowed = true;
            const initialContact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const initialCall = {
                    "callAttributes": {
                        "initialCallHasEnded": false,
                        "isOnHold": false,
                        "participantType": "Initial_Caller"
                    },
                    "callId": "dummyCallId2",
                    "callInfo": globalDummyCallInfo,
                    "callType": "inboundcall",
                    "contact": initialContact,
                    "phoneNumber": "100",
                    "receiverContact": {}, "state": "ringing"};
            const transferContact = new Contact({ id: 'dummyUser2', phoneNumber: '200', type: Constants.CONTACT_TYPE.AGENT});
            const transferCallResult = await telephonyConnector.dial(transferContact);
            const { call } = transferCallResult;
            call.callInfo = new CallInfo({renderContactId: "dummyUser"});
            vendorSdk.addCall(call);
            await telephonyConnector.acceptCall(call);
            vendorSdk.addCall(initialCall);
            // broadcast info of destroying the first call
            const messageData = {call: {callId :initialCall.callId, target: 'dummyUser'}};
            vendorSdk.processCallDestroyed(messageData);

            // expect passing the condition check in processCallDestroyed
            expect(vendorSdk.hangupMultiParty).not.toBeCalled();
        })
    })
    
    describe('dial', () => {
        beforeEach(() => {
            vendorSdk.state.onlineUsers = ['dummyUser'];
            vendorSdk.state.userFullNames = new Map();
            vendorSdk.messageUser = jest.fn();
        });

        it('Should return a valid call result on dial', async () => {
            const contact = new Contact({ phoneNumber: '100'});

            const result = await telephonyConnector.dial(contact);
            expect(result.call.callType).toBe(Constants.CALL_TYPE.OUTBOUND.toLowerCase());
            expect(result.call.contact).toBe(contact);
            expect(result.call.callInfo.callStateTimestamp instanceof Date).toBeTruthy();
            expect(result.call.callAttributes.participantType).toBe(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
        });
        it('Should return a valid call result on dial on softphone', async () => {
            const contact = new Contact({ phoneNumber: '100'});

            const result = await vendorSdk.dial(contact, { isSoftphoneCall: true });
            expect(result.call.callType).toBe(Constants.CALL_TYPE.OUTBOUND.toLowerCase());
            expect(result.call.contact).toBe(contact);
            expect(result.call.callInfo.callStateTimestamp instanceof Date).toBeTruthy();
            expect(result.call.callAttributes.participantType).toBe(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
            expect(publishEvent).not.toBeCalled();
        });
        it('Should return a valid call result on dial from hardphone', async () => {
            const contact = new Contact({ phoneNumber: '100'});

            const result = await vendorSdk.dial(contact, { isSoftphoneCall: false });
            expect(result.call.callType).toBe(Constants.CALL_TYPE.OUTBOUND.toLowerCase());
            expect(result.call.contact).toBe(contact);
            expect(result.call.callInfo.callStateTimestamp instanceof Date).toBeTruthy();
            expect(result.call.callAttributes.participantType).toBe(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
            expect(result.call.callInfo.isSoftphoneCall).toBe(false);
        });
        it('Should throw error on dial if there is already an active call', async () => {
            const contact1 = new Contact({ phoneNumber: '100'});
            const contact2 = new Contact({ phoneNumber: '200'});
            await vendorSdk.dial(contact1, { isSoftphoneCall: false });
            vendorSdk.dial(contact2, { isSoftphoneCall: false }).catch((error) => {
                expect(error.message).toEqual("Agent is not available for an outbound call");
                expect(error.type).toEqual(Constants.VOICE_ERROR_TYPE.AGENT_AT_MAXIMUM_CAPACITY);
            })
        });
        it('Should throw AGENT_NOT_INITIALIZED on dial when agentId is not set', async () => {
            const previousAgentId = vendorSdk.state.agentId;
            vendorSdk.state.agentId = null;
            const contact = new Contact({ phoneNumber: '100'});
            try {
                await vendorSdk.dial(contact, { isSoftphoneCall: true });
            } catch (error) {
                expect(error.message).toEqual('Agent is not initialized');
                expect(error.type).toEqual(Constants.VOICE_ERROR_TYPE.AGENT_NOT_INITIALIZED);
            } finally {
                vendorSdk.state.agentId = previousAgentId;
            }
        });
        it('Should return a valid call result on dial from hardphone on remote', async () => {
            const contact = new Contact({ phoneNumber: '100'});
            const result = await vendorSdk.dial(contact, { isSoftphoneCall: false }, true);
            expect(result.call.callType).toBe(Constants.CALL_TYPE.OUTBOUND.toLowerCase());
            expect(result.call.contact).toBe(contact);
            expect(result.call.callInfo.callStateTimestamp instanceof Date).toBeTruthy();
            expect(result.call.callAttributes.participantType).toBe(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
            expect(result.call.callInfo.isSoftphoneCall).toBe(false);
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED, payload: result });
        });
        it('Should return a valid internal call result on dial with contact type Agent', async () => {
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const result = await telephonyConnector.dial(contact);
            expect(result.call.callType).toBe(Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase());
            expect(result.call.contact).toBe(contact);
            expect(result.call.callInfo.callStateTimestamp instanceof Date).toBeTruthy();
            expect(result.call.callAttributes.participantType).toBe(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
        });
        it('Should return a valid consult call object result on dial with consult agent', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const dialOptions = {
                isConsultCall : true
            }
            const result = await telephonyConnector.dial(contact, dialOptions);
            expect(result.call.callType).toBe(Constants.CALL_TYPE.CONSULT);
            expect(result.call.contact).toBe(contact);
            expect(result.call.callInfo.callStateTimestamp instanceof Date).toBeTruthy();
            expect(result.call.callAttributes.participantType).toBe(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
        });
        it('Should return a valid dialed callback call result on dial', async () => {
            const contact = new Contact({ phoneNumber: '100'});
            const dialOptions = new DialOptions({ isCallback : true });
            const result = await telephonyConnector.dial(contact, dialOptions);
            expect(result.call.callType).toBe(Constants.CALL_TYPE.DIALED_CALLBACK);
            expect(result.call.contact).toBe(contact);
            expect(result.call.callInfo.callStateTimestamp instanceof Date).toBeTruthy();
            expect(result.call.callAttributes.participantType).toBe(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
        });
    });

    describe('logout', () => {
        it('Should return a valid generic result on logout', async () => {
            const result = await connector.logout();
            expect(result.success).toBeTruthy();
        });
    });

    describe('getAgentConfig', () => {
        it('Should return a valid agent config result on getAgentConfig', async () => {
            const result = await telephonyConnector.getAgentConfig();
            expect(result.selectedPhone).toEqual(vendorSdk.state.agentConfig.selectedPhone);
        });
    });

    describe('updateAgentConfig', () => {

        it('setAgentConfig from sfdc', async () => {
            const selectedPhone = new Phone ({type:"DESK_PHONE", number: "111 333 0456"});
            telephonyConnector.setAgentConfig({ selectedPhone });
            expect(vendorSdk.state.agentConfig.selectedPhone).toEqual(selectedPhone);
        });

        it('setAgentConfig from sfdc with hidDevice and check for undefined', async () => {
            navigator.hid = {
                getDevices : jest.fn()
            }
            const hidDeviceInfo = new HidDevice ({productId:12345, vendorId: 12345});
            const selectedPhone = new Phone ({type:"DESK_PHONE", number: "111 333 0456"});

            telephonyConnector.setAgentConfig({ selectedPhone });
            expect(vendorSdk.state.agentConfig.hidDeviceInfo).toEqual(undefined);

            telephonyConnector.setAgentConfig({ selectedPhone, hidDeviceInfo });
            expect(vendorSdk.state.agentConfig.hidDeviceInfo).toEqual(hidDeviceInfo);
        });

        it('setAgentConfig from sfdc when phone type is not changed and just number is updated', async () => {
            const selectedPhone = new Phone ({type:"DESK_PHONE", number: "111 000 1111"});
            telephonyConnector.setAgentConfig({ selectedPhone });
            expect(vendorSdk.state.agentConfig.selectedPhone).toEqual(selectedPhone);
        });

        it('updateAgentConfig from simulator', async () => {
            vendorSdk.updateAgentConfig({
                selectedPhone : {type:"SOFT_PHONE"}
            });
            expect(vendorSdk.state.agentConfig.selectedPhone.type).toEqual("SOFT_PHONE");
            expect(vendorSdk.state.agentConfig.selectedPhone.number).toBeUndefined();
        });

        it('setAgentConfig should not override existing values when new values are undefined/null', async () => {
            // First set some initial values
            const initialConfig = {
                selectedPhone: new Phone({type: "DESK_PHONE", number: "111 333 0456"}),
                hidDeviceInfo: new HidDevice({productId: 12345, vendorId: 12345})
            };
            telephonyConnector.setAgentConfig(initialConfig);
            
            // Try to update with undefined/null values
            const updateConfig = {
                selectedPhone: undefined,
                hidDeviceInfo: null
            };
            telephonyConnector.setAgentConfig(updateConfig);

            // Verify original values are preserved
            expect(vendorSdk.state.agentConfig.selectedPhone).toEqual(initialConfig.selectedPhone);
            expect(vendorSdk.state.agentConfig.hidDeviceInfo).toEqual(initialConfig.hidDeviceInfo);
        });

        it('setAgentConfig should handle partial updates correctly', async () => {
            // Set initial configuration
            const initialConfig = {
                selectedPhone: new Phone({type: "DESK_PHONE", number: "111 333 0456"}),
                hidDeviceInfo: new HidDevice({productId: 12345, vendorId: 12345})
            };
            telephonyConnector.setAgentConfig(initialConfig);

            // Update only selectedPhone
            const updateConfig = {
                selectedPhone: new Phone({type: "SOFT_PHONE", number: "222 444 5678"})
            };
            telephonyConnector.setAgentConfig(updateConfig);

            // Verify only selectedPhone was updated
            expect(vendorSdk.state.agentConfig.selectedPhone).toEqual(updateConfig.selectedPhone);
            expect(vendorSdk.state.agentConfig.hidDeviceInfo).toEqual(initialConfig.hidDeviceInfo);
        });

        it('setAgentConfig should handle edge cases', async () => {
            //Default agentConfig is SOFT_PHONE
            // Test with empty object
            telephonyConnector.setAgentConfig({});
            expect(vendorSdk.state.agentConfig).toBeDefined();

            // Test with null configuration
            telephonyConnector.setAgentConfig(null);
            expect(vendorSdk.state.agentConfig).toBeDefined();

            // Test with undefined configuration
            telephonyConnector.setAgentConfig(undefined);
            expect(vendorSdk.state.agentConfig).toBeDefined();

            // Test with empty string values
            telephonyConnector.setAgentConfig({ selectedPhone: {} });
            expect(vendorSdk.state.agentConfig.selectedPhone).toEqual({type:"SOFT_PHONE"});
        });

        it('setAgentConfig should handle phone type changes correctly', async () => {
            // Test changing from DESK_PHONE to SOFT_PHONE
            const deskPhone = new Phone({type: "DESK_PHONE", number: "111 333 0456"});
            telephonyConnector.setAgentConfig({ selectedPhone: deskPhone });
            expect(vendorSdk.state.agentConfig.selectedPhone.type).toEqual("DESK_PHONE");

            const softPhone = new Phone({type: "SOFT_PHONE"});
            telephonyConnector.setAgentConfig({ selectedPhone: softPhone });
            expect(vendorSdk.state.agentConfig.selectedPhone.type).toEqual("SOFT_PHONE");
            expect(vendorSdk.state.agentConfig.selectedPhone.number).toBeUndefined();
        });
    });

    describe('getVoiceCapabilities', () => {
        it('Should return a valid agent config result on getCapabilities', async () => {
            const result = await telephonyConnector.getVoiceCapabilities();
            expect(result.hasMute).toEqual(vendorSdk.state.capabilities.hasMute);
            expect(result.hasMerge).toEqual(vendorSdk.state.capabilities.hasMerge);
            expect(result.hasRecord).toEqual(vendorSdk.state.capabilities.hasRecord);
            expect(result.hasSwap).toEqual(vendorSdk.state.capabilities.hasSwap);
            expect(result.isDialPadDisabled).toEqual(vendorSdk.state.capabilities.isDialPadDisabled);
            expect(result.isPhoneBookDisabled).toEqual(vendorSdk.state.capabilities.isPhoneBookDisabled);
            expect(result.isHidSupported).toEqual(vendorSdk.state.capabilities.isHidSupported);
            expect(result.hasSetExternalMicrophoneDeviceSetting).toEqual(vendorSdk.state.capabilities.hasSetExternalMicrophoneDeviceSetting);
            expect(result.hasSetExternalSpeakerDeviceSetting).toEqual(vendorSdk.state.capabilities.hasSetExternalSpeakerDeviceSetting);
        });
    });

    describe('getSharedCapabilities', () => {
        it('Should return a valid agent config result on getCapabilities', async () => {
            const result = await connector.getSharedCapabilities();
            expect(result.hasContactSearch).toEqual(vendorSdk.state.capabilities.hasContactSearch);
            expect(result.hasAgentAvailability).toEqual(vendorSdk.state.capabilities.hasAgentAvailability);
            expect(result.hasQueueWaitTime).toEqual(vendorSdk.state.capabilities.hasQueueWaitTime);
            expect(result.debugEnabled).toEqual(vendorSdk.state.capabilities.debugEnabled);
        });
    });

    describe('updateCapabilities', () => {

        it('updateAgentConfig from simulator', async () => {
            vendorSdk.updateCapabilities({
                hasMute: false,
                hasMerge: false,
                hasRecord: false,
                hasSwap: false,
                isDialPadDisabled: true,
                isPhoneBookDisabled: true,
                isHidSupported: true,
                hasSetExternalMicrophoneDeviceSetting: true,
                hasSetExternalSpeakerDeviceSetting: true
            });
            expect(vendorSdk.state.capabilities.hasMute).toEqual(false);
            expect(vendorSdk.state.capabilities.hasMerge).toEqual(false);
            expect(vendorSdk.state.capabilities.hasRecord).toEqual(false);
            expect(vendorSdk.state.capabilities.hasSwap).toEqual(false);
            expect(vendorSdk.state.capabilities.isDialPadDisabled).toEqual(true);
            expect(vendorSdk.state.capabilities.isPhoneBookDisabled).toEqual(true);
            expect(vendorSdk.state.capabilities.isHidSupported).toEqual(true);
            expect(vendorSdk.state.capabilities.hasSetExternalMicrophoneDeviceSetting).toEqual(true);
            expect(vendorSdk.state.capabilities.hasSetExternalSpeakerDeviceSetting).toEqual(true);
        });

        it('setCapabilities from simulator', async () => {
            const capabilitiesPayload = {
                [Constants.MOS] : true,
                [Constants.RECORD] : true
            };
            telephonyConnector.setCapabilities( capabilitiesPayload );
            expect(vendorSdk.state.capabilities.MOS).toEqual(capabilitiesPayload.MOS);
            expect(vendorSdk.state.capabilities.RECORD).toEqual(capabilitiesPayload.RECORD);
        });
    });

    describe("contactTypes", () => {
        it('should update ContactTypes', async() => {
            const contactTypes = [ Constants.CONTACT_TYPE.AGENT, 
                                   Constants.CONTACT_TYPE.QUEUE, 
                                   Constants.CONTACT_TYPE.PHONEBOOK, 
                                   Constants.CONTACT_TYPE.PHONENUMBER ]
            telephonyConnector.sdk.updateContactTypes([ Constants.CONTACT_TYPE.AGENT ]);
            expect(vendorSdk.state.contactTypes).toEqual([ Constants.CONTACT_TYPE.AGENT ]);
            telephonyConnector.sdk.updateContactTypes(contactTypes);
            expect(vendorSdk.state.contactTypes).toEqual(contactTypes);
        });
    });

    describe('mute', () => {
        it('Should return a valid mute toggle result on global mute', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            call.isGlobal = true;
            const result = await telephonyConnector.mute(call);
            expect(result.isMuted).toBeTruthy();
            expect(result.isGlobal).toBeTruthy();
            expect(result.call.callId).toEqual(call.callId);
        });
    });

    describe('processMute', () => {
        beforeEach(() => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.agentId = "agentId";
            jest.spyOn(vendorSdk, 'messageUser').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'getCall').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'updateCallInfo').mockImplementation((values, call) => {
                if (call && call.callInfo) {
                    Object.assign(call.callInfo, values);
                }
                return call;});
            jest.spyOn(vendorSdk, 'getPrimaryCall').mockImplementation(() => {return {callId: "primaryCallId", contact: {id: "contactId123"}, callInfo: { renderContactId: 'contactId123' }}});
        });
        afterEach(() => {
            jest.restoreAllMocks();
            vendorSdk.state.isMultipartyAllowed = false;
        })
        it('Should set target to agentId on global mute', async () => {
            var call = {
                callId: 'dummyCall',
                isGlobal: true,
                callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }, 
                contact: null,
                callInfo: { renderContactId: 'otherUser' },
                isSupervisor: false
            };
    
            vendorSdk.addCall(call);
            const result = await vendorSdk.processMute(call, true);
    
            expect(result.isMuted).toBeTruthy();
            expect(result.isGlobal).toBeTruthy();
        });
        it('Should set target to contact.id when muting primary caller and contact.id is present', async () => {
            let call = {
                callId: 'primaryCallId',
                isGlobal: false,
                callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER },
                contact: { id: 'contactId123' },
                callInfo: { renderContactId: 'otherContact' },
                isSupervisor: false
            };
    
            vendorSdk.addCall(call);
            const result = await vendorSdk.processMute(call, true);

            expect(result.isMuted).toBeTruthy();
            expect(result.isGlobal).toBeFalsy();
        });
        it('Should set target to contact.phoneNumber when muting primary caller and contact.id is not present', async () => {
            const call = {
                callId: 'primaryCallId',
                isGlobal: false,
                callAttributes: {},
                contact: { phoneNumber: '+123456789' },
                callInfo: { renderContactId: 'otherUser' },
                isSupervisor: false
            };
    
            const result = await vendorSdk.processMute(call, true);
    
            expect(result.isMuted).toBeTruthy();
            expect(result.isGlobal).toBeFalsy();
        });
        it('Should set target to renderContactId when not muting primary caller', async () => {
            let call = {
                callId: 'thirdPartyCallId',
                isGlobal: false,
                callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY },
                contact: { id: 'contactId123' },
                callInfo: { renderContactId: 'otherContact' },
                isSupervisor: false
            };
    
            vendorSdk.addCall(call);
            const result = await vendorSdk.processMute(call, true);

            expect(result.isMuted).toBeTruthy();
            expect(result.isGlobal).toBeFalsy();
        });
        it('Should broadcast the mute message to all users when multiparty is allowed and not supervisor', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const call = {
                callId: 'dummyCall',
                isGlobal: false,
                isSupervisor: false,
                callAttributes: {},
                contact: { id: 'contactId123' },
                callInfo: { renderContactId: 'otherUser' }
            };
    
            await vendorSdk.processMute(call, true);
    
            expect(vendorSdk.messageUser).not.toBeCalled();
        });
        it('Should not broadcast the mute message if supervisor', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const call = {
                callId: 'dummyCall',
                isGlobal: false,
                isSupervisor: true,
                callAttributes: {},
                contact: { id: 'contactId123' },
                callInfo: { renderContactId: 'otherUser' }
            };
    
            await vendorSdk.processMute(call, true);
    
            expect(vendorSdk.messageUser).not.toBeCalled();
        });
    });

    describe('processBroadcastMute', () => {
        beforeEach(() => {
            jest.spyOn(vendorSdk, 'getCall').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'updateCallInfo').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'getPrimaryCall').mockImplementation(() => {return {contact: {id: "dummyUser"}}});
        });
        afterEach(() => {
            jest.restoreAllMocks();
        })
        it('Should return a valid mute toggle result on processBroadcastMute', async () => {
            const call = new PhoneCall({ 
                callId: "dummyCallInfo", 
                callAttributes: { target: "dummyUser", participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }, 
                contact: new Contact({ id: vendorSdk.state.agentId }),
                callInfo: new CallInfo({ isMuted: false }),
                isGlobal: false
                });
            vendorSdk.addCall(call);
            await vendorSdk.processBroadcastMute(call, true);
            expect(vendorSdk.getCall).toBeCalledWith({contact: { id: "dummyUser" }});
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.MUTE_TOGGLE, payload: { isMuted: true, call: {isMuted: true}, isGlobal: false }});
        });
    });

    describe('unmute', () => {
        it('Should return a valid mute toggle result on unmute', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            call.isGlobal = true;
            const result = await telephonyConnector.unmute(call);
            expect(result.isMuted).toBeFalsy();
            expect(result.isGlobal).toBeTruthy();
            const result2 = await telephonyConnector.mute(call);
            expect(result2.isMuted).toBeTruthy();
        });
    });

    describe('processBroadcastMute', () => {
        it('Should return a valid unmute toggle result on unmute', async () => {
            const call = new PhoneCall({ 
                callId: "dummyCallInfo", 
                callAttributes: { target: "dummyUser", participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }, 
                contact: new Contact({ id: vendorSdk.state.agentId }),
                callInfo: new CallInfo({ isMuted: true }),
                isGlobal: false
                });
            vendorSdk.addCall(call);
            await vendorSdk.processBroadcastMute(call, false);
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.MUTE_TOGGLE, payload: { isMuted: false, call: call, isGlobal: false }});
        });
    });

    describe('hold', () => {
        it('Should return a valid hold toggle result on hold', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            const result = await telephonyConnector.hold(call);
            expect(result.isThirdPartyOnHold).toBeFalsy();
            expect(result.isCustomerOnHold).toBeTruthy();
            expect(result.calls).toEqual(vendorSdk.state.activeCalls);
        });
        it('Should return undefined when isOnHold is called for an invalid call', async () => {
            const result = vendorSdk.isOnHold({});
            expect(result).toBeUndefined();
        });
    });

    describe('resume', () => {
        it('Should return a valid hold toggle result on resume', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            const result = await telephonyConnector.resume(call);
            expect(result.isThirdPartyOnHold).toBeFalsy();
            expect(result.isCustomerOnHold).toBeFalsy();
            expect(result.calls).toEqual(vendorSdk.state.activeCalls);
        });
    });

    describe('pauseRecording', () => {
        it('Should return a valid recording toggle result on pauseRecording', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            const result = await telephonyConnector.pauseRecording(call);
            expect(result.isRecordingPaused).toBeTruthy();
        });
    });

    describe('resumeRecording', () => {
        it('Should return a valid recording toggle result on resumeRecording', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;

            const result = await telephonyConnector.resumeRecording(call);
            expect(result.isRecordingPaused).toBeFalsy();
        });
    });

    describe('swap', () => {
        it('Should return a valid hold toggle result on swap', async () => {
            const startCallResult1 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const call1 = startCallResult1.call;
            const startCallResult2 = await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.THIRD_PARTY });
            const call2 = startCallResult2.call;
            const result = await telephonyConnector.swap(call1, call2);
            expect(result.isThirdPartyOnHold).toBe(true);
            expect(result.isCustomerOnHold).toBe(true);
            expect(result.calls).toEqual(vendorSdk.state.activeCalls);
        });
        it('Should not error on swap when call2 is invalid', async () => {
            const startCallResult1 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const call1 = startCallResult1.call;
            const invalidParticipant = "invalid";
            const startCallResult2 = await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: invalidParticipant });
            const call2 = startCallResult2.call;
            try {
                vendorSdk.swapCalls(call1, call2);
            } catch(e) {
                expect(e.message).toEqual("Couldn't find an active call for participant " + invalidParticipant);
            }
        });
    });

    describe('conference', () => {
        afterEach(() => {
            vendorSdk.state.isMultipartyAllowed = false;
            vendorSdk.state.isConsultAllowed = false;
            vendorSdk.state.capabilities.canConsult = false;
        });

        it('Should return a valid conference result on conference', async () => {
            const startCallResult1 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const call1 = startCallResult1.call;
            const startCallResult2 = await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.THIRD_PARTY });
            const call2 = startCallResult2.call;
            const calls = [call1, call2];

            const result = await telephonyConnector.conference(calls);
            expect(result.isThirdPartyOnHold).toBeFalsy();
            expect(result.isCustomerOnHold).toBeFalsy();
        });

        it('Should return a valid conference result on conference with MPC and Transfer', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities.canConsult = true;
            vendorSdk.state.agentAvailable = true;

            const startCallResult1 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const call1 = startCallResult1.call;
            const dialOptions = {
                isConsultCall : true
            };
            const contact = new Contact({ phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const startCallResult2 = await telephonyConnector.dial(contact, dialOptions);
            const call2 = startCallResult2.call;
            const calls = [call1, call2];

            const result = await telephonyConnector.conference(calls);
            expect(result.isThirdPartyOnHold).toBeFalsy();
            expect(result.isCallMerged).toBeTruthy();
            // expect(vendorSdk.messageUser).toBeCalledWith(null, constants.USER_MESSAGE.MERGE, expect.anything());

            const message = {
                eventType: constants.USER_MESSAGE.MERGE,
                data: {
                    callId : call2.callId,
                    consultCall : call2,
                    activeConferenceCalls: calls
                },
                fromUsername: "dummyUsername"
            };
            vendorSdk.handleServerEvent(message);
            expect(call2.callAttributes.isConsultCall).toBeFalsy();
        });

        it('Should not connect when calling PARTICIPANT_CONNECTED with consult call for non-consult agent', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities.canConsult = true;
            vendorSdk.state.agentAvailable = true;

            const startCallResult1 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const call1 = startCallResult1.call;

            const contact1 = new Contact({ phoneNumber: dummyPhoneNumber });
            call1.contact = contact1;
            await telephonyConnector.addParticipant(contact1, call1);

            const message = {
                eventType: constants.USER_MESSAGE.PARTICIPANT_CONNECTED,
                data: {
                    phoneNumber: 'dummyNumber',
                    callInfo: new CallInfo({isMuted : false}),
                    callAttributes : { isConsultCall : true},
                    call: {
                        callId : 'consultId',
                        callType : Constants.CALL_TYPE.CONSULT,
                        callInfo: new CallInfo({isMuted : false})
                    }
                }
            };
            vendorSdk.handleServerEvent(message);
            // if PARTICIPANT_CONNECTED would have completed, then 2 events would have been called
            expect(publishEvent).toBeCalledTimes(1);
        });

        it('Should update the hold state of primary call on conference with MPC and Transfer', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities.canConsult = true;
            vendorSdk.state.agentAvailable = true;

            const startCallResult1 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const call1 = startCallResult1.call;
            const contact = new Contact({ phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const call2 = await telephonyConnector.addParticipant(contact, call1);
            const calls = [call1, call2];

            const holdResult1 = await telephonyConnector.hold(call1);
            expect(holdResult1.isThirdPartyOnHold).toBeFalsy();
            expect(holdResult1.isCustomerOnHold).toBeTruthy();

            const result = await telephonyConnector.conference(calls);
            expect(result.isThirdPartyOnHold).toBeFalsy();
            expect(result.isCustomerOnHold).toBeFalsy();
            expect(result.isCallMerged).toBeTruthy();

            const message = {
                eventType: constants.USER_MESSAGE.MERGE,
                data: {
                    callId : call2.callId,
                    consultCall : call2,
                    activeConferenceCalls: calls
                },
                fromUsername: "dummyUsername"
            };
            vendorSdk.handleServerEvent(message);
        });

        it('Should merge active calls into a consult agent after merge', async () => {
            jest.useFakeTimers();
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities.canConsult = true;
            vendorSdk.state.agentAvailable = true;
            vendorSdk.state.activeConferenceCalls = [];

            const message1 = {
                fromUsername: "fromUserName",
                messageType: constants.USER_MESSAGE.CALL_STARTED,
                data: { phoneNumber: "phoneNumber",
                    callId: "callId",
                    voiceCallId: "voiceCallId",
                    callInfo: new CallInfo({isMuted : false}),
                    callAttributes : { isConsultCall : true},
                    fromContact: {id: "fromUserName"},
                    activeConferenceCalls: [],
                    isConsultCall : true
                }
            };
            await vendorSdk.handleSocketMessage(message1);

            let callObj = vendorSdk.state.activeCalls["callId"];
            expect(callObj).not.toBe(null);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toBe(1);

            const message2 = {
                eventType: constants.USER_MESSAGE.MERGE,
                data: {
                    callId : "callId2",
                    consultCall : callObj,
                    activeConferenceCalls: [
                        {
                            "callId": "506nup",
                            "callType": "inbound",
                            "phoneNumber": "dummyPhonenumber",
                            "callInfo": {
                                "callStateTimestamp": "2025-03-20T10:47:12.029Z",
                                "isRecordingPaused": false,
                                "isMuted": false,
                                "isOnHold": false,
                                "queueName": null,
                                "queueId": null,
                                "queueTimestamp": null,
                                "isSoftphoneCall": true,
                                "acceptEnabled": true,
                                "declineEnabled": true,
                                "muteEnabled": true,
                                "swapEnabled": true,
                                "conferenceEnabled": true,
                                "holdEnabled": true,
                                "recordEnabled": true,
                                "addCallerEnabled": true,
                                "extensionEnabled": true,
                                "isReplayable": true,
                                "isBargeable": false,
                                "removeParticipantVariant": "ALWAYS",
                                "showMuteButton": true,
                                "showRecordButton": true,
                                "showAddCallerButton": true,
                                "showAddBlindTransferButton": true,
                                "showMergeButton": true,
                                "showSwapButton": true,
                                "additionalFields": null,
                                "isMultiParty": false,
                                "isHIDCall": false,
                                "endCallDisabled": false,
                                "renderContactId": null,
                                "parentCallId": "506nup"
                            },
                            "contact": {
                                "phoneNumber": "dummyPhonenumber",
                                "id": "lqp4vyi",
                                "name": "Customer lqp4vyi",
                                "availability": null
                            },
                            "state": "ringing",
                            "callAttributes": {
                                "participantType": "Initial_Caller",
                                "voiceCallId": "someId",
                                "initialCallHasEnded": false,
                                "isOnHold": false
                            }
                        },
                        {
                            "initialCallHasEnded": false,
                            "callInfo": {
                                "callStateTimestamp": null,
                                "isRecordingPaused": false,
                                "isMuted": false,
                                "isOnHold": false,
                                "queueName": null,
                                "queueId": null,
                                "queueTimestamp": null,
                                "isSoftphoneCall": true,
                                "acceptEnabled": true,
                                "declineEnabled": true,
                                "muteEnabled": true,
                                "swapEnabled": true,
                                "conferenceEnabled": true,
                                "holdEnabled": true,
                                "recordEnabled": true,
                                "addCallerEnabled": true,
                                "extensionEnabled": true,
                                "isReplayable": true,
                                "isBargeable": false,
                                "isExternalTransfer": true,
                                "removeParticipantVariant": "ALWAYS",
                                "showMuteButton": true,
                                "showRecordButton": true,
                                "showAddCallerButton": true,
                                "showAddBlindTransferButton": true,
                                "showMergeButton": true,
                                "showSwapButton": true,
                                "additionalFields": null,
                                "isMultiParty": false,
                                "isHIDCall": false,
                                "endCallDisabled": false,
                                "renderContactId": null
                            },
                            "callAttributes": {
                                "participantType": "Initial_Caller",
                                "voiceCallId": "someId",
                                "initialCallHasEnded": false,
                                "isOnHold": false
                            },
                            "phoneNumber": "100",
                            "callId": "a5w0oa",
                            "contact": {
                                "phoneNumber": "100",
                                "id": "ivmzmnhu",
                                "type": "Agent"
                            }
                        }
                    ]
                },
                fromUsername: "dummyUsername",
            };
            vendorSdk.handleServerEvent(message2);

            await vendorSdk.updateConferenceUsers(true);
            jest.runAllTimers();
            expect(Object.keys(vendorSdk.state.activeCalls).length).toBe(3);
        });

        it('should publish call started event when fireCallStarted is true and is not a softphone call', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.PHONENUMBER});
            const callInfo = { isSoftphoneCall: false };
            const callResult=  await vendorSdk.dial(contact, callInfo, true, false, false);
            expect(callResult.call.callType).toBe(Constants.CALL_TYPE.OUTBOUND.toLowerCase());
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED, payload: callResult});
        });

        it('should not publish call started event when fireCallStarted is false and is not a softphone call', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.PHONENUMBER});
            const callInfo = { isSoftphoneCall: true };
            const callResult =  await vendorSdk.dial(contact, callInfo, true, false, false);
            expect(callResult.call.callType).toBe(Constants.CALL_TYPE.OUTBOUND.toLowerCase());
            expect(publishEvent).toBeCalledTimes(0);
        });
    
        it('Should reject an outbound call if an active call exists', async () => {
            const contact = new Contact({ phoneNumber: '300', type: Constants.CONTACT_TYPE.AGENT });
            try {
                await telephonyConnector.dial(contact, {})
            } catch(e) {
                expect(e.message).toEqual("Agent is not available for an outbound call");
            }
        });
    
        it('Should start an internal agent-to-agent call', async () => {
            const contact = new Contact({ phoneNumber: '400', type: Constants.CONTACT_TYPE.AGENT });
            const result = await telephonyConnector.dial(contact, {});
            expect(result.call).toBeDefined();
            expect(result.call.callType).toEqual(Constants.CALL_TYPE.INTERNAL_CALL.toLowerCase());
        });
        
        it('Should correctly set call attributes for a callback', async () => {
            const contact = new Contact({ phoneNumber: '600', type: Constants.CONTACT_TYPE.AGENT });
            const callInfo = {};
            const result = await vendorSdk.dial(contact, callInfo, false, true);
            expect(result.call).toBeDefined();
            expect(result.call.callType).toEqual(Constants.CALL_TYPE.DIALED_CALLBACK);
        });
        
        it('Should return a valid conference result on conference with consult call', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities.canConsult = true;

            const startCallResult1 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const call1 = startCallResult1.call;
            const startCallResult2 = await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.THIRD_PARTY });
            const call2 = startCallResult2.call;
            const contact = new Contact({ phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const dialOptions = {
                isConsultCall : true
            };
            const startCallResult3 = await telephonyConnector.dial(contact, dialOptions);
            const call3 = startCallResult3.call;
            const calls = [call3, call1, call2];

            const result = await telephonyConnector.conference(calls);
            expect(result.isCallMerged).toBeTruthy();
        });

        it('Should set consult call state to CONNECTED when accepting in multiparty scenario', () => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities.canConsult = true;

            const consultCall = new PhoneCall({
                callType: Constants.CALL_TYPE.CONSULT.toLowerCase(),
                phoneNumber: "consultAgent",
                callId: "consultCallId",
                callInfo: new CallInfo({
                    renderContactId: "consultAgentId"
                }),
                callAttributes: {
                    participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY,
                    isConsultCall: true
                }
            });

            vendorSdk.addCall(consultCall);

            const message = {
                eventType: USER_MESSAGE.PARTICIPANT_CONNECTED,
                data: {
                    phoneNumber: 'dummyNumber',
                    callInfo: new CallInfo({isMuted: false}),
                    callAttributes: { isConsultCall: true },
                    callType: Constants.CALL_TYPE.CONSULT.toLowerCase(),
                    call: {
                        callId: 'consultCallId',
                        callType: Constants.CALL_TYPE.CONSULT,
                        callInfo: new CallInfo({isMuted: false})
                    }
                }
            };

            vendorSdk.handleServerEvent(message);

            expect(vendorSdk.state.activeCalls["consultCallId"].state).toBe(Constants.CALL_STATE.CONNECTED);
        });

        it('Should call connectParticipant when merging consult call in conference', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities.canConsult = true;
            
            const connectParticipantSpy = jest.spyOn(vendorSdk, 'connectParticipant').mockImplementation(() => {});
            const startCallResult1 = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const call1 = startCallResult1.call;
            const startCallResult2 = await vendorSdk.startInboundCall(dummyPhoneNumber, { participantType: constants.PARTICIPANT_TYPE.THIRD_PARTY });
            const call2 = startCallResult2.call;
            const contact = new Contact({ phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const startCallResult3 = await telephonyConnector.dial(contact, { isConsultCall : true});
            const call3 = startCallResult3.call;
            const calls = [call3, call1, call2];
            const result = await telephonyConnector.conference(calls);
            
            expect(result.isCallMerged).toBeTruthy();
            expect(connectParticipantSpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.objectContaining({ callId: call3.callId })
            );
            connectParticipantSpy.mockRestore();
        });
    });

    describe('addParticipant', () => {
        var vendorWrapUp = vendorSdk.beginWrapup;
        beforeEach(() => {
            vendorSdk.state.onlineUsers = ['dummyUser'];
            vendorSdk.state.userFullNames = new Map();
            vendorSdk.messageUser = jest.fn();
            vendorSdk.beginWrapup = jest.fn();
        });

        afterEach(() => {
            vendorSdk.beginWrapup = vendorWrapUp;
            vendorSdk.state.isMultipartyAllowed = false;
        });

        it('Should return a participant result with parent call info on addParticipant', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, {...globalDummyCallInfo, 
                conferenceEnabled: false, showMergeButton: false});
            const { call } = startCallResult;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: dummyPhoneNumber });
            const result = await telephonyConnector.addParticipant(contact, call);
            const callInfo = new CallInfo({ holdEnabled: true, 
                isExternalTransfer: true, 
                removeParticipantVariant: Constants.REMOVE_PARTICIPANT_VARIANT.ALWAYS })
            expect(result.phoneNumber).toEqual(dummyPhoneNumber);
            expect(result.initialCallHasEnded).toBeFalsy();
            expect(result.callInfo.isOnHold).toEqual(false);
            expect(result.callInfo.conferenceEnabled).toEqual(false);
            expect(result.callInfo.showMergeButton).toEqual(false);
            expect(result.callInfo.holdEnabled).toEqual(callInfo.holdEnabled);
            expect(result.callInfo.isExternalTransfer).toEqual(callInfo.isExternalTransfer);
            expect(result.callInfo.removeParticipantVariant).toEqual(callInfo.removeParticipantVariant);
            expect(result.callInfo.callStateTimestamp).toBeInstanceOf(Date);
            expect(result.callId).not.toBeNull();
            expect(result.callInfo.initialCallId).toEqual(call.callId);
            expect(vendorSdk.messageUser).not.toBeCalled();
        });

        it('[Multi-party] Should return a participant result on addParticipant', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const callInfo = new CallInfo({
                holdEnabled: true,
                isExternalTransfer: true,
                removeParticipantVariant: Constants.REMOVE_PARTICIPANT_VARIANT.ALWAYS });
            vendorSdk.updateCallInfoObj( { "data" : { "callInfo" : callInfo}});
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const activeCall = vendorSdk.getCall({callId: call.callId});
            activeCall.callAttributes = {isAutoMergeOn: true};
            const contact = new Contact({ id: 'dummyUser', phoneNumber: dummyPhoneNumber });
            const result = await telephonyConnector.addParticipant(contact, activeCall);
            expect(result.phoneNumber).toEqual(dummyPhoneNumber);
            expect(result.initialCallHasEnded).toBeFalsy();
            expect(result.callInfo.isOnHold).toEqual(false);
            expect(result.callInfo.holdEnabled).toEqual(callInfo.holdEnabled);
            expect(result.callInfo.isExternalTransfer).toEqual(callInfo.isExternalTransfer);
            expect(result.callInfo.removeParticipantVariant).toEqual(callInfo.removeParticipantVariant);
            expect(result.callId).not.toBeNull();
            expect(result.callInfo.initialCallId).toEqual(call.callId);
            expect(vendorSdk.messageUser).not.toBeCalled();
            const primaryCall = vendorSdk.getCall({callId: call.callId});
            expect(primaryCall.callInfo.isOnHold).toEqual(false);
        });
        
        it('Should set the isExternalTransfer flag correctly when addParticipant is called', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: dummyPhoneNumber });
            call.callInfo.isExternalTransfer = false;
            let result = await telephonyConnector.addParticipant(contact, call);
            const callInfo = new CallInfo({ holdEnabled: true, isExternalTransfer: false, removeParticipantVariant: Constants.REMOVE_PARTICIPANT_VARIANT.ALWAYS });
            expect(result.callInfo.isOnHold).toEqual(false);
            expect(result.callInfo.holdEnabled).toEqual(callInfo.holdEnabled);
            expect(result.callInfo.isExternalTransfer).toEqual(callInfo.isExternalTransfer);
            expect(result.callInfo.removeParticipantVariant).toEqual(callInfo.removeParticipantVariant);
            expect(result.callInfo.callStateTimestamp).toBeInstanceOf(Date);
        });
        
        it('Should throw error on adParticipant if there is already an active call', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ phoneNumber: dummyPhoneNumber });
            await telephonyConnector.addParticipant(contact, call);
            try {
                await telephonyConnector.addParticipant(contact, call);
            } catch(e) {
                expect(e.message).toEqual("Agent is not available for a transfer call");
            }
        });
        it('Should return a participant result on addParticipant with blind transfer', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: dummyPhoneNumber });
            const result = await telephonyConnector.addParticipant(contact, call, true);
            const callInfo = new CallInfo({ isExternalTransfer: true,
                holdEnabled: true, 
                removeParticipantVariant: Constants.REMOVE_PARTICIPANT_VARIANT.ALWAYS });

            expect(result.phoneNumber).toEqual(dummyPhoneNumber);
            expect(result.initialCallHasEnded).toBeTruthy();
            expect(result.callInfo.isOnHold).toEqual(false);
            expect(result.callInfo.isExternalTransfer).toEqual(callInfo.isExternalTransfer);
            expect(result.callInfo.holdEnabled).toEqual(callInfo.holdEnabled);
            expect(result.callInfo.removeParticipantVariant).toEqual(callInfo.removeParticipantVariant);
            expect(result.callInfo.callStateTimestamp).toBeInstanceOf(Date);
            expect(result.callId).not.toBeNull();
            expect(vendorSdk.beginWrapup).toBeCalled();
        });
        it('Should use the parent call\'s additionalFields string ', async () => {
            const additionalFields = "{\"SourceType\":\"Service\"}";
            const dummyCallInfo = {additionalFields: additionalFields, ...globalDummyCallInfo};
            const dummyFlowConfig = {dialedNumber: "1234567890", flowName:"SCV_OMNI_FLOW", voiceCallId:"voiceCallId", fallbackQueue: "fallbackQueue"};
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, dummyCallInfo, dummyFlowConfig);
            const { call } = startCallResult;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: dummyPhoneNumber });
            const result = await telephonyConnector.addParticipant(contact, call, false);
            
            expect(result.callInfo.additionalFields).toEqual(additionalFields);
        });
        it('Should Transfer to Omni Flow successfully', async () => {
            global.fetch = jest.fn((resource) => {
                if (resource.includes("executeOmniFlow")) {
                    return Promise.resolve({
                        json: () => Promise.resolve({agent: "dummyUser"})
                    });
                } else {
                    return Promise.resolve({
                        json: () => Promise.resolve({voiceCallId: "someId"})
                    });
                }
            });
            vendorSdk.state.onlineUsers = ['dummyUser'];
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ id: 'flowId', type: "Flow" });
            const result = await telephonyConnector.addParticipant(contact, call);
            expect(result.initialCallHasEnded).toBeFalsy();
            expect(result.callInfo.isOnHold).toEqual(false);
            expect(result.callInfo.isExternalTransfer).toEqual(false);
            expect(result.callInfo.holdEnabled).toEqual(true);
            expect(result.callInfo.removeParticipantVariant).toEqual(Constants.REMOVE_PARTICIPANT_VARIANT.ALWAYS);
            expect(result.callInfo.callStateTimestamp).toBeInstanceOf(Date);
            expect(result.callId).not.toBeNull();
            expect(vendorSdk.messageUser).not.toBeCalled();
        });

        it('updateConferenceUsers with updateActiveCallToo true', async () => {
            jest.useFakeTimers();
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: dummyPhoneNumber });
            await telephonyConnector.addParticipant(contact, call);
            vendorSdk.updateConferenceUsers(true);
            jest.runAllTimers();
            expect(vendorSdk.state.activeCalls[call.callId]).toBeDefined();
            expect(vendorSdk.state.activeCalls[call.callId].callId).toEqual(call.callId);
        });

        it('updateConferenceUsers with updateActiveCallToo false', async () => {
            jest.useFakeTimers();
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ id: 'dummyUser', phoneNumber: dummyPhoneNumber });
            call.callInfo.isExternalTransfer = false;
            let result = await telephonyConnector.addParticipant(contact, call);

            vendorSdk.state.activeConferenceCalls = [call, result.call];
            vendorSdk.updateConferenceUsers(false);
            jest.runAllTimers();
            expect(vendorSdk.state.activeCalls[call.callId].callAttributes.participantType).toBe(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
        });
    });

    describe('getSignedRecordingUrl', () => {
        it('Should return a SignedRecordingUrlResult on getSignedRecordingUrl', async () => {
            vendorSdk.state.capabilities.hasSignedRecordingUrl = false;
            expect(telephonyConnector.getSignedRecordingUrl('recordingUrl')).rejects.toThrow();
        });

        it('Should return a SignedRecordingUrlResult on getSignedRecordingUrl', async () => {
            const url = 'url';
            const duration = '10';
            const callId = 'callId';
            vendorSdk.state.capabilities.signedRecordingUrl = url;
            vendorSdk.state.capabilities.signedRecordingDuration = duration;
            vendorSdk.state.capabilities.hasSignedRecordingUrl = true;
            const signedRecordingUrlResult = await telephonyConnector.getSignedRecordingUrl('recordingUrl', url, callId);
            expect(signedRecordingUrlResult.success).toBeTruthy();
            expect(signedRecordingUrlResult.callId).toEqual(callId);
            expect(signedRecordingUrlResult.url).toEqual(url);
            expect(signedRecordingUrlResult.duration).toEqual(10);
        });
    });

    describe('connectParticipant', () => {
        it('Should publish a participant result on connectParticipant', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ phoneNumber: dummyPhoneNumber });
            call.contact = contact;
            await telephonyConnector.addParticipant(contact, call);
            connector.sdk.connectParticipant(call.callInfo, "inbound", call);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_CONNECTED
            }));
        });

        it('Should publish a participant result on connectParticipant for unified Routing', async () => {
            const mockFlowConfig = { isUnifiedRoutingEnabled: true };
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo,mockFlowConfig);
            const { call } = startCallResult;
            const contact = new Contact({ phoneNumber: dummyPhoneNumber });
            call.contact = contact;
            jest.spyOn(vendorSdk, 'executeOmniFlowForUnifiedRouting').mockImplementation(() => {});

            await telephonyConnector.addParticipant(contact, call);
            connector.sdk.connectParticipant(call.callInfo, "inbound", call);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_CONNECTED
            }));
            expect(vendorSdk.executeOmniFlowForUnifiedRouting).toHaveBeenCalledTimes(1);

        });

        it('Should publish a participant result on connectParticipant-internal call scenario', async () => {
            const contact = new Contact({ phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});

            await telephonyConnector.dial(contact);
            connector.sdk.connectParticipant({removeParticipantVariant : Constants.REMOVE_PARTICIPANT_VARIANT.ALWAYS }, Constants.CALL_TYPE.INTERNAL_CALL);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.CALL_CONNECTED
            }));
        });
        it('Should publish CALL_CONNECTED for consult call on connectParticipant', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const dialOptions = {
                isConsultCall : true
            }
            const result = await telephonyConnector.dial(contact, dialOptions);
            connector.sdk.connectParticipant(result.call.callInfo, Constants.CALL_TYPE.CONSULT, result.call);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({ eventType: Constants.VOICE_EVENT_TYPE.CALL_CONNECTED }))
        });
        it('Should publish CALL_CONNECTED for consult call on connectParticipant without callType', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const contact = new Contact({ id: 'dummyUser', phoneNumber: '100', type: Constants.CONTACT_TYPE.AGENT});
            const dialOptions = {
                isConsultCall : true
            }
            const result = await telephonyConnector.dial(contact, dialOptions);
            connector.sdk.connectParticipant(result.call.callInfo, Constants.CALL_TYPE.CONSULT, result.call);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({ eventType: Constants.VOICE_EVENT_TYPE.CALL_CONNECTED }))
        });
    });

    describe('removeParticipant', () => {
        it('Should publish a participant removed result on removeParticipant', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ phoneNumber: dummyPhoneNumber });
            await telephonyConnector.addParticipant(contact, call);
            const callResult = await connector.sdk.removeParticipant(Constants.PARTICIPANT_TYPE.THIRD_PARTY);
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_REMOVED, payload: callResult });
        });

        it('Should publish wrap-up started', async () => {
            jest.useFakeTimers();
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            connector.sdk.removeParticipant(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
            jest.runAllTimers();
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.AFTER_CALL_WORK_STARTED, payload: { callId: call.callId }});
        });

        it('[Multi-party] Should publish wrap-up started', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            connector.sdk.removeParticipant(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
            expect(publishEvent).toBeCalledWith(expect.objectContaining({ eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_REMOVED }));
            vendorSdk.state.isMultipartyAllowed = false;
        });

        it('should not publish wrap-up started when call is on-going', async () => {
            jest.useFakeTimers();
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const contact = new Contact({ phoneNumber: dummyPhoneNumber });
            await telephonyConnector.addParticipant(contact, call);
            await connector.sdk.removeParticipant(Constants.PARTICIPANT_TYPE.THIRD_PARTY);
            jest.runAllTimers();
            expect(publishEvent).toBeCalledTimes(2);
        });
    });

    describe('hangup', () => {
        it('Should publish a call result on hangUp', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const activeCall = vendorSdk.getCall({callId: call.callId});
            activeCall.callAttributes.participantType = Constants.PARTICIPANT_TYPE.AGENT;
            connector.sdk.hangup();
            expect(publishEvent).toBeCalledWith(expect.objectContaining({ eventType: Constants.VOICE_EVENT_TYPE.HANGUP }));
        });

        it('Should publish a call result on hangUp', async () => {
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber);
            const initialCall = startCallResult.call;
            const contact = new Contact({ phoneNumber: dummyPhoneNumber });
            await connector.sdk.addParticipant(contact, initialCall);
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(2);
            const activeCall = vendorSdk.getCall({callId: initialCall.callId});
            activeCall.callAttributes.participantType = Constants.PARTICIPANT_TYPE.AGENT;
            connector.sdk.hangup();
            expect(publishEvent).toBeCalledTimes(2);
        });

        it('Should publish wrap-up started', async () => {
            jest.useFakeTimers();
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const activeCall = vendorSdk.getCall({callId: call.callId});
            activeCall.callAttributes.participantType = Constants.PARTICIPANT_TYPE.AGENT;
            connector.sdk.hangup();
            jest.runAllTimers();
            expect(publishEvent).toBeCalledWith(expect.objectContaining({ eventType: Constants.VOICE_EVENT_TYPE.AFTER_CALL_WORK_STARTED }));
        });
    });

    describe('beginWrapup', () => {
        let testConnector;
        let sdk;

        beforeEach(() => {
            testConnector = new Connector(); 
            sdk = testConnector.sdk;
            sdk.state.activeCalls = {};
            sdk.state.agentAvailable = true;
            sdk.state.agentId = 'agentId';
            sdk.state.destroyedCalls = [];
            sdk.remoteStorage = {
                getItem: jest.fn().mockResolvedValue(null),
                setItem: jest.fn().mockResolvedValue({}),
                upsertCall: jest.fn().mockResolvedValue({}),
                endCall: jest.fn().mockResolvedValue({})
            };
            sdk.beginWrapup = jest.fn();
        });

        it('hangup should call beginWrap-up', async () => {
            const startCallResult = await sdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            const activeCall = sdk.getCall({callId: call.callId});
            activeCall.callAttributes.participantType = Constants.PARTICIPANT_TYPE.AGENT;
            testConnector.sdk.hangup();
            expect(sdk.beginWrapup).toBeCalledWith(expect.objectContaining({ callId: call.callId }));
        });

        it('endcall should call beginWrap-up', async () => {
            const startCallResult = await sdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            testConnector.sdk.endCall(call);
            expect(sdk.beginWrapup).toBeCalledWith(expect.objectContaining({ callId: call.callId }));
        });

        it('removeParticipant should call beginWrap-up', async () => {
            const startCallResult = await sdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            await testConnector.sdk.removeParticipant(Constants.PARTICIPANT_TYPE.INITIAL_CALLER);
            expect(sdk.beginWrapup).toBeCalledWith(expect.objectContaining({ callId: call.callId }));
        });
    });

    describe('endWrapup', () => {
        let connector = new Connector(); 
        let testConnector = connector.getTelephonyConnector();
        let sdk = testConnector.sdk;

        afterEach(() => {
            connector = new Connector(); 
            testConnector = connector.getTelephonyConnector();
            sdk = testConnector.sdk;
        });

        it('Should call sdk wrapup', () => {
            sdk.endWrapup = jest.fn();
            testConnector.wrapUpCall();
            expect(sdk.endWrapup).toBeCalled();
        });

        it('Should call log with "endWrapup" during endWrapup', () => {
            testConnector.wrapUpCall();
            expect(global.console.log).toBeCalledWith("endWrapup");
        });
    });

    describe('setAgentStatus', () => {
        it('Should return a valid generic result on setAgentStatus', async () => {
            const result = await connector.setAgentStatus(Constants.AGENT_STATUS.ONLINE);
            expect(result.success).toBeTruthy();
        });
    });

    describe('setAgentStatus', () => {
        it('Should return a valid generic result on setAgentStatus', async () => {
            const result = await connector.setAgentStatus(Constants.AGENT_STATUS.ONLINE, new AgentStatusInfo({statusId: 'dummyStatusId', statusApiName: 'dummyStatusApiName', statusName: 'dummyStatusName'}), true);
            expect(result.success).toBeTruthy();
        });
    });

    describe('handleMessage', () => {
        it('Should handle message', () => {
            const mockPostMessage = jest.fn();
            window.BroadcastChannel = jest.fn(() => {
                return { postMessage: mockPostMessage }
            });

            const message = { message: 'message' };
            connector.handleMessage(message);
            expect(mockPostMessage).toBeCalledWith({ type: Constants.SHARED_EVENT_TYPE.MESSAGE, payload: message });
        });
    });

    describe('publishMessage', () => {
        it('Should be able to publishMessage', () => {
            const message = { message: 'message' };
            vendorSdk.publishMessage(message)
            expect(publishEvent).toBeCalledWith({ eventType: Constants.SHARED_EVENT_TYPE.MESSAGE, payload: message });
        });
    });

    describe('sendDigits', () => {
        it('Should NOT throw on sendDigits', async () => {
            expect(telephonyConnector.sendDigits('dummydigits')).resolves.not.toThrow();
        });
    });

    describe('onAgentWorkEvent', () => {
        it('Should NOT throw on onAgentWorkEvent', async () => {
            expect(connector.onAgentWorkEvent('agentWork')).resolves.not.toThrow();
        });
    });

    describe('onAgentWorkEvent', () => {
        it('Should receive a pause event with the right work event type', async () => {
            const pauseWorkEvent = {
                workItemId: 'workItemId',
                workId: 'workId',
                workEvent: Constants.WORK_EVENT.PAUSED,
            }
            const pauseWorkResult = await connector.onAgentWorkEvent(pauseWorkEvent);
            expect(pauseWorkResult.workEvent).toEqual('PAUSED');
        });
    })

    describe('onAgentWorkEvent', () => {
        it('Should receive an unpause event with the right work event type', async () => {
            const unpauseWorkEvent = {
                workItemId: 'workItemId',
                workId: 'workId',
                workEvent: Constants.WORK_EVENT.UNPAUSED,
            }
            const unpauseWorkResult = await connector.onAgentWorkEvent(unpauseWorkEvent);
            expect(unpauseWorkResult.workEvent).toEqual('UNPAUSED');
        });
    })

    describe('onAgentWorkEvent', () => {
        it('Should receive an accept event with the right work event type', async () => {
            const acceptWorkEvent = {
                workItemId: 'workItemId',
                workId: 'workId',
                workEvent: Constants.WORK_EVENT.ACCEPTED,
            }
            const acceptWorkResult = await connector.onAgentWorkEvent(acceptWorkEvent);
            expect(acceptWorkResult.workEvent).toEqual('ACCEPTED');
        });
    });

    describe('onAgentWorkEvent', () => {
        it('Should receive an decline event with the right work event type', async () => {
            const declineWorkEvent = {
                workItemId: 'workItemId',
                workId: 'workId',
                workEvent: Constants.WORK_EVENT.DECLINED,
            }
            const declineWorkResult = await connector.onAgentWorkEvent(declineWorkEvent);
            expect(declineWorkResult.workEvent).toEqual('DECLINED');
        });
    });

    describe('subsystemLoginResult', () => {
        it('Should publish succesful LOGIN_RESULT on subsystemLoginResult', () => {
            vendorSdk.showLoginPage(true);
            vendorSdk.subsystemLoginResult(true);
            expect(publishEvent).toBeCalledWith({ eventType: Constants.SHARED_EVENT_TYPE.LOGIN_RESULT, payload: new GenericResult({
                success: true
            })});
        });

        it('Should publish failed LOGIN_RESULT on subsystemLoginResult', () => {
            vendorSdk.showLoginPage(true);
            vendorSdk.subsystemLoginResult(false);
            expect(publishEvent).toBeCalledWith({ eventType: Constants.SHARED_EVENT_TYPE.LOGIN_RESULT, payload: new GenericResult({
                success: false
            })});
        });
    });

    describe('log', () => {
        it('Should call the base logger when debugEnabled flag is set', () => {
            log.mockClear();
            global.console.log.mockClear();
            vendorSdk.state.capabilities.debugEnabled = true;
            vendorSdk.log("abcd");
            expect(log).toBeCalledWith({"message": "abcd"}, Constants.LOG_LEVEL.INFO);
            expect(global.console.log).not.toBeCalled();
        });
        it('Should call the base logger when a json object is logged', () => {
            log.mockClear();
            global.console.log.mockClear();
            vendorSdk.state.capabilities.debugEnabled = true;
            vendorSdk.log({type: "abcd"});
            expect(log).toBeCalledWith({"message": "{\"type\":\"abcd\"}"}, Constants.LOG_LEVEL.INFO);
            expect(global.console.log).not.toBeCalled();
        });
        it('Should not call the base logger when debugEnabled flag is unset', () => {
            log.mockClear();
            global.console.log.mockClear();
            vendorSdk.state.capabilities.debugEnabled = false;
            vendorSdk.log("abcd");
            expect(log).toBeCalledTimes(0);
            expect(global.console.log).toBeCalledTimes(1);
        });
    });

    describe('publishSetAgentStatus', () => {
        it('Should publish succesful SET_AGENT_STATUS on subsystemLoginResult', () => {
            const statusId = "statusId"; 
            vendorSdk.publishSetAgentStatus(statusId);
            expect(publishEvent).toBeCalledWith({ eventType: Constants.SHARED_EVENT_TYPE.SET_AGENT_STATUS, payload: new AgentStatusInfo({ statusId })});
        });
    });

    describe('publishCallBargedInEventToAgents', () => {
        
        it('Should publish succesful CALL_BARGED_IN', () => {
            const call = { callId: "callId", voiceCallId: "voiceCallId", callType: "inbound", state: "state" };
            vendorSdk.publishCallBargedInEventToAgents(call);
            expect(publishEvent).toBeCalledWith({ eventType: constants.USER_MESSAGE.CALL_BARGED_IN, payload: new SupervisedCallInfo(call)});
        });
    });

    describe('getPhoneContacts', () => {
        const onlineUser1 = new Contact ({ 
            id: 'onlineUser1',
            type: Constants.CONTACT_TYPE.AGENT,
            name : 'onlineUser1',
            phoneNumber: "onlineUser1",
            availability: "AVAILABLE"
        });

        beforeEach(() => {
            vendorSdk.state.onlineUsers = [onlineUser1.id];
            vendorSdk.state.userFullNames = new Map();
            vendorSdk.state.userFullNames.set('onlineUser1', 'onlineUser1');
            vendorSdk.state.phoneContacts = [
                new Contact({
                    id: 'id1',
                    phoneNumber: "555-555-4441",
                    type: Constants.CONTACT_TYPE.PHONENUMBER,
                    name: "AgentU",
                    listType: Constants.CONTACT_LIST_TYPE.ALL
                }),
                new Contact({
                    id: 'id2',
                    type: Constants.CONTACT_TYPE.PHONEBOOK,
                    phoneNumber: "555-555-4442",
                    name: "AgentV",
                    listType: Constants.CONTACT_LIST_TYPE.TRANSFER
                }),
                new Contact({
                    id: 'id3',
                    type: Constants.CONTACT_TYPE.PHONENUMBER,
                    name: "AgentW",
                    phoneNumber: "555-555-4443",
                    listType: Constants.CONTACT_LIST_TYPE.CONFERENCE
                })
            ]
        });
        
        it('Should return a valid result without filter', async () => {
            const result = await telephonyConnector.getPhoneContacts();
            const { contacts } = result;
            expect(contacts).toStrictEqual([onlineUser1].concat(vendorSdk.state.phoneContacts));
        });

        it('Should return a valid result with contains filter', async () => {
            const filter = '123';
            const contact = new Contact({phoneNumber: filter});
            vendorSdk.state.phoneContacts = [ contact ];
            const result = await telephonyConnector.getPhoneContacts({ contains: filter, types: [] });
            const { contacts } = result;
            expect(contacts).toEqual([contact]);
        });

        it('Should return a valid result with type QUEUE filter', async () => {
            const filter = Constants.CONTACT_TYPE.QUEUE;
            const contact = new Contact({type: filter});
            vendorSdk.state.phoneContacts = [ contact ];
            const result = await telephonyConnector.getPhoneContacts({ types: [Constants.CONTACTS_FILTER_TYPES.QUEUE]});
            const { contacts } = result;
            expect(contacts).toEqual([contact]);
        });

        it('Should return a valid result with type AGENT filter', async () => {
            const filter = Constants.CONTACT_TYPE.AGENT;
            const contact = new Contact({type: filter});
            vendorSdk.state.phoneContacts = [ contact ];
            vendorSdk.state.onlineUsers = [];
            vendorSdk.state.userFullNames = new Map();
            const result = await telephonyConnector.getPhoneContacts({ types: [Constants.CONTACTS_FILTER_TYPES.AGENT]});
            const { contacts } = result;
            expect(contacts).toEqual([contact]);
        });

        it('Should return a valid result with type PHONEBOOK filter', async () => {
            const filter = Constants.CONTACT_TYPE.PHONEBOOK;
            const contact = new Contact({type: filter});
            vendorSdk.state.phoneContacts = [ contact ];
            const result = await telephonyConnector.getPhoneContacts({ types: [Constants.CONTACTS_FILTER_TYPES.DIRECTORY]});
            const { contacts } = result;
            expect(contacts).toEqual([contact]);
        });

        it('Should return a valid result with type PHONENUMBER filter', async () => {
            const filter = Constants.CONTACT_TYPE.PHONENUMBER;
            const contact = new Contact({type: filter});
            vendorSdk.state.phoneContacts = [ contact ];
            const result = await telephonyConnector.getPhoneContacts({ types: [Constants.CONTACTS_FILTER_TYPES.CONTACT]});
            const { contacts } = result;
            expect(contacts).toEqual([contact]);
        });

        it('Should return a valid result with availability filter', async () => {
            const filter = Constants.CONTACT_TYPE.PHONENUMBER;
            const contact = new Contact({type: filter});
            vendorSdk.state.phoneContacts = [ contact ];
            const result = await telephonyConnector.getPhoneContacts({ types: [Constants.CONTACTS_FILTER_TYPES.AVAILABLE] });
            const { contacts } = result;
            expect(contacts).toStrictEqual([ onlineUser1 ]);
        });

        it('Should return a valid result with limit filter', async () => {
            const result = await telephonyConnector.getPhoneContacts({ limit: 1, types: [] });
            const { contacts } = result;
            expect(contacts).toStrictEqual([ onlineUser1 ]);
        });

        it('Should return a valid result with offest filter', async () => {
            const result = await telephonyConnector.getPhoneContacts({ offset: 1, types: [] });
            const { contacts } = result;
            expect(contacts).toStrictEqual(vendorSdk.state.phoneContacts);
        });

        it('Should return a valid result with limit and offset filter', async () => {
            const result = await telephonyConnector.getPhoneContacts({ limit: 1, offset: 1, types: []});
            const { contacts } = result;
            console.log(vendorSdk.state.phoneContacts[0]);
            expect(contacts).toStrictEqual([ vendorSdk.state.phoneContacts[0] ]);
        });
        
        it('Should return a valid result with limit, offset, contains and type filter', async () => {
            const result = await telephonyConnector.getPhoneContacts({ types: [Constants.CONTACTS_FILTER_TYPES.DIRECTORY], contains: "555", limit: 20, offset: 0 });
            const { contacts } = result;
            expect(contacts).toStrictEqual([ vendorSdk.state.phoneContacts[1] ]);
        });
    });

    describe('getContacts', () => {
        beforeEach(() => {
            vendorSdk.state.messagingContacts = [
                new Contact({
                    id: 'id1',
                    type: Constants.CONTACT_TYPE.AGENT,
                    name: "AgentU",
                    listType: Constants.CONTACT_LIST_TYPE.ALL
                }),
                new Contact({
                    id: 'id2',
                    type: Constants.CONTACT_TYPE.QUEUE,
                    name: "Queue1",
                    listType: Constants.CONTACT_LIST_TYPE.TRANSFER
                })
            ]
        });
        
        it('Should return a valid result without filter', async () => {
            const result = await connector.getContacts();
            const { contacts } = result;
            expect(contacts).toStrictEqual(vendorSdk.state.messagingContacts);
        });

        it('Should return a valid result with type QUEUE filter', async () => {
            const filter = Constants.CONTACT_TYPE.QUEUE;
            const contact = new Contact({type: filter});
            vendorSdk.state.messagingContacts = [ contact ];
            const result = await connector.getContacts({ type: Constants.CONTACT_TYPE.QUEUE });
            const { contacts } = result;
            expect(contacts).toEqual([contact]);
        });

        it('Should return a valid result with type AGENT filter', async () => {
            const filter = Constants.CONTACT_TYPE.AGENT;
            const contact = new Contact({type: filter});
            vendorSdk.state.messagingContacts = [ contact ];
            const result = await connector.getContacts({ type: filter });
            const { contacts } = result;
            expect(contacts).toEqual([contact]);
        });
    });

    describe('subsystemLogout', () => {
        it('Should publish a logout result on subsystemLogout', async () => {
            vendorSdk.subsystemLogout();
            expect(publishEvent).toBeCalledWith({ eventType: Constants.SHARED_EVENT_TYPE.LOGOUT_RESULT, payload: new LogoutResult({
                success: true,
                loginFrameHeight: 350
            })});
        });
    });

    describe('throwError', () => {
        afterAll(() => {
            vendorSdk.throwError(false);
        });

        it('Should throw error', async () => {
            vendorSdk.throwError(true);
            expect(vendorSdk.state.throwError).toBeTruthy();
        });

        it('Should throw error', async () => {
            vendorSdk.throwError(true);
            expect(connector.sdk.executeAsync('someMethod')).rejects.toStrictEqual('demo error');
        });
    });

    describe('throwCustomError', () => {
        afterAll(() => {
            vendorSdk.throwError(false);
            vendorSdk.customErrorChanged('');
        });

        it('Should throw custom error', async () => {
            vendorSdk.customErrorChanged('c.customErrorLabel');
            expect(vendorSdk.state.customError).toBe('c.customErrorLabel');
        });

        it('Should throw custom error object', async () => {
            vendorSdk.throwError(true);
            vendorSdk.customErrorChanged('c.customErrorLabel');
            const customError = new CustomError({ namespace: 'c', labelName: 'customErrorLabel'})
            expect(connector.sdk.executeAsync('someMethod')).rejects.toStrictEqual(customError);
        });
    });
    
    describe('delay', () => {
        it('delay 0 should resolve executeAsync', async () => {
            expect(connector.sdk.executeAsync('someMethod')).resolves.not.toThrow();
        });

        it('delay 1 should resolve executeAsync and return the payload', async () => {
            vendorSdk.state.delayMs = 1;
            jest.useFakeTimers();
            const payload = {a: 1};
            const result = connector.sdk.executeAsync('someMethod', payload);
            jest.runOnlyPendingTimers();
            await expect(result).resolves.toEqual(payload);
        });

        it('delay 1 should resolve executeAsync', async () => {
            vendorSdk.delay(1, connector.sdk.executeAsync);
            expect(connector.sdk.executeAsync('someMethod')).resolves.not.toThrow();
        });
        afterEach(() => {
            vendorSdk.state.delayMs = 0;
        });
    });

    describe('deskphone errors when action not supported', () => {
        it('Mute should throw error', async () => {
            vendorSdk.state.capabilities.hasMute = false;
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            await expect(connector.sdk.mute(call)).rejects.toStrictEqual(new Error("Mute is not supported"));
        });
        it('Unmute should throw error', async () => {
            vendorSdk.state.capabilities.hasMute = false;
            const startCallResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            const { call } = startCallResult;
            await expect(connector.sdk.unmute(call)).rejects.toStrictEqual(new Error("Mute is not supported"));
        });
        it('conference should throw error', async () => {
            vendorSdk.state.capabilities.hasMerge = false;
            await expect(connector.sdk.conference([])).rejects.toStrictEqual(new Error("Conference is not supported"));
        });
        it('swapCalls should throw error', async () => {
            vendorSdk.state.capabilities.hasSwap = false;
            await expect(connector.sdk.executeAsync("swapCalls")).rejects.toStrictEqual(new Error("Swap Calls is not supported"));
        });
        it('pauseRecording should throw error', async () => {
            vendorSdk.state.capabilities.hasRecord = false;
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            await expect(connector.sdk.pauseRecording()).rejects.toStrictEqual(new Error("Recording is not supported"));
        });
        it('resumeRecording should throw error', async () => {
            vendorSdk.state.capabilities.hasRecord = false;
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            await expect(connector.sdk.resumeRecording()).rejects.toStrictEqual(new Error("Recording is not supported"));
        });
    });

    describe('getCall', () => {
        it('Should error when no active calls are present', async () => {
            try {
                vendorSdk.getCall();
            } catch(e) {
                expect(e.message).toEqual("Couldn't find an active call");
            }
        });

        it('Should error when callId is not in activeCalls', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            try {
                vendorSdk.getCall({ callId: 123 });
            } catch(e) {
                expect(e.message).toEqual("Couldn't find an active call for callId 123");
            }
        });

        it('Should error when call is unknown', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            try {
                vendorSdk.getCall({ callType: 'unknown' });
            } catch(e) {
                expect(e.message).toEqual("Call is not defined or invalid.");
            }
        });

        it('Should return call when callId is known', async () => {
            const result = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            expect(vendorSdk.getCall({ callId: result.call.callId })).toEqual(result.call);
        });

        it('Should return call when type is HANGUP', async () => {
            const result = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            expect(vendorSdk.getCall({ callId: result.call.callId })).toEqual(result.call);
        });
        it('Should return call with contact Id', async () => {
            const result = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            expect(vendorSdk.getCall({ contact: { id:result.call.contact.id}})).toEqual(result.call);
        });
        it('Should return null with non-existing contact Id', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            expect(vendorSdk.getCall({ contact: { id:"random" }})).toEqual(null);
        });
        it('Should return call with receiver contact Id', async () => {
            const renderContactId = "renderContactId";
            const callInfo = new CallInfo({renderContactId: renderContactId})
            const result = new PhoneCall({callInfo});
            vendorSdk.state.activeCalls = { result };
            expect(vendorSdk.getCall({ callInfo: {renderContactId: renderContactId}})).toEqual(result);
        });
        it('Should return call with non-existing receiver contact Id', async () => {
            const renderContactId = "renderContactId";
            const callInfo = new CallInfo({renderContactId: renderContactId})
            const result = new PhoneCall({callInfo});
            vendorSdk.state.activeCalls = { result };
            expect(vendorSdk.getCall({ callInfo: {renderContactId: "random"}})).toEqual(null);
        });
    });

    describe('getPrimaryCall', () => {
        it('Should return the primary call', async () => {
            const primaryCall = new PhoneCall({ callAttributes: { participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }});
            vendorSdk.addCall(primaryCall);
            expect(vendorSdk.getPrimaryCall()).toEqual(primaryCall);
        });
    });

    describe('startInboundCall', () => {
        afterAll(() => {
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    json: () => Promise.resolve({ voiceCallId: "someId" })
                })
            );
        });

        it('Should publish CALL_STARTED on succesfull call creation', async () => {
            const callResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED, payload: callResult });
        });

        it('Should not publish CALL_STARTED if Agent is not available', async () => {
            expect.hasAssertions();
            vendorSdk.state.agentAvailable = false;
            const errorMessage = `Agent is not available for a inbound call from phoneNumber - ${dummyPhoneNumber}`;
            vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo).catch((error) => {
                expect(error.message).toEqual(errorMessage);
            });
        });

        it('Should reject on failed call creation', async () => {
            const error = 'Failed call creation';
            global.fetch = jest.fn(() => 
                Promise.reject(error)
            );
            await expect(vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo)).rejects.toBe(error);
        });
        it('Should still publish CALL_STARTED when createVoiceCall API is not available', async () => {
            global.fetch = jest.fn(() => 
                Promise.resolve({
                    json: () => Promise.resolve({ success : false })
                })
            );
            const callResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.CALL_STARTED, payload: callResult });
        });
        
        it('Should publish not CALL_STARTED on UnifiedRouting enabled flow', async () => {
            global.fetch = jest.fn((resource) => {
                if (resource.includes("executeOmniFlow")) {
                    return Promise.resolve({
                        json: () => Promise.resolve({agent: "dummyUser"})
                    });
                } else {
                    return Promise.resolve({
                        json: () => Promise.resolve({voiceCallId: "someId"})
                    });
                }
            });
            const dummyFlowConfig = {dialedNumber: "1234567890", flowName:"SCV_OMNI_FLOW", voiceCallId:"voiceCallId", fallbackQueue: "fallbackQueue", isUnifiedRoutingEnabled:true};
            const callResult = await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo, dummyFlowConfig);
            console.log('#$# CallResult = ' + callResult);
        });

        it('returns an error when executeOmniFlow fails', async () => {
            const dummyFlowConfig = {dialedNumber: "1234567890", flowName:"SCV_OMNI_FLOW", voiceCallId:"voiceCallId", fallbackQueue: "fallbackQueue", isUnifiedRoutingEnabled:true};
            let fetchMock = jest.fn();
            global.fetch = fetchMock;
            fetchMock.mockRejectedValue(new Error('Omni flow execution failed'));
            await expect(vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo, dummyFlowConfig)).rejects.toThrow('Omni flow execution failed');
          });
    });

    describe('requestCallback', () => {
        beforeEach(() => {
            publishEvent.mockClear();
        });

        it('Should publish a queued call back event on requestCallback', () => {
            connector.sdk.requestCallback({ phoneNumber: '100' });
            const argument = publishEvent.mock.calls[0][0];
            expect(argument.eventType).toEqual(Constants.VOICE_EVENT_TYPE.QUEUED_CALL_STARTED);
            expect(argument.payload.call.callType.toLowerCase()).toEqual(Constants.CALL_TYPE.CALLBACK.toLowerCase());
            expect(argument.payload.call.phoneNumber).toEqual('100');
        });

        it('Should return a promise for non-unified path so callers can chain', async () => {
            const result = connector.sdk.requestCallback({ phoneNumber: '100' });
            expect(result).toBeInstanceOf(Promise);
            await result;
        });

        it('Should use non-unified path when isUnifiedRouting is false', () => {
            connector.sdk.requestCallback({ phoneNumber: '200', isUnifiedRouting: false });
            expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.QUEUED_CALL_STARTED,
                payload: expect.objectContaining({
                    call: expect.objectContaining({ phoneNumber: '200' })
                })
            }));
        });

        it('Should use non-unified path when callbackNumber is missing', () => {
            connector.sdk.requestCallback({ phoneNumber: '300', isUnifiedRouting: true });
            expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.QUEUED_CALL_STARTED,
                payload: expect.objectContaining({
                    call: expect.objectContaining({ phoneNumber: '300' })
                })
            }));
        });

        it('Should create voice call and call requestCallback API when isUnifiedRouting and callbackNumber', async () => {
            const createVoiceCallRes = { voiceCallId: 'vc123', vendorCallKey: 'vkey456' };
            jest.spyOn(vendorSdk, 'createVoiceCall').mockResolvedValue(createVoiceCallRes);
            let requestCallbackFetchArgs;
            global.fetch = jest.fn((url, options) => {
                if (typeof url === 'string' && url.includes('/requestCallback')) {
                    requestCallbackFetchArgs = { url, options };
                    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
                }
                return Promise.resolve({ json: () => Promise.resolve(createVoiceCallRes) });
            });
            await vendorSdk.requestCallback({ phoneNumber: '100', callbackNumber: '5551234567', isUnifiedRouting: true });
            expect(vendorSdk.createVoiceCall).toHaveBeenCalledWith(undefined, 'inbound', '5551234567');
            expect(requestCallbackFetchArgs.url).toContain('/api/voiceCalls/vc123/requestCallback');
            const body = JSON.parse(requestCallbackFetchArgs.options.body);
            expect(body).toEqual({ callbackNumber: '5551234567', vendorCallKey: 'vkey456' });
        });

        it('Should NOT add call to activeCalls when unified routing callback succeeds', async () => {
            jest.spyOn(vendorSdk, 'createVoiceCall').mockResolvedValue({ voiceCallId: 'vc1', vendorCallKey: 'vk1' });
            global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
            await vendorSdk.requestCallback({ callbackNumber: '5550000000', isUnifiedRouting: true });
            expect(Object.keys(vendorSdk.state.activeCalls).length).toBe(0);
            const queuedCalls = publishEvent.mock.calls.filter(c => c[0].eventType === Constants.VOICE_EVENT_TYPE.QUEUED_CALL_STARTED);
            expect(queuedCalls.length).toBe(0);
        });

        it('Should reject when requestCallback API returns non-ok response', async () => {
            jest.spyOn(vendorSdk, 'createVoiceCall').mockResolvedValue({ voiceCallId: 'vc1', vendorCallKey: 'vk1' });
            global.fetch = jest.fn(() => Promise.resolve({
                ok: false, statusText: 'Bad Request',
                json: () => Promise.resolve({ message: 'callbackNumber invalid' })
            }));
            await expect(vendorSdk.requestCallback({ callbackNumber: '5550000000', isUnifiedRouting: true }))
                .rejects.toBeDefined();
        });

        it('Should reject when createVoiceCall fails in unified routing callback flow', async () => {
            jest.spyOn(vendorSdk, 'createVoiceCall').mockRejectedValue(new Error('createVoiceCall failed'));
            await expect(vendorSdk.requestCallback({ callbackNumber: '5550000000', isUnifiedRouting: true }))
                .rejects.toThrow('createVoiceCall failed');
        });

        it('Should include isPreviewCallback in request body when set to true', async () => {
            const createVoiceCallRes = { voiceCallId: 'vc123', vendorCallKey: 'vkey456' };
            jest.spyOn(vendorSdk, 'createVoiceCall').mockResolvedValue(createVoiceCallRes);
            let requestCallbackFetchArgs;
            global.fetch = jest.fn((url, options) => {
                if (typeof url === 'string' && url.includes('/requestCallback')) {
                    requestCallbackFetchArgs = { url, options };
                    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
                }
                return Promise.resolve({ json: () => Promise.resolve(createVoiceCallRes) });
            });
            await vendorSdk.requestCallback({ phoneNumber: '100', callbackNumber: '5551234567', isUnifiedRouting: true, isPreviewCallback: true });
            const body = JSON.parse(requestCallbackFetchArgs.options.body);
            expect(body).toEqual({ callbackNumber: '5551234567', vendorCallKey: 'vkey456', isPreviewCallback: true });
        });

        it('Should NOT include isPreviewCallback in request body when not provided', async () => {
            const createVoiceCallRes = { voiceCallId: 'vc123', vendorCallKey: 'vkey456' };
            jest.spyOn(vendorSdk, 'createVoiceCall').mockResolvedValue(createVoiceCallRes);

            let requestCallbackFetchArgs;
            global.fetch = jest.fn((url, options) => {
                if (typeof url === 'string' && url.includes('/requestCallback')) {
                    requestCallbackFetchArgs = { url, options };
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({})
                    });
                }
                return Promise.resolve({ json: () => Promise.resolve(createVoiceCallRes) });
            });

            await vendorSdk.requestCallback({ phoneNumber: '100', callbackNumber: '5551234567', isUnifiedRouting: true });

            expect(global.fetch).toHaveBeenCalled();
            const body = JSON.parse(requestCallbackFetchArgs.options.body);
            expect(body).toEqual({ callbackNumber: '5551234567', vendorCallKey: 'vkey456' });
        });
    });

    describe('Supervisor listen in/Barge In', () => {
        beforeEach(() => {
            jest.spyOn(vendorSdk, 'mergeConsultCall').mockImplementation((args) => args);
            jest.spyOn(vendorSdk, 'connectParticipant').mockImplementation((args) => args);
            vendorSdk.state.capabilities.hasSupervisorListenIn = true;
          });
        afterEach(() => {
            jest.restoreAllMocks();
            vendorSdk.state.isMultipartyAllowed = false;
            vendorSdk.state.capabilities.hasSupervisorListenIn = false;
          });
        const call = { callId: "callId", voiceCallId: "voiceCallId", callType: "inbound", state: "state" };
        it('superviseCall should return the correct payload', async () => {
            const result = await telephonyConnector.superviseCall(call);
            expect(result.call.callAttributes.participantType).toBe("Supervisor");
            expect(result.call.callAttributes.voiceCallId).toBe("voiceCallId");
            expect(result.call.state).toBe("connected");
        });
        it('supervisorDisconnect should return the correct payload', async () => {
            await telephonyConnector.superviseCall(call);
            const result = await telephonyConnector.supervisorDisconnect(call);
            expect(result.calls.length).toBe(1);
            expect(result.calls[0].state).toBe("ended");
        });
        it('supervisorBargeIn should return the correct payload', async () => {
            await telephonyConnector.superviseCall(call);
            const result = await telephonyConnector.supervisorBargeIn(call);
            expect(result.call.callType).toBe('inbound');
            expect(result.call.state).toBe('connected');
            expect(result.call.callAttributes.participantType).toBe('Supervisor');

        });
        it('superviseCall should fail if there is an active call', async () => {
            await vendorSdk.startInboundCall(dummyPhoneNumber, globalDummyCallInfo);
            telephonyConnector.superviseCall(call).catch((error) => {
                expect(error.message).toEqual('Agent is not available to supervise a call');
            });
        });
        it('connectSupervisor', async () => {
            await telephonyConnector.superviseCall(call);
            await telephonyConnector.sdk.connectSupervisor();
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.SUPERVISOR_CALL_CONNECTED, payload: expect.anything()});
        });
        it('removeSupervisor', async () => {
            await telephonyConnector.superviseCall(call);
            await telephonyConnector.sdk.removeSupervisor();
            expect(publishEvent).toBeCalledWith({ eventType: Constants.VOICE_EVENT_TYPE.SUPERVISOR_HANGUP, payload: expect.anything()});
        });
        it('bargeIn', async () => {
            await telephonyConnector.superviseCall(call);
            const result = await telephonyConnector.sdk.supervisorBargeIn(call);
            expect(result.call.callAttributes.participantType).toBe("Supervisor");
            expect(result.call.callAttributes.voiceCallId).toBe("voiceCallId");
            expect(result.call.state).toBe("connected");
        });

        it('supervisor should not get merged into calls', async () => {
            vendorSdk.state.isMultipartyAllowed = true;
            await telephonyConnector.superviseCall(call);
            const callToMerge = { 
                phoneNumber: "phoneNumber",
                callId: "callId",
                voiceCallId: "voiceCallId",
                callInfo: {
                    renderContactId: "id"
                }
            }
            const message = { 
                messageType: constants.USER_MESSAGE.MERGE,
                data: {
                    consultCall: callToMerge,
                    activeConferenceCalls: {call}
                },
                fromUsername: "id"
             };
            // simulate the message sent from conference
            publishEvent(message);
            expect(vendorSdk.isSupervisorListeningIn()).toBeTruthy();
            expect(vendorSdk.mergeConsultCall).not.toBeCalled();
        });

        it('supervisor should not connect transferred participants nor see a call group', async() => {
            vendorSdk.state.isMultipartyAllowed = true;
            await telephonyConnector.superviseCall(call);
            const message = {
                messageType: constants.USER_MESSAGE.PARTICIPANT_CONNECTED,
                data: {
                    phoneNumber: 'dummyNumber',
                    callInfo: 'dummyCallInfo'
                }
            };
             // simulate the message sent from add caller
            publishEvent(message);
            expect(vendorSdk.isSupervisorListeningIn()).toBeTruthy();
            // connectParticipant getting called will result in call group
            expect(vendorSdk.connectParticipant).not.toBeCalled();
        });

        it('isSupervisorListeningIn should not throw when callAttribute is not present', async() => {
            const call = {callId: 'callId'};
            vendorSdk.addCall(call);
            expect(() => vendorSdk.isSupervisorListeningIn()).not.toThrow();
        })
    });

    describe('previewCall', () => {
        it('Should publish a preview call started event on previewCall', async () => {
            telephonyConnector.sdk.previewCall({ phoneNumber: '100' });
            const argument = publishEvent.mock.calls[0][0];
            expect(argument.eventType).toEqual(Constants.VOICE_EVENT_TYPE.PREVIEW_CALL_STARTED);
            expect(argument.payload.call.callType.toLowerCase()).toEqual(Constants.CALL_TYPE.OUTBOUND.toLowerCase());
            expect(argument.payload.call.callAttributes.dialerType.toLowerCase()).toEqual(Constants.DIALER_TYPE.OUTBOUND_PREVIEW.toLowerCase());
            expect(argument.payload.call.phoneNumber).toEqual('100');
        });
    });

    describe('updateAudioStats', () => {
        it('Should publish a update audio stats event successfully', async () => {
            const audioStats = {stats: [{inputChannelStats: {packetsCount: 90, packetsLost: 10, jitterBufferMillis: 300, roundTripTimeMillis: 350}, outputChannelStats: {packetsCount: 90, packetsLost: 10, jitterBufferMillis: 300, roundTripTimeMillis: 350}}]};
            connector.sdk.updateAudioStats(audioStats);
            const argument = publishEvent.mock.calls[0][0];
            expect(argument.eventType).toEqual(Constants.VOICE_EVENT_TYPE.UPDATE_AUDIO_STATS);
            expect(argument.payload.stats[0].inputChannelStats.packetsCount).toEqual(audioStats.stats[0].inputChannelStats.packetsCount);
            expect(argument.payload.stats[0].inputChannelStats.packetsLost).toEqual(audioStats.stats[0].inputChannelStats.packetsLost);
            expect(argument.payload.stats[0].inputChannelStats.jitterBufferMillis).toEqual(audioStats.stats[0].inputChannelStats.jitterBufferMillis);
            expect(argument.payload.stats[0].inputChannelStats.roundTripTimeMillis).toEqual(audioStats.stats[0].inputChannelStats.roundTripTimeMillis);
            expect(argument.payload.stats[0].outputChannelStats.packetsCount).toEqual(audioStats.stats[0].outputChannelStats.packetsCount);
            expect(argument.payload.stats[0].outputChannelStats.packetsLost).toEqual(audioStats.stats[0].outputChannelStats.packetsLost);
            expect(argument.payload.stats[0].outputChannelStats.jitterBufferMillis).toEqual(audioStats.stats[0].outputChannelStats.jitterBufferMillis);
            expect(argument.payload.stats[0].outputChannelStats.roundTripTimeMillis).toEqual(audioStats.stats[0].outputChannelStats.roundTripTimeMillis);
        });
        it('Should publish a update audio stats event successfully with only input channel', async () => {
            const audioStats = {stats: [{inputChannelStats: {packetsCount: 90, packetsLost: 10, jitterBufferMillis: 300, roundTripTimeMillis: 350}}]};
            connector.sdk.updateAudioStats(audioStats);
            const argument = publishEvent.mock.calls[0][0];
            expect(argument.eventType).toEqual(Constants.VOICE_EVENT_TYPE.UPDATE_AUDIO_STATS);
            expect(argument.payload.stats[0].inputChannelStats.packetsCount).toEqual(audioStats.stats[0].inputChannelStats.packetsCount);
            expect(argument.payload.stats[0].inputChannelStats.packetsLost).toEqual(audioStats.stats[0].inputChannelStats.packetsLost);
            expect(argument.payload.stats[0].inputChannelStats.jitterBufferMillis).toEqual(audioStats.stats[0].inputChannelStats.jitterBufferMillis);
            expect(argument.payload.stats[0].inputChannelStats.roundTripTimeMillis).toEqual(audioStats.stats[0].inputChannelStats.roundTripTimeMillis);
        });
        it('Should publish a update audio stats event successfully with only output channel', async () => {
            const audioStats = {stats: [{outputChannelStats: {packetsCount: 90, packetsLost: 10, jitterBufferMillis: 300, roundTripTimeMillis: 350}}]};
            connector.sdk.updateAudioStats(audioStats);
            const argument = publishEvent.mock.calls[0][0];
            expect(argument.eventType).toEqual(Constants.VOICE_EVENT_TYPE.UPDATE_AUDIO_STATS);
            expect(argument.payload.stats[0].outputChannelStats.packetsCount).toEqual(audioStats.stats[0].outputChannelStats.packetsCount);
            expect(argument.payload.stats[0].outputChannelStats.packetsLost).toEqual(audioStats.stats[0].outputChannelStats.packetsLost);
            expect(argument.payload.stats[0].outputChannelStats.jitterBufferMillis).toEqual(audioStats.stats[0].outputChannelStats.jitterBufferMillis);
            expect(argument.payload.stats[0].outputChannelStats.roundTripTimeMillis).toEqual(audioStats.stats[0].outputChannelStats.roundTripTimeMillis);
        });
    });

    describe('hidDeviceHandler', () => {
        let mockConfig;
        let mockParser;
        beforeEach(() => {
            mockParser = {
                parseInputReport: jest.fn(),
            };
            mockConfig = {
                hidDeviceInfo: {
                    vendorId: 1234,
                    productId: 5678
                }
            };
            global.navigator.hid = {
                getDevices: jest.fn()
            };
        });
        afterEach(() => {
            jest.clearAllMocks();
        });

        it('should handle no devices found', async () => {
            global.navigator.hid.getDevices.mockResolvedValue([]);
            await expect(hidDeviceHandler(mockConfig, vendorSdk)).resolves.toBeUndefined();
            expect(global.navigator.hid.getDevices).toHaveBeenCalled();
        });

        it('should handle device found and open successfully', async () => {
            const mockDevice = {
                vendorId: 1234,
                productId: 5678,
                open: jest.fn().mockResolvedValue(),
                productName: 'Plantronics Blackwire 5220 Series',
                oninputreport: null
            };
            global.navigator.hid.getDevices.mockResolvedValue([mockDevice]);
            getHIDParser.mockReturnValue(mockParser);

            await hidDeviceHandler(mockConfig, vendorSdk);

            expect(mockDevice.open).toHaveBeenCalled();
            expect(typeof mockDevice.oninputreport).toBe('function');
            expect(getHIDParser).toHaveBeenCalledWith(mockDevice);

            const inputReportEvent = { data: new DataView(new ArrayBuffer(0)) };
            mockDevice.oninputreport(inputReportEvent);
            expect(mockParser.parseInputReport).toHaveBeenCalledWith(inputReportEvent, vendorSdk);
        });

        it('should not call parser if no matching device is found', async () => {
            const nonMatchingDevice = {
                vendorId: 1111,
                productId: 2222,
                open: jest.fn(),
                oninputreport: null
            };
            global.navigator.hid.getDevices.mockResolvedValue([nonMatchingDevice]);
            getHIDParser.mockReturnValue(mockParser);

            await hidDeviceHandler(mockConfig, vendorSdk);
            expect(nonMatchingDevice.open).not.toHaveBeenCalled();
            expect(getHIDParser).not.toHaveBeenCalled();
        });

        it('should not set oninputreport if device open fails', async () => {
            const mockDevice = {
                vendorId: 1234,
                productId: 5678,
                open: jest.fn().mockRejectedValue(new Error('Failed to open')),
                productName: 'Plantronics Blackwire 5220 Series',
                oninputreport: null
            };
            global.navigator.hid.getDevices.mockResolvedValue([mockDevice]);
            mockDevice.open = jest.fn().mockRejectedValue(new Error('Failed to open'));

            await expect(hidDeviceHandler(mockConfig, vendorSdk)).rejects.toThrow('Failed to open');
            expect(mockDevice.open).toHaveBeenCalled();
            expect(mockDevice.oninputreport).toBeNull();
        });

        it('should not take any device actions if hidDeviceInfo is undefined', async () => {
            mockConfig.hidDeviceInfo = undefined;
            await hidDeviceHandler(mockConfig, vendorSdk);
            expect(global.navigator.hid.getDevices).toHaveBeenCalled();
            expect(getHIDParser).not.toHaveBeenCalled();
        });
    });

    describe("executeOmniFlowForUnifiedRouting", () => {
        beforeEach(() => {
            fetchMock.enableMocks();
          });
        afterEach(() => {
            fetchMock.resetMocks();
          });
        it("should successfully call API and return response", async () => {
            fetchMock.mockResponseOnce(JSON.stringify({ success: true }));
            const call = { voiceCallId: "12345" };
            const flowConfig = {
                dialedNumber: "9876543210",
                flowDevName: "TestFlow",
                fallbackQueue: "Queue1",
                isTransferFlow: false
            };
            const response = await vendorSdk.executeOmniFlowForUnifiedRouting(call, flowConfig);
            expect(fetchMock).toHaveBeenCalledWith("/api/executeOmniFlow", expect.objectContaining({
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dialedNumber: "9876543210",
                    voiceCallId: "12345",
                    fallbackQueue: "Queue1",
                    flowName: "TestFlow"
                })
            }));
            expect(response).toEqual({ success: true });
        });
    
        it("should include flowDevName when isTransferFlow is true", async () => {
            fetchMock.mockResponseOnce(JSON.stringify({ success: true }));
            const call = { voiceCallId: "12345" };
            const flowConfig = {
                dialedNumber: "9876543210",
                flowDevName: "TestTransferFlow",
                fallbackQueue: "Queue1",
                isTransferFlow: true
            };
            const response = await vendorSdk.executeOmniFlowForUnifiedRouting(call, flowConfig);
            expect(fetchMock).toHaveBeenCalledWith("/api/executeOmniFlow", expect.objectContaining({
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dialedNumber: "9876543210",
                    voiceCallId: "12345",
                    fallbackQueue: "Queue1",
                    flowDevName: "TestTransferFlow"
                })
            }));
            expect(response).toEqual({ success: true });
        });

        it("should include transferTarget", async () => {
            fetchMock.mockResponseOnce(JSON.stringify({ success: true }));
            const call = { voiceCallId: "12345" ,transferTo:"3333"};
            const flowConfig = {
                dialedNumber: "9876543210",
                flowDevName: "TestTransferFlow",
                fallbackQueue: "Queue1",
                isTransferFlow: true
            };
            const response = await vendorSdk.executeOmniFlowForUnifiedRouting(call, flowConfig);
            expect(fetchMock).toHaveBeenCalledWith("/api/executeOmniFlow", expect.objectContaining({
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dialedNumber: "9876543210",
                    voiceCallId: "12345",
                    fallbackQueue: "Queue1",
                    transferTarget: "3333",
                    flowDevName: "TestTransferFlow"

                })
            }));
            expect(response).toEqual({ success: true });
        });

        it("should handle API errors gracefully", async () => {
            fetchMock.mockReject(new Error("Network Error"));
            const call = { voiceCallId: "12345" };
            const flowConfig = {
                dialedNumber: "9876543210",
                flowDevName: "TestFlow",
                fallbackQueue: "Queue1",
                isTransferFlow: false
            };
            await expect(vendorSdk.executeOmniFlowForUnifiedRouting(call, flowConfig)).rejects.toThrow("Network Error");
        });
    });

    describe('addParticipant - blind transfer with unified routing', () => {
        let vendorSdk, parentCall, contact;
        let originalFetch;

        beforeAll(() => {
            // Mock global.fetch for this suite
            originalFetch = global.fetch;
            global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ voiceCallId: 'newVoiceCallId', vendorCallKey: 'newTransferVendorKey' }) }));
        });
        afterAll(() => {
            global.fetch = originalFetch;
        });

        beforeEach(() => {
            vendorSdk = new Sdk();
            vendorSdk.state.agentId = 'agentId';
            vendorSdk.state.destroyedCalls = [];
            vendorSdk.remoteStorage = {
                getItem: jest.fn().mockResolvedValue(null),
                setItem: jest.fn().mockResolvedValue({}),
                upsertCall: jest.fn().mockResolvedValue({}),
                endCall: jest.fn().mockResolvedValue({})
            };
            vendorSdk.state.flowConfig = { isUnifiedRoutingEnabled: true, dialedNumber: '12345' };
            vendorSdk.state.onlineUsers = ['onlineUser'];
            parentCall = new PhoneCall({
                callId: 'parentCallId',
                phoneNumber: '12345',
                contact: new Contact({ id: 'parentContactId', phoneNumber: '12345' }),
                callAttributes: new PhoneCallAttributes({ isAutoMergeOn: false }),
                callInfo: new CallInfo({}),
            });
            vendorSdk.addCall(parentCall);
            contact = { id: 'onlineUser', type: 'Agent', phoneNumber: '12345' };
            jest.spyOn(vendorSdk, 'createVoiceCall').mockResolvedValue({
                vendorCallKey: 'newTransferVendorKey',
                voiceCallId: 'newVoiceCallId'
            });
            jest.spyOn(vendorSdk, 'destroyCall').mockReturnValue({});
            vendorSdk.messageUser = jest.fn();
        });
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should call messageUser with transferTo for online user (if branch)', async () => {
            await vendorSdk.addParticipant(contact, parentCall, true);
            expect(vendorSdk.messageUser).not.toBeCalled();
            expect(vendorSdk.remoteStorage.upsertCall).toHaveBeenCalled();
        });

        it('should call messageUser with null for offline user (else branch, unified routing)', async () => {
            vendorSdk.state.onlineUsers = [];
            contact = { id: 'queueId', type: 'Queue', phoneNumber: '12345' };
            await vendorSdk.addParticipant(contact, parentCall, true);
            expect(vendorSdk.messageUser).not.toBeCalled();
            expect(vendorSdk.remoteStorage.upsertCall).toHaveBeenCalled();
        });

        it('when useRouteFlowApi is true, should call routeVoiceCall and not executeOmniFlowForUnifiedRouting', async () => {
            vendorSdk.state.flowConfig.useRouteFlowApi = true;
            const routeVoiceCallSpy = jest.spyOn(vendorSdk, 'routeVoiceCall').mockResolvedValue({ status: 'Success' });
            const executeOmniFlowSpy = jest.spyOn(vendorSdk, 'executeOmniFlowForUnifiedRouting').mockResolvedValue({});
            await vendorSdk.addParticipant(contact, parentCall, true);
            expect(routeVoiceCallSpy).toHaveBeenCalledTimes(1);
            expect(routeVoiceCallSpy).toHaveBeenCalledWith('newTransferVendorKey', { routingTarget: 'onlineUser' });
            expect(executeOmniFlowSpy).not.toHaveBeenCalled();
        });

        it('when useRouteFlowApi is false, should call executeOmniFlowForUnifiedRouting and not routeVoiceCall', async () => {
            vendorSdk.state.flowConfig.useRouteFlowApi = false;
            const routeVoiceCallSpy = jest.spyOn(vendorSdk, 'routeVoiceCall').mockResolvedValue({ status: 'Success' });
            const executeOmniFlowSpy = jest.spyOn(vendorSdk, 'executeOmniFlowForUnifiedRouting').mockResolvedValue({});
            await vendorSdk.addParticipant(contact, parentCall, true);
            expect(executeOmniFlowSpy).toHaveBeenCalledTimes(1);
            expect(routeVoiceCallSpy).not.toHaveBeenCalled();
        });

        it('when contact is FLOW and unified routing enabled, should call routeVoiceCall with flow id', async () => {
            const flowContact = new Contact({ id: 'myFlowId', type: Constants.CONTACT_TYPE.FLOW });
            const routeVoiceCallSpy = jest.spyOn(vendorSdk, 'routeVoiceCall').mockResolvedValue({ status: 'Success' });
            const executeUnifiedRoutingTransferSpy = jest.spyOn(vendorSdk, 'executeUnifiedRoutingTransfer').mockResolvedValue();
            await vendorSdk.addParticipant(flowContact, parentCall, true);
            expect(routeVoiceCallSpy).toHaveBeenCalledTimes(1);
            expect(routeVoiceCallSpy).toHaveBeenCalledWith('newVoiceCallId', { routingTarget: 'myFlowId' });
            expect(executeUnifiedRoutingTransferSpy).not.toHaveBeenCalled();
        });

        it('when contact is FLOW and unified routing disabled, should call executeOmniFlow', async () => {
            vendorSdk.state.flowConfig = { isUnifiedRoutingEnabled: false };
            vendorSdk.state.onlineUsers = ['resolvedAgentId'];
            const flowContact = new Contact({ id: 'myFlowId', type: Constants.CONTACT_TYPE.FLOW });
            jest.spyOn(vendorSdk, 'executeOmniFlow').mockResolvedValue({ agent: 'resolvedAgentId' });
            await vendorSdk.addParticipant(flowContact, parentCall, true);
            expect(vendorSdk.executeOmniFlow).toHaveBeenCalled();
        });
    });
    describe('ctrSync', () => {
        let fetchMock;
 
 
        beforeEach(() => {
            fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true })
                })
            );
        });
 
 
        afterEach(() => {
            fetchMock.mockRestore();
        });
 
 
        it('should return error when voiceCallId is not provided', async () => {
            const result = await vendorSdk.ctrSync('');
           
            expect(result.success).toBe(false);
            expect(result.message).toBe('Voice Call ID is required');
            expect(fetchMock).not.toHaveBeenCalled();
        });
 
 
        it('should return error when all participants have not hung up', async () => {
            vendorSdk.state.activeCalls = { 'call1': {} }; // Active calls exist
           
            const result = await vendorSdk.ctrSync('test-voice-call-id');
           
            expect(result.success).toBe(false);
            expect(result.message).toBe('Cannot sync CTR: Not all participants have hung up');
            expect(fetchMock).not.toHaveBeenCalled();
        });
 
 
        it('should call /api/updateVoiceCall with correct parameters when successful', async () => {
            vendorSdk.state.activeCalls = {}; // No active calls
            const voiceCallId = 'test-voice-call-id';
 
 
            const result = await vendorSdk.ctrSync(voiceCallId);
 
 
            expect(fetchMock).toHaveBeenCalledWith('/api/updateVoiceCall', expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: expect.stringContaining('"voiceCallId":"test-voice-call-id"')
            }));
 
 
            expect(fetchMock).toHaveBeenCalledWith('/api/updateVoiceCall', expect.objectContaining({
                body: expect.stringContaining('"isActiveCall":false')
            }));
 
 
            expect(result.success).toBe(true);
            expect(result.message).toBe('Voice call updated successfully');
        });
 
 
        it('should handle fetch failure gracefully', async () => {
            vendorSdk.state.activeCalls = {};
            const errorMessage = 'Network error';
           
            fetchMock.mockImplementation(() =>
                Promise.reject(new Error(errorMessage))
            );
 
 
            const result = await vendorSdk.ctrSync('test-voice-call-id');
 
 
            expect(result.success).toBe(false);
            expect(result.message).toBe(`Voice call update failed: ${errorMessage}`);
        });
 
 
 
 
        it('should handle server response with success: false', async () => {
            vendorSdk.state.activeCalls = {};
           
            fetchMock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: false })
                })
            );
 
 
            const result = await vendorSdk.ctrSync('test-voice-call-id');
 
 
            expect(result.success).toBe(false);
            expect(result.message).toBe('Voice call update failed');
        });
    });
 
 
    describe('verifyCallState', () => {
        it('should return allParticipantsHungUp: true when no active calls', async () => {
            vendorSdk.state.activeCalls = {};
           
            const result = await vendorSdk.verifyCallState();
           
            expect(result.allParticipantsHungUp).toBe(true);
        });
 
 
        it('should return allParticipantsHungUp: false when active calls exist', async () => {
            vendorSdk.state.activeCalls = { 'call1': {}, 'call2': {} };
           
            const result = await vendorSdk.verifyCallState();
           
            expect(result.allParticipantsHungUp).toBe(false);
        });
    });

    describe('handleServerEvent', () => {
        beforeEach(() => {
            publishEvent.mockClear();
        });

        it('Should handle HOLD_TOGGLE event', () => {
            const call = new PhoneCall({
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }),
                callInfo: new CallInfo({ isMuted: false, isOnHold: false })
            });
            call.callId = 'holdTestCall';
            vendorSdk.state.activeCalls['holdTestCall'] = call;
            vendorSdk.handleServerEvent({
                eventType: USER_MESSAGE.HOLD_TOGGLE,
                data: { callId: 'holdTestCall', callInfo: { isOnHold: true } }
            });
            expect(publishEvent).toBeCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.HOLD_TOGGLE
            }));
        });

        it('Should handle HOLD_TOGGLE error gracefully', () => {
            vendorSdk.handleServerEvent({
                eventType: USER_MESSAGE.HOLD_TOGGLE,
                data: { callId: 'nonexistent', callInfo: { isOnHold: true } }
            });
            expect(publishEvent).not.toBeCalled();
        });

        it('Should handle CALL_STARTED event via server_event', async () => {
            vendorSdk.handleServerEvent({
                eventType: USER_MESSAGE.CALL_STARTED,
                data: {
                    phoneNumber: 'phone1',
                    callId: 'serverCallId',
                    voiceCallId: 'vId',
                    callInfo: { isOnHold: false },
                    fromContact: { id: 'agent1' },
                    activeConferenceCalls: []
                }
            });
            await new Promise(r => setTimeout(r, 0));
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(1);
        });

        it('Should handle MERGE with no active calls', () => {
            vendorSdk.state.activeCalls = {};
            vendorSdk.handleServerEvent({
                eventType: USER_MESSAGE.MERGE,
                data: { consultCall: {} },
                fromUsername: 'other'
            });
            expect(publishEvent).not.toBeCalled();
        });
    });

    describe('processCallDestroyed - additional paths', () => {
        it('Should hangupAll when isHangup is true and target matches', () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const call = new PhoneCall({
                callId: 'hangupTestCall',
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }),
                callInfo: new CallInfo({ isMuted: false })
            });
            vendorSdk.addCall(call);
            publishEvent.mockClear();
            vendorSdk.processCallDestroyed({
                call: { callId: 'hangupTestCall', target: 'agentId', reason: 'ENDED' },
                isHangup: true,
                reason: 'ENDED'
            });
            expect(Object.keys(vendorSdk.state.activeCalls).length).toEqual(0);
        });

        it('Should handle consult call removal with wrapup', () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const call = new PhoneCall({
                callId: 'consultDestroyCall',
                callType: Constants.CALL_TYPE.CONSULT.toString(),
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }),
                callInfo: new CallInfo({ isMuted: false })
            });
            vendorSdk.addCall(call);
            publishEvent.mockClear();
            vendorSdk.processCallDestroyed({
                call: { callId: 'consultDestroyCall', target: 'agentId', reason: 'ENDED' }
            });
            expect(publishEvent).toBeCalledWith(expect.objectContaining({
                eventType: Constants.VOICE_EVENT_TYPE.PARTICIPANT_REMOVED
            }));
        });
    });

    describe('additional coverage', () => {
        it('getPrimaryCall should fallback to supervisor', () => {
            const call = new PhoneCall({
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR }),
                callInfo: new CallInfo({ isMuted: false })
            });
            vendorSdk.addCall(call);
            const result = vendorSdk.getPrimaryCall();
            expect(result.callAttributes.participantType).toEqual(Constants.PARTICIPANT_TYPE.SUPERVISOR);
        });

        it('getPrimaryCall should fallback to consult call', () => {
            const call = new PhoneCall({
                callAttributes: new PhoneCallAttributes({ isConsultCall: true }),
                callInfo: new CallInfo({ isMuted: false })
            });
            vendorSdk.addCall(call);
            const result = vendorSdk.getPrimaryCall();
            expect(result).toBeDefined();
        });

        it('getPrimaryCall should fallback to first active call', () => {
            const call = new PhoneCall({
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }),
                callInfo: new CallInfo({ isMuted: false })
            });
            vendorSdk.addCall(call);
            const result = vendorSdk.getPrimaryCall();
            expect(result).toBeDefined();
        });

        it('updateCallInfo should fallback to supervisor call', () => {
            const call = new PhoneCall({
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR }),
                callInfo: new CallInfo({ isMuted: false })
            });
            vendorSdk.addCall(call);
            const result = vendorSdk.updateCallInfo({ isMuted: true });
            expect(result.callInfo.isMuted).toBeTruthy();
        });

        it('connectParticipant should return when no active calls', () => {
            vendorSdk.state.activeCalls = {};
            const result = vendorSdk.connectParticipant(null, null, null);
            expect(result).toBeUndefined();
        });

        it('connectParticipant should add new participant in multiparty', () => {
            vendorSdk.state.isMultipartyAllowed = true;
            const existingCall = new PhoneCall({
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }),
                callInfo: new CallInfo({ isMuted: false })
            });
            vendorSdk.addCall(existingCall);
            publishEvent.mockClear();
            const newCall = {
                callId: 'newParticipant1',
                callType: Constants.CALL_TYPE.ADD_PARTICIPANT,
                contact: { id: 'ext1', phoneNumber: '555' },
                callInfo: new CallInfo({ isOnHold: false }),
                callAttributes: { participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY }
            };
            vendorSdk.connectParticipant(newCall.callInfo, null, newCall);
            expect(vendorSdk.state.activeCalls['newParticipant1']).toBeDefined();
        });

        it('routeVoiceCall should call fetch with correct params', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ status: 'Success' })
            }));
            const result = await vendorSdk.routeVoiceCall('vc123', { routingTarget: 'agent1' });
            expect(result.status).toEqual('Success');
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/voiceCalls/vc123/route'),
                expect.objectContaining({ method: 'PATCH' })
            );
        });

        it('routeVoiceCall should reject when voiceCallId is missing', async () => {
            await expect(vendorSdk.routeVoiceCall(null, { routingTarget: 'agent1' }))
                .rejects.toThrow('voiceCallId is required');
        });

        it('routeVoiceCall should reject when routingTarget is missing', async () => {
            await expect(vendorSdk.routeVoiceCall('vc123', {}))
                .rejects.toThrow('routingTarget is required');
        });

        it('routeVoiceCall should reject on non-ok response', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: false,
                statusText: 'Bad Request',
                json: () => Promise.resolve({ message: 'invalid target' })
            }));
            await expect(vendorSdk.routeVoiceCall('vc123', { routingTarget: 'bad' }))
                .rejects.toThrow('invalid target');
        });

        it('updateRemoveTransferCallParticipantVariant should cache variant', () => {
            vendorSdk.updateRemoveTransferCallParticipantVariant('NEVER');
            expect(vendorSdk.state.updateRemoveTransferCallParticipantVariant).toEqual('NEVER');
        });

        it('getActiveCalls should reject on error', async () => {
            jest.spyOn(vendorSdk, 'getActiveCallsObj').mockRejectedValueOnce(new Error('fail'));
            await expect(telephonyConnector.getActiveCalls()).rejects.toBeDefined();
            jest.restoreAllMocks();
        });

        it('pauseRecording should handle consult call', () => {
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities = { ...vendorSdk.state.capabilities, canConsult: true };
            const primaryCall = new PhoneCall({
                callId: 'primaryForPause',
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }),
                callInfo: new CallInfo({ isMuted: false, isRecordingPaused: false })
            });
            const consultCall = new PhoneCall({
                callId: 'consultForPause',
                callType: Constants.CALL_TYPE.CONSULT,
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY, isConsultCall: true }),
                callInfo: new CallInfo({ isMuted: false, isRecordingPaused: false })
            });
            vendorSdk.addCall(primaryCall);
            vendorSdk.addCall(consultCall);
            const result = vendorSdk.pauseRecording(consultCall);
            expect(result).toBeDefined();
        });

        it('resumeRecording should handle consult call', () => {
            vendorSdk.state.isConsultAllowed = true;
            vendorSdk.state.capabilities = { ...vendorSdk.state.capabilities, canConsult: true };
            const primaryCall = new PhoneCall({
                callId: 'primaryForResume',
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER }),
                callInfo: new CallInfo({ isMuted: false, isRecordingPaused: true })
            });
            const consultCall = new PhoneCall({
                callId: 'consultForResume',
                callType: Constants.CALL_TYPE.CONSULT,
                callAttributes: new PhoneCallAttributes({ participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY, isConsultCall: true }),
                callInfo: new CallInfo({ isMuted: false, isRecordingPaused: true })
            });
            vendorSdk.addCall(primaryCall);
            vendorSdk.addCall(consultCall);
            const result = vendorSdk.resumeRecording(consultCall);
            expect(result).toBeDefined();
        });
    });

    describe('[Non Multi-party] destroyCalls', () => {
        const initialCallerCall = new PhoneCall({
            callAttributes: new PhoneCallAttributes({
                participantType: Constants.PARTICIPANT_TYPE.INITIAL_CALLER
            }),
            callInfo: new CallInfo({isMuted: false})
        });
        const thirdPartyCall = new PhoneCall({
            callAttributes: new PhoneCallAttributes({
                participantType: Constants.PARTICIPANT_TYPE.THIRD_PARTY
            }),
            callInfo: new CallInfo({isMuted: false})
        });
        const supervisorCall = new PhoneCall({
            callAttributes: new PhoneCallAttributes({
                participantType: Constants.PARTICIPANT_TYPE.SUPERVISOR
            }),
            callInfo: new CallInfo({isMuted: false})
        });
        beforeEach(() => {
            vendorSdk.state.isMultipartyAllowed = false;
            vendorSdk.state.activeCalls = {};
        });

        it('Should return initial caller call when available', () => {
            vendorSdk.addCall(initialCallerCall);
            const result = vendorSdk.destroyCalls(initialCallerCall);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(initialCallerCall);
        });

        it('Should return matching call when participantType is AGENT', () => {
            initialCallerCall.callId = 'call1';
            thirdPartyCall.callId = 'call2';
            vendorSdk.addCall(initialCallerCall);
            vendorSdk.addCall(thirdPartyCall);
            const result = vendorSdk.destroyCalls(
                {callAttributes: { participantType: Constants.PARTICIPANT_TYPE.AGENT }},
                undefined, true
            );
            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('Should return the call itself when participantType is SUPERVISOR', () => {
            vendorSdk.addCall(supervisorCall);
            const result = vendorSdk.destroyCalls(supervisorCall);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(supervisorCall);
        });
    });
});