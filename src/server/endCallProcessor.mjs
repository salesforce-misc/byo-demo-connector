/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * End Call Processing Module
 * Handles all business logic for ending calls, notifications, and storage cleanup
 */

import { getAllParticipants } from './upsertCallProcessor.mjs';
import { USER_MESSAGE } from './server.mjs';

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate endCall request - validates parameters and user storage
 * @param {string} username - The username
 * @param {object} endCallData - End call data object
 * @param {object} storage - Storage reference
 * @returns {object|null} - Returns error object if validation fails, null if valid
 */
export function validateEndCallRequest(username, endCallData, storage) {
    // Validate username
    if (!username) {
        return {
            status: 400,
            error: 'username is required'
        };
    }

    // Validate endCallData object
    if (!endCallData || typeof endCallData !== 'object') {
        return {
            status: 400,
            error: 'endCallData object is required'
        };
    }

    const { call, type = 'HANGUP' } = endCallData; // Default to HANGUP if not provided

    // Validate call object
    if (!call || !call.callId) {
        return {
            status: 400,
            error: 'call and callId are required'
        };
    }

    // Validate type (if provided)
    if (type !== 'HANGUP' && type !== 'PARTICIPANT_REMOVED') {
        return {
            status: 400,
            error: 'type must be HANGUP or PARTICIPANT_REMOVED'
        };
    }

    // Validate user storage exists
    if (!storage[username] || !storage[username]['activeCalls']) {
        return {
            status: 404,
            error: 'User or ActiveCalls not found'
        };
    }

    return null; // All validations passed
}

// =============================================================================
// NOTIFICATION LOGIC
// =============================================================================

/**
 * Helper: Notify consult user about call ending
 */
function notifyConsultCallEnded(consultUser, consultCall, reason, sendMessageFn, storage) {
    const callToConsultUser = { ...consultCall, target: consultUser };
    sendMessageFn({
        targetUsernames: [consultUser],
        eventType: USER_MESSAGE.CALL_DESTROYED,
        fromUsername: consultUser,
        data: { call: callToConsultUser, reason, isHangup: true }
    });
    console.log(`[endCall] Notified consult user ${consultUser} about consult call ${consultCall.callId} (HANGUP)`);

    // Clean up consult user's storage (hangup all)
    storage[consultUser]['activeCalls'] = {};
    storage[consultUser]['connections'] = {};
    console.log(`[endCall] Cleared all activeCalls and connections for consult user ${consultUser}`);
}

/**
 * Notify participants about call ending
 */
export function notifyCallEnded(username, call, type, reason, storage, sendMessageFn) {
    // Get all participants from all active calls
    const participants = getAllParticipants(username, storage);

    if (participants.size === 0) {
        return;
    }

    // Check if this is an unmerged consult call (isConsultCall flag is still true)
    const isConsultCall = call.callAttributes?.isConsultCall === true;
    
    if (isConsultCall) {
        // For UNMERGED consult calls, handle initiator and consult user differently
        const initiator = call.fromContact?.id;
        const consultUser = call.toContact?.id; // Use toContact to identify consult user
        
        // Notify initiator - just remove consult card (PARTICIPANT_REMOVED)
        if (initiator && initiator !== username && storage[initiator]) {
            const callToInitiator = { ...call, target: consultUser };
            sendMessageFn({
                targetUsernames: [initiator],
                eventType: USER_MESSAGE.CALL_DESTROYED,
                fromUsername: username,
                data: { call: callToInitiator, reason }
            });
            console.log(`[endCall] Notified initiator ${initiator} about consult call ${call.callId} (PARTICIPANT_REMOVED)`);
        }
        
        // Notify consult user - hangup all (HANGUP)
        if (consultUser && consultUser !== username && storage[consultUser]) {
            notifyConsultCallEnded(consultUser, call, reason, sendMessageFn, storage);
        }
    } else {
        // For merged consult or regular calls, notify all participants
        call.target = type === 'HANGUP' ? username : call.contact?.id;
        
        sendMessageFn({
            targetUsernames: [...participants],
            eventType: USER_MESSAGE.CALL_DESTROYED,
            fromUsername: username,
            data: { call, reason, isHangup: type === 'HANGUP' }
        });
        
        console.log(`[endCall] Notified ${participants.size} participants about ${username} leaving (type: ${type}, callId: ${call.callId})`);

        // If hanging up and there's an unmerged consult call, notify consult user separately
        if (type === 'HANGUP') {
            const userCalls = storage[username]?.activeCalls || {};
            const consultCall = Object.values(userCalls).find(c => c.callAttributes?.isConsultCall === true);

            if (consultCall && consultCall.callId !== call.callId) {
                const consultUser = consultCall.toContact?.id;
                if (consultUser && storage[consultUser]) {
                    notifyConsultCallEnded(consultUser, consultCall, reason, sendMessageFn, storage);
                }
            }
        }
    }
}

// =============================================================================
// STORAGE CLEANUP
// =============================================================================

/**
 * Clean up storage based on end call type
 * @param {string} username - The username
 * @param {object} call - The call object
 * @param {string} type - End call type (HANGUP or PARTICIPANT_REMOVED)
 * @param {object} storage - Storage reference
 */
function cleanupCallStorage(username, call, type, storage) {
    if (type === 'HANGUP') {
        // Clear all activeCalls and connections for HANGUP
        storage[username]['activeCalls'] = {};
        storage[username]['connections'] = {};
        console.log(`[endCall] Cleared all activeCalls and connections for ${username} (HANGUP)`);
    } else {
        // PARTICIPANT_REMOVED - remove only the specific call
        if (storage[username]['activeCalls'] && storage[username]['activeCalls'][call.callId]) {
            delete storage[username]['activeCalls'][call.callId];
        }
        if (storage[username]['connections'] && call.connectionId && storage[username]['connections'][call.connectionId]) {
            delete storage[username]['connections'][call.connectionId];
        }
        console.log(`[endCall] Removed call ${call.callId} for ${username} (PARTICIPANT_REMOVED)`);
    }
}

// =============================================================================
// MAIN PROCESSING FUNCTION
// =============================================================================

/**
 * Process end call request
 * @param {string} username - The username
 * @param {object} endCallData - End call data containing call, type (optional, defaults to HANGUP), reason, skipNotifications
 * @param {object} storage - Storage reference
 * @param {function} sendMessageFn - Function to send messages to participants
 * @returns {object} - Response object with success status
 */
export function processEndCall(username, endCallData, storage, sendMessageFn) {
    const { call, type = 'HANGUP', reason, skipNotifications } = endCallData;

    // Notify participants if skipNotifications is false/undefined
    if (!skipNotifications) {
        notifyCallEnded(username, call, type, reason, storage, sendMessageFn);
    } else {
        console.log(`[endCall] Skipping notifications for ${username}, call ${call.callId} (skipNotifications=true)`);
    }

    // Clean up storage
    cleanupCallStorage(username, call, type, storage);

    // Return success response data
    return {
        success: true,
        message: 'Call ended successfully',
        username,
        callId: call.callId,
        type,
        reason
    };
}
