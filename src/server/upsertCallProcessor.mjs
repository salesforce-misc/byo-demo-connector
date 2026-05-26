/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Call Processing Module
 * Handles all business logic for call updates, notifications, and state management
 */

import scvConnectorBase from '@salesforce/scv-connector-base';
import { USER_MESSAGE } from './server.mjs';

const { Constants } = scvConnectorBase;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Case-insensitive call state comparison
 */
function isCallState(state, targetState) {
    return state?.toLowerCase() === targetState.toLowerCase();
}

/**
 * Case-insensitive call type comparison
 */
function isCallType(callType, targetType) {
    return callType?.toLowerCase() === targetType.toLowerCase();
}

/**
 * Determine event type based on call type
 */
function getEventTypeForCall(callType) {
    const dialCallTypes = [
        Constants.CALL_TYPE.OUTBOUND,
        Constants.CALL_TYPE.DIALED_CALLBACK,
        Constants.CALL_TYPE.INTERNAL_CALL
    ];

    const isDialType = dialCallTypes.some(type => isCallType(callType, type));
    return isDialType ? USER_MESSAGE.INTERNAL_CALL_STARTED : USER_MESSAGE.CALL_STARTED;
}

/**
 * Check if call is being synced from a merge operation
 * During merge, calls are in CONNECTED or TRANSFERRED state
 * NOTE: This should not be used for single voice call scenarios.
 */
function isCallFromMerge(callObj) {
    return isCallState(callObj.state, Constants.CALL_STATE.CONNECTED) ||
           isCallState(callObj.state, Constants.CALL_STATE.TRANSFERRED);
}

// =============================================================================
// PARTICIPANT MANAGEMENT
// =============================================================================

/**
 * Get participants from a single call (excluding the calling user by both username and userId)
 */
function getCallParticipants(call, username, userId) {
    const isSelf = (id) => id === username || id === userId;
    const participants = new Set();
    if (call.fromContact?.id && !isSelf(call.fromContact.id)) {
        participants.add(call.fromContact.id);
    }
    if (call.toContact?.id && !isSelf(call.toContact.id)) {
        participants.add(call.toContact.id);
    }
    return participants;
}

/**
 * Gather all participants from user's active calls
 */
function getAllParticipants(storage, username, userId) {
    const allParticipants = new Set();
    for (let storedCall of Object.values(storage[username]['activeCalls'])) {
        const callParticipants = getCallParticipants(storedCall, username, userId);
        callParticipants.forEach(id => allParticipants.add(id));
    }
    return allParticipants;
}

// =============================================================================
// NOTIFICATION HANDLERS
// =============================================================================

/**
 * Notify users about mute toggle
 */
function notifyMuteChange(username, callObj, allParticipants, sendMessageFn) {
    const eventType = callObj.callInfo.isMuted ? USER_MESSAGE.MUTE : USER_MESSAGE.UNMUTE;

    callObj.callAttributes.target = callObj.callInfo.isGlobal ? username : callObj.contact.id;
    const usersToNotify = [...allParticipants];

    if (usersToNotify.length > 0) {
        console.log(`${username} sending ${eventType} to ${usersToNotify.length} user(s): ${usersToNotify.join(', ')}`);
        sendMessageFn({
            targetUsernames: usersToNotify,
            eventType,
            fromUsername: username,
            data: {
                call: callObj,
                isMuted: callObj.callInfo.isMuted
            }
        });
    }
}

/**
 * Notify users about hold toggle
 */
function notifyHoldChange(username, callObj, allParticipants, sendMessageFn) {
    const usersToNotify = [...allParticipants];

    if (usersToNotify.length > 0) {
        console.log(`${username} sending ${USER_MESSAGE.HOLD_TOGGLE} to ${usersToNotify.length} user(s): ${usersToNotify.join(', ')}`);
        sendMessageFn({
            targetUsernames: usersToNotify,
            eventType: USER_MESSAGE.HOLD_TOGGLE,
            fromUsername: username,
            data: callObj
        });
    }
}

/**
 * Notify users about state change (typically PARTICIPANT_CONNECTED)
 */
function notifyStateChange(username, userId, callObj, allParticipants, storage, sendMessageFn) {
    if (isCallState(callObj.state, Constants.CALL_STATE.CONNECTED) ||
        isCallState(callObj.state, Constants.CALL_STATE.TRANSFERRED)) {
        if (isCallType(callObj.callType, Constants.CALL_TYPE.CONSULT)) {
            allParticipants = [callObj.fromContact.id];
        } else if (isCallType(callObj.callType, Constants.CALL_TYPE.TRANSFER) ||
                   isCallType(callObj.callType, Constants.CALL_TYPE.ADD_PARTICIPANT)) {
            const initiator = callObj.fromContact?.id;
            if (initiator && storage[initiator]?.activeCalls) {
                allParticipants = getAllParticipants(storage, initiator, userId);
                allParticipants.add(initiator);
            }
        }

        const usersToNotify = [...allParticipants].filter(participantId => {
            const userCall = storage[participantId]?.activeCalls?.[callObj.callId];
            return !userCall || userCall.state !== callObj.state;
        });

        if (usersToNotify.length > 0) {
            const callToSend = {
                ...callObj,
                contact: callObj.toContact
            };

            console.log(`${username} sending ${USER_MESSAGE.PARTICIPANT_CONNECTED} to ${usersToNotify.length} user(s): ${usersToNotify.join(', ')}`);
            console.log(`  - Call ${callObj.callId}: flipped contact from ${callObj.contact?.name} to ${callToSend.contact?.name}`);

            sendMessageFn({
                targetUsernames: usersToNotify,
                eventType: USER_MESSAGE.PARTICIPANT_CONNECTED,
                fromUsername: username,
                data: { call: callToSend }
            });
        }
    }
}

/**
 * Notify users about autoMerge being enabled
 */
function notifyAutoMergeEnabled(username, callObj, allParticipants, storage, sendMessageFn) {
    const usersToNotify = [...allParticipants].filter(userId =>{
        return userId !== username;
    });

    if (usersToNotify.length > 0) {
        console.log(`${username} sending ${USER_MESSAGE.MERGE} to ${usersToNotify.length} user(s): ${usersToNotify.join(', ')}`);

        const activeCalls = storage[username]['activeCalls'];
        sendMessageFn({
            targetUsernames: usersToNotify,
            eventType: USER_MESSAGE.MERGE,
            fromUsername: username,
            data: {
                consultCall: callObj,
                activeConferenceCalls: Object.values(activeCalls)
            }
        });
    }
}

/**
 * Notify users about supervisor barge-in.
 * The supervisor attaches the supervised call info as callObj.bargeInData.
 */
function notifyBargeIn(username, callObj, allParticipants, sendMessageFn) {
    const usersToNotify = [...allParticipants].filter(userId => userId !== username);

    if (usersToNotify.length > 0 && callObj.bargeInData) {
        console.log(`${username} sending ${USER_MESSAGE.CALL_BARGED_IN} to ${usersToNotify.length} user(s): ${usersToNotify.join(', ')}`);
        sendMessageFn({
            targetUsernames: usersToNotify,
            eventType: USER_MESSAGE.CALL_BARGED_IN,
            fromUsername: username,
            data: callObj.bargeInData
        });
    }
}

// =============================================================================
// MAIN PROCESSING FUNCTIONS
// =============================================================================

/**
 * Process updates for an existing call (mute, hold, state changes, etc.)
 */
function processExistingCallUpdate({ username, userId }, callObj, existingCall, storage, sendMessageFn) {
    const allParticipants = getAllParticipants(storage, username, userId);

    // Check for supervisor barge-in
    if (!existingCall.callAttributes?.hasSupervisorBargedIn && callObj.callAttributes?.hasSupervisorBargedIn) {
        notifyBargeIn(username, callObj, allParticipants, sendMessageFn);
    }
    // Check for mute toggle
    else if ((existingCall.callInfo?.isMuted !== callObj.callInfo?.isMuted) ||
        (existingCall.callInfo?.isGlobal !== callObj.callInfo?.isGlobal)
    ) {
        notifyMuteChange(username, callObj, allParticipants, sendMessageFn);
    }
    // Check for hold toggle
    else if (existingCall.callInfo?.isOnHold !== callObj.callInfo?.isOnHold) {
        notifyHoldChange(username, callObj, allParticipants, sendMessageFn);
    }
    // Check for autoMerge toggle (from OFF to ON)
    else if (isCallState(callObj.state, Constants.CALL_STATE.TRANSFERRED) &&
        !existingCall.callAttributes.isAutoMergeOn &&
        existingCall.callAttributes.isAutoMergeOn !== callObj.callAttributes.isAutoMergeOn) {
        notifyAutoMergeEnabled(username, callObj, allParticipants, storage, sendMessageFn);
    }
    // Check for state change
    else if (existingCall.state !== callObj.state) {
        notifyStateChange(username, userId, callObj, allParticipants, storage, sendMessageFn);
    }
}

/**
 * Process new call addition
 */
function processNewCall(username, callObj, storage, sendMessageFn) {
    // Check if this is a merge scenario, then system does not need to notify other users
    const isMergeSync = isCallFromMerge(callObj);

    if (isMergeSync) {
        console.log(`[Merge Sync] User ${username} syncing merged call ${callObj.callId} (state: ${callObj.state}) to storage (no notifications)`);
        return;
    }

    // New Call insert or Add participant
    const activeCalls = storage[username]['activeCalls'];
    const allCallIds = Object.keys(activeCalls);
    const isParticipantAdded = allCallIds.length > 1;

    // A fresh internal call (ag1's only active call) must notify the target directly.
    // isParticipantAdded would be false in this case, so handle it separately.
    const isInternalCall = isCallType(callObj.callType, Constants.CALL_TYPE.INTERNAL_CALL) && allCallIds.length === 1;
    // Blind transfer: originalCallId marks it as a transfer leg, and allCallIds.length === 1
    // (only parentCall remains) distinguishes it from a warm transfer where the new call IS stored (length > 1).
    const isBlindTransfer = !!callObj.isBlindTransfer;

    if (isParticipantAdded || isInternalCall || isBlindTransfer) {
        // For non-MP orgs, we override the phoneNumber here as it is used by SF core to display the contents of the 'phoneNumber'
        callObj.phoneNumber = callObj.fromContact.name || callObj.fromContact.phoneNumber;
        const eventType = getEventTypeForCall(callObj.callType);
        let sendActiveConferenceCalls = true;

        if (isCallType(callObj.callType, Constants.CALL_TYPE.CONSULT) ||
            eventType === USER_MESSAGE.INTERNAL_CALL_STARTED ||
            !callObj.callAttributes?.isAutoMergeOn
        ) {
            sendActiveConferenceCalls = false;
        }

        const existingCallsOnly = sendActiveConferenceCalls
            ? Object.values(activeCalls).filter(call => call.callId !== callObj.callId)
            : [];

        console.log(`[Participant Added] User ${username} added participant ${callObj.toContact?.id} to call ${callObj.callId}, eventType: ${eventType}, sending ${existingCallsOnly.length} existing calls`);
        sendMessageFn({
            targetUsernames: callObj.toContact?.id,
            eventType,
            fromUsername: username,
            data: {
                ...callObj,
                activeConferenceCalls: existingCallsOnly,
                renderContact: callObj.fromContact
            }
        });
    } else {
        console.log(`[New Call] User ${username} started new call ${callObj.callId}, callType: ${callObj.callType}`);
    }
}

/**
 * Main entry point: Process call update business logic
 */
export function processCallUpdateBusinessLogic({ username, userId }, callObj, existingCall, storage, sendMessageFn) {
    try {
        if (!existingCall) {
            processNewCall(username, callObj, storage, sendMessageFn);
        } else {
            processExistingCallUpdate({ username, userId }, callObj, existingCall, storage, sendMessageFn);
        }
    } catch (error) {
        console.error(`[processCallUpdateBusinessLogic] Error for user ${username}, call ${callObj.callId}:`, error);
    }
}

/**
 * Synchronize connections storage with activeCalls
 */
export function syncConnectionsWithActiveCalls(username, activeCalls, storage) {
    // Initialize connections if it doesn't exist
    if (!storage[username]['connections']) {
        storage[username]['connections'] = {};
    }

    if (typeof activeCalls === 'object') {
        const currentConnectionIds = new Set();
        Object.values(activeCalls).forEach(call => {
            currentConnectionIds.add(call.connectionId);
            storage[username]['connections'][call.connectionId] = call;
        });
    }
}

// Export utility functions for use in other modules
export {
    isCallState,
    isCallType,
    getAllParticipants
};
