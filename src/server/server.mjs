/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/*
 * JS Server serving api calls and socket signaling 
 * @author vtikoo, dlouvton
 */
import express from 'express';
import customEnv from 'custom-env';
import { ScrtConnector }  from './scrtConnector.mjs';
import { Server } from 'socket.io';
import { initOttApp }  from './ottAppServer.mjs';
import { agentWorkCache } from './ottAppLib/sfdc-byocc-agentwork-api.mjs';
import { processCallUpdateBusinessLogic, syncConnectionsWithActiveCalls } from './upsertCallProcessor.mjs';
import { validateEndCallRequest, processEndCall } from './endCallProcessor.mjs';

// User message constants for server-client communication
export const USER_MESSAGE = {
    CALL_STARTED: "CALL_STARTED",
    INTERNAL_CALL_STARTED: "INTERNAL_CALL_STARTED",
    PARTICIPANT_CONNECTED: "PARTICIPANT_CONNECTED",
    CALL_DESTROYED: "CALL_DESTROYED",
    MUTE: "MUTE",
    UNMUTE: "UNMUTE",
    MERGE: "MERGE",
    HOLD_TOGGLE: "HOLD_TOGGLE",
    CALL_BARGED_IN: "CALL_BARGED_IN"
};

customEnv.env();
const app = express();
app.use(express.json());
let onlineUsers = new Map(); // username -> socket.id
let userFullNames = new Map(); // username -> FullName
let connectors = new Set();

const server = app.listen(process.env.SERVER_PORT, () => {
    console.log(`\n====== App listening to ${process.env.SERVER_PORT}. Press Ctrl+C to quit.`);

    // Init ottApp
    initOttApp(app);
});
const io = new Server(server);
io.on('connection', socket => {
    socket.on('join', data => {
        if (data.connectionType === 'remote_control') {
            console.log(`Remote Control joined : ${data.remoteId} from ${data.userAgent}`);
            socket.join(data.remoteId);
            socket.emit("connectors", { connectors : [...connectors.keys()] });
        } else {
            console.log('Salesforce User joined as Agent : ' + data.username);
            socket.join(data.username);
            socket.join(data.id);
            connectors.add(data.username);
            connectors.add(data.id);
        }
        socket.broadcast.emit('connectors', { connectors : [...connectors.keys()] });
    });

    socket.on('disconnect', () => {
        for (let [key, value] of onlineUsers.entries()) {
            if (value === socket.id) {
                console.log('User disconnected: ' + key);
                onlineUsers.delete(key);
                connectors.delete(key);
                userFullNames.delete(key);
                ScrtConnector.removeOnlineUserIds(key);
            }
        }
    });

    socket.on('presence', data => {
        if (data.isAvailable) {
            console.log('User went online: ' + data.username);
            onlineUsers.set(data.username, socket.id);
            onlineUsers.set(data.userId, socket.id);
            userFullNames.set(data.username, data.fullName);
            ScrtConnector.setOnlineUserIds(data.username, data);
        } else {
            console.log('User went offline: ' + data.username);
            onlineUsers.delete(data.username);
            onlineUsers.delete(data.userId);
            userFullNames.delete(data.username);
            ScrtConnector.removeOnlineUserIds(data.username);
        }
        socket.broadcast.emit('onlineUsers', {'users' : Array.from(onlineUsers.keys()), 'userNames' : JSON.stringify(Array.from(userFullNames))});
    });
    
    socket.on('message', data => {
        if (data.toUsername) {
            io.sockets.to(data.toUsername).emit('message', data);
            if (process.env.DEBUG_LOG) {
                console.log(`User message sent from ${data.fromUsername} to ${data.toUsername}:  ${data.messageType || data.data.type}`);
            }
        } else {
            io.emit('message',data);
        }
    });

    socket.on('remote_message', data => {
        if (data.from) {
            io.sockets.to(data.from).emit('message', data);
        } else {
            socket.broadcast.emit('message', data);
        }
    });


});

// ==========================================
// Phase 1: Server-to-Client Messaging Infrastructure
// ==========================================

/**
 * Send a server message to specific users
 * @param {Object} options - Message options
 * @param {Array<string> | string} options.targetUsernames - Username(s) to send to (string or array)
 * @param {string} options.eventType - Type of event to send
 * @param {string} options.fromUsername - The username who initiated the message
 * @param {Object} options.data - Data payload to send
 * @returns {Object} - { success: boolean, error?: string }
 */
function sendServerMessage({ targetUsernames, eventType, fromUsername, data }) {
    if (!eventType) {
        return { success: false, error: 'eventType is required' };
    }

    // Convert string to array if needed
    if (typeof targetUsernames === 'string') {
        targetUsernames = [targetUsernames];
    }

    if (!targetUsernames || targetUsernames.length === 0) {
        console.error('sendServerMessage: targetUsernames is required');
        return { success: false, error: 'targetUsernames is required' };
    }

    const message = {
        source: 'server',
        eventType,
        fromUsername,
        data,
        timestamp: new Date().toISOString()
    };

    targetUsernames.forEach(username => {
        io.sockets.to(username).emit('server_event', message);
    });

    console.log(`[Server → Clients] Sent ${eventType} to ${targetUsernames.length} users: ${targetUsernames}`);
    return { success: true };
}

export { sendServerMessage };

// ==========================================
// End Phase 1: Server-to-Client Messaging
// ==========================================

// In-memory storage: { username: { key: value } }
const storage = {};

app.post('/api/users/:username/:storageKey', (req, res) => {
    const { username, storageKey } = req.params;
    const body = req.body;
    const value = '__non__object' in body ? body.__non__object : body;

    if (value === undefined) {
        return res.status(400).json({ error: "POST body must contain 'value'" });
    }

    if (!storage[username]) {
        storage[username] = {};
    }

    storage[username][storageKey] = value;

    // Special handling for activeCalls - maintain connections
    if (storageKey === 'activeCalls') {
        syncConnectionsWithActiveCalls(username, value, storage);
    }

    res.status(200).json({
        message: "Value stored successfully",
        username,
        storageKey,
        value
    });
});

app.get('/api/users/:username/:storageKey', (req, res) => {
    const { username, storageKey } = req.params;
    const value = storage[username] && storage[username][storageKey] !== undefined
        ? storage[username][storageKey]
        : null;

    res.status(200).json({
        username,
        storageKey,
        value
    });
});

/**
 * Upsert a specific call in activeCalls and sync with connections
 * POST /api/call/upsertCall
 * Body: {
 *   username: string,
 *   call: object,
 *   callList: object - The activeCall list,
 *   skipNotification: boolean (optional) - if true, skip notifications
 * }
 */
app.post('/api/call/upsertCall', (req, res) => {
    const { username, call, skipNotification } = req.body;

    const { callId } = call;

    if (!username) {
        return res.status(400).json({
            success: false,
            error: 'username is required'
        });
    }

    if (!callId) {
        return res.status(400).json({
            success: false,
            error: 'callId is required'
        });
    }

    if (!storage[username]) {
        storage[username] = {};
    }

    if (!storage[username]['activeCalls']) {
        storage[username]['activeCalls'] = {};
    }

    const activeCalls = storage[username]['activeCalls'];
    const existingCall = activeCalls[call.callId] ? { ...activeCalls[call.callId] } : null;

    const callObj = JSON.parse(JSON.stringify(call));

    storage[username]['activeCalls'][call.callId] = call;

    syncConnectionsWithActiveCalls(username, storage[username]['activeCalls'], storage);

    res.status(200).json({
        success: true,
        message: 'Call updated successfully',
        username,
        callId
    });

    if (!skipNotification) {
        setImmediate(() => {
            processCallUpdateBusinessLogic(username, callObj, existingCall, storage, sendServerMessage);
        });
    } else {
        console.log(`[Upsert] User ${username} updated call ${callObj.callId} with skipNotification=true (storage updated, no notifications)`);
    }
});

/**
 * End a call and notify all participants
 * POST /api/call/endCall
 * Body: {
 *   username: string,
 *   endCallData: {
 *     call: object,
 *     type: string (optional) - 'PARTICIPANT_REMOVED' for removing specific participant, defaults to 'HANGUP',
 *     reason: string (optional),
 *     skipNotifications: boolean (optional) - if true, only update storage without notifying other users
 *   }
 * }
 */
app.post('/api/call/endCall', (req, res) => {
    const { username, endCallData } = req.body;

    const validationError = validateEndCallRequest(username, endCallData, storage);
    if (validationError) {
        return res.status(validationError.status).json({
            success: false,
            error: validationError.error
        });
    }

    const result = processEndCall(username, endCallData, storage, sendServerMessage);

    res.status(200).json(result);
});

app.get('/api/createVoiceCall', (req, res) => {
    console.log(`Trying to create voice call with query ${JSON.stringify(req.query)}`);
    ScrtConnector.createVoiceCall(req.query).then(response => {
        console.log(`Successfully created a voice call - ${response.data.voiceCallId}`);
        res.send(response.data);
    }).catch(err => {
        console.log(`Failed to create voice call - ${err}`);
        res.send({ success: false });
    });
});

app.post('/api/createTranscription', (req, res) => {
    ScrtConnector.createTranscription(req.body).then(response => {
        console.log(`Successfully created a transcription call - ${response.data.result}`);
        res.send({ success: true });
    }).catch(err => {
        console.log(`Failed to create transcription - ${err}`);
        res.send({ success: false });
    });
});

app.post('/api/updateVoiceCall', (req, res) => {
    ScrtConnector.updateVoiceCall(req.body).then(response => {
        console.log(`Successfully created a voice call recording - ${response.data}`);
        res.send({ success: true });
    }).catch(err => {
        console.log(`Failed to create voice call recording - ${err}`);
        console.log(JSON.stringify(err));
        res.send({ success: false });
    });
});

app.post('/api/configureTenantInfo', (req, res) => {
    try {
        const updateResult = ScrtConnector.configureTenantInfo(req.body);
        console.log(`TenantInfo configured : \n${updateResult}`);
        res.send({ success: true});
    } catch (exception) {
        console.log(`Exception configuring tenant info : \n ${JSON.stringify(exception)}`);
        res.send({ success: false });
    }
});

app.patch('/api/executeOmniFlow', (req, res) => {
    ScrtConnector.executeOmniFlow(req.body).then(result => {
        console.log(`Omni Flow executed successfully : ${JSON.stringify(result.data)}`);
        res.send(result.data);
    }).catch((err) => {
        console.log(`Failed to execute Omni Flow : \n ${JSON.stringify(err)}`);
        res.send({});
    });
});

app.post('/api/voiceCalls/:voiceCallId/requestCallback', (req, res) => {
    const voiceCallId = req.params.voiceCallId;
    const body = req.body || {};
    const telephonyProviderName = req.get('Telephony-Provider-Name');
    const params = { voiceCallId, callbackNumber: body.callbackNumber, ...(body.vendorCallKey && { vendorCallKey: body.vendorCallKey }), ...(telephonyProviderName && { telephonyProviderName }), ...(body.isPreviewCallback === true && { isPreviewCallback: true }) };
    ScrtConnector.requestCallback(params).then(result => {
        console.log(`Request callback successful : ${JSON.stringify(result.data)}`);
        res.status(200).json(result.data);
    }).catch((err) => {
        console.log(`Failed to request callback : \n ${JSON.stringify(err)}`);
        res.status(err.response?.status || 500).json(err.response?.data || { message: err.message || 'unsuccessful operation' });
    });
});

app.patch('/api/voiceCalls/:voiceCallId/clearRouting', (req, res) => {
    const voiceCallId = req.params.voiceCallId;
    const telephonyProviderName = req.get('Telephony-Provider-Name');
    const params = { voiceCallId, ...(telephonyProviderName && { telephonyProviderName }) };
    ScrtConnector.clearRouting(params).then(result => {
        console.log(`Clear routing successful : ${JSON.stringify(result.data)}`);
        res.status(200).json(result.data || {});
    }).catch((err) => {
        console.log(`Failed to clear routing : \n ${JSON.stringify(err)}`);
        res.status(err.response?.status || 500).json(err.response?.data || { message: err.message || 'unsuccessful operation' });
    });
});

app.patch('/api/voiceCalls/:voiceCallId/route', (req, res) => {
    const voiceCallId = req.params.voiceCallId;
    const body = req.body || {};
    const telephonyProviderName = req.get('Telephony-Provider-Name');
    const params = {
        voiceCallId,
        routingTarget: body.routingTarget,
        ...(body.fallbackQueue != null && { fallbackQueue: body.fallbackQueue }),
        ...(body.flowInputParameters != null && { flowInputParameters: body.flowInputParameters }),
        ...(telephonyProviderName && { telephonyProviderName })
    };
    ScrtConnector.routeVoiceCall(params).then(result => {
        console.log(`Route voice call successful : ${JSON.stringify(result.data)}`);
        res.status(200).json(result.data || {});
    }).catch((err) => {
        console.log(`Failed to route voice call : \n ${JSON.stringify(err)}`);
        const status = err.response?.status || 500;
        const data = err.response?.data || { message: err.message || 'unsuccessful operation' };
        res.status(status).json(data);
    });
});

app.post('/api/sendVoiceMail', (req, res) => {
    ScrtConnector.sendVoiceMail(req.body).then(result => {
        console.log(`Voice Mail sent successfully`);
        res.send(result.data);
    }).catch((err) => {
        console.log(`Failed to send Voice Mail : \n ${JSON.stringify(err)}`);
        res.send({});
    });
});

app.post('/api/sendRealtimeConversationEvents', (req, res) => {
    ScrtConnector.sendRealtimeConversationEvents(req.body).then(result => {
        console.log(`Realtime Conversation Events sent successfully`);
        res.send(result.data);
    }).catch((err) => {
        console.log(`Failed to send Realtime Conversation Events : \n ${JSON.stringify(err)}`);
        res.send({});
    });
});

app.post('/api/clear-agent-work-cache', (req,res) => {
    const workItemId = req.body.workItemId;
    console.log(`Attempting to delete ${workItemId} from the agentWorkCache...`);

    try {
        agentWorkCache.del(workItemId);
        console.log(`Deleted ${workItemId} from agentWorkCache. `);
        res.send({ success: true});
    } catch (err) {
        console.log(`Error deleting ${workItemId} from agentWorkCache: \n ${err}`);
        res.send({ success: false });
    }
});

app.post('/api/fetchServer', (req, res) => {
    try {
        if (req.body.method==='GET') {
            return fetch(`http://localhost:3030${req.body.endpoint}`, {
                method: req.body.method,
                headers: {
                    'Content-Type': 'application/json'
                },
            }).then(response => response.json()).then((result) => {
                res.send(result)
                return result;
            })
        } else {
            return fetch(`http://localhost:3030${req.body.endpoint}`, {
                method: req.body.method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({...req.body})
            }).then(response => response.json()).then((result) => {
                res.send(result)
                return result;
            })
        }
    } catch(err) {
        console.log(`Error ${err}`);
    }
});