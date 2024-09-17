/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { initializeConnector } from '@salesforce/scv-connector-base';
import { Connector } from './connector';
import { initializeRemoteController } from '../remote-control/index'
import { initializeBYOOTTAppController } from '../byo-ott-app/index'

const connector = new Connector();
window.addEventListener('load', () => {
    initializeConnector(connector);
    initializeRemoteController(connector);
    initializeBYOOTTAppController(connector);
});
