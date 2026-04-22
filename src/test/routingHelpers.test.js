/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { getFlowConfigForStartInboundCall, getRoutingConfigVisibility } from '../remote-control/routingHelpers';

describe('routingHelpers (main.js logic)', () => {
    describe('getFlowConfigForStartInboundCall', () => {
        it('should include useRouteFlowApi true when checkbox is checked', () => {
            const elements = {
                phoneNumberInput: { value: '5551234567' },
                flowDevNameInput: { value: 'MyFlow' },
                fallbackQueueInput: { value: 'queue-1' },
                callbackNumberInput: { value: '5550000000' },
                unifiedRoutingRadio: { checked: true },
                useRouteFlowApiCheckbox: { checked: true }
            };
            const result = getFlowConfigForStartInboundCall(elements);
            expect(result.useRouteFlowApi).toBe(true);
            expect(result.isUnifiedRoutingEnabled).toBe(true);
            expect(result.dialedNumber).toBe('5551234567');
            expect(result.flowDevName).toBe('MyFlow');
            expect(result.fallbackQueue).toBe('queue-1');
            expect(result.callbackNumber).toBe('5550000000');
        });

        it('should include useRouteFlowApi false when checkbox is unchecked', () => {
            const elements = {
                phoneNumberInput: { value: '5551234567' },
                flowDevNameInput: { value: 'MyFlow' },
                fallbackQueueInput: { value: 'queue-1' },
                callbackNumberInput: { value: '5550000000' },
                unifiedRoutingRadio: { checked: true },
                useRouteFlowApiCheckbox: { checked: false }
            };
            const result = getFlowConfigForStartInboundCall(elements);
            expect(result.useRouteFlowApi).toBe(false);
            expect(result.isUnifiedRoutingEnabled).toBe(true);
        });

        it('should include useRouteFlowApi false when useRouteFlowApiCheckbox is missing (null)', () => {
            const elements = {
                phoneNumberInput: { value: '555' },
                flowDevNameInput: { value: '' },
                fallbackQueueInput: { value: '' },
                callbackNumberInput: { value: '' },
                unifiedRoutingRadio: { checked: true }
            };
            const result = getFlowConfigForStartInboundCall(elements);
            expect(result.useRouteFlowApi).toBe(false);
        });

        it('should strip non-digits from callbackNumber', () => {
            const elements = {
                phoneNumberInput: { value: '555' },
                flowDevNameInput: { value: '' },
                fallbackQueueInput: { value: '' },
                callbackNumberInput: { value: '555-123-4567' },
                unifiedRoutingRadio: { checked: false },
                useRouteFlowApiCheckbox: { checked: false }
            };
            const result = getFlowConfigForStartInboundCall(elements);
            expect(result.callbackNumber).toBe('5551234567');
        });

        it('should handle missing elements with defaults', () => {
            const result = getFlowConfigForStartInboundCall({});
            expect(result.dialedNumber).toBe('');
            expect(result.flowDevName).toBe('');
            expect(result.fallbackQueue).toBe('');
            expect(result.callbackNumber).toBe('');
            expect(result.isUnifiedRoutingEnabled).toBe(false);
            expect(result.useRouteFlowApi).toBe(false);
        });
    });

    describe('getRoutingConfigVisibility', () => {
        it('should return "hide" when Federated Routing is selected', () => {
            const elements = {
                federatedRoutingRadio: { checked: true },
                unifiedRoutingRadio: { checked: false }
            };
            expect(getRoutingConfigVisibility(elements)).toBe('hide');
        });

        it('should return "show" when Unified Routing is selected', () => {
            const elements = {
                federatedRoutingRadio: { checked: false },
                unifiedRoutingRadio: { checked: true }
            };
            expect(getRoutingConfigVisibility(elements)).toBe('show');
        });

        it('should return null when neither is checked', () => {
            const elements = {
                federatedRoutingRadio: { checked: false },
                unifiedRoutingRadio: { checked: false }
            };
            expect(getRoutingConfigVisibility(elements)).toBe(null);
        });

        it('should return "hide" when federated is checked (unified ignored)', () => {
            const elements = {
                federatedRoutingRadio: { checked: true },
                unifiedRoutingRadio: { checked: true }
            };
            expect(getRoutingConfigVisibility(elements)).toBe('hide');
        });

        it('should handle missing elements', () => {
            expect(getRoutingConfigVisibility({})).toBe(null);
            expect(getRoutingConfigVisibility({ federatedRoutingRadio: { checked: true } })).toBe('hide');
            expect(getRoutingConfigVisibility({ unifiedRoutingRadio: { checked: true } })).toBe('show');
        });
    });
});
