/*
 * Copyright (c) 2026, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Build flowConfig object for startInboundCall from form elements.
 * Used by remote-control main.js; extracted for testability.
 * @param {Object} elements - Form element refs
 * @param {HTMLInputElement} [elements.phoneNumberInput]
 * @param {HTMLInputElement} [elements.flowDevNameInput]
 * @param {HTMLInputElement} [elements.fallbackQueueInput]
 * @param {HTMLInputElement} [elements.callbackNumberInput]
 * @param {HTMLInputElement} [elements.unifiedRoutingRadio]
 * @param {HTMLInputElement} [elements.useRouteFlowApiCheckbox]
 * @returns {{ dialedNumber: string, flowDevName: string, fallbackQueue: string, callbackNumber: string, isUnifiedRoutingEnabled: boolean, useRouteFlowApi: boolean }}
 */
export function getFlowConfigForStartInboundCall(elements) {
    const phoneNumber = elements.phoneNumberInput?.value ?? '';
    const flowDevName = elements.flowDevNameInput?.value ?? '';
    const fallbackQueue = elements.fallbackQueueInput?.value ?? '';
    const callbackNumber = elements.callbackNumberInput ? String(elements.callbackNumberInput.value).replace(/\D/g, '') : '';
    const isUnifiedRoutingEnabled = !!elements.unifiedRoutingRadio?.checked;
    const useRouteFlowApi = !!(elements.useRouteFlowApiCheckbox && elements.useRouteFlowApiCheckbox.checked);
    return {
        dialedNumber: phoneNumber,
        flowDevName,
        fallbackQueue,
        callbackNumber,
        isUnifiedRoutingEnabled,
        useRouteFlowApi
    };
}

/**
 * Determine unified routing params panel visibility from routing radio state.
 * Used by setRoutingConfig in main.js; extracted for testability.
 * @param {Object} elements - Form element refs
 * @param {HTMLInputElement} [elements.federatedRoutingRadio]
 * @param {HTMLInputElement} [elements.unifiedRoutingRadio]
 * @returns {'hide'|'show'|null} - 'hide' to hide panel, 'show' to show panel, null if no change
 */
export function getRoutingConfigVisibility(elements) {
    if (elements.federatedRoutingRadio?.checked) {
        return 'hide';
    }
    if (elements.unifiedRoutingRadio?.checked) {
        return 'show';
    }
    return null;
}
