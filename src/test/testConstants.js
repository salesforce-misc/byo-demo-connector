/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Constants } from '@salesforce/scv-connector-base'
export default {
    ...Constants,
    CALL_INBOUND_PARAMS_KEY: { 
        type : "Inbound", 
        phoneNumber:  "555-555-5555"
    },
    DIGITS_KEY: "1234",
    AGENT_STATUS: {agentStatus: 'Available'},
    CALL_CENTER_CONFIG: { config: 'sso_config' },
    CONTAINER_DIV_KEY: 'CONTAINER_DIV',
    GENERIC_ERROR_KEY: 'GENERIC_ERROR',
    USER_MESSAGE : {
        CALL_STARTED: "CALL_STARTED",
        PARTICIPANT_CONNECTED: "PARTICIPANT_CONNECTED",
        CALL_BARGED_IN: "CALL_BARGED_IN",
        INTERNAL_CALL_STARTED: "INTERNAL_CALL_STARTED",
        CALL_DESTROYED: "CALL_DESTROYED"
    }
};