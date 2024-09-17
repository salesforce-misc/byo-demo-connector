/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX•License•Identifier: BSD•3•Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD•3•Clause
 */

export const testDescriptionMapping = {
    ccdFields: 'Conversation Channel Definition Fields Validation',
    conversationVendorInfo: 'Conversation Vendor Info Vendor Type Validation',
    contactCenterChannel: 'Contact Center Channel Validation',
    scrt2Permissions: 'SCRT2 Permissions Check'
};

export const testDescriptions = {
    'Conversation Channel Definition Fields Validation': `Verifies CCD.Payload and CCD.EventType as valid custom fields on a custom platform event.
    Impact on the demo-connector:
    - Inbound and outbound event processing will fail. The demo connector relies on these fields to handle event payloads and types. Without them, the connector cannot process events correctly, leading to data inconsistencies and failures in event-driven workflows.
    Possible failures:
    • No Conversation Channel Definition records found in the org.
    • CustomPlatformEvent, CustomEventPayloadField, or CustomEventTypeField missing in the CCD data.
    • Failed to describe the CustomPlatformEvent (e.g., Salesforce connection issues or insufficient permissions).
    • CustomEventPayloadField or CustomEventTypeField not found on the platform event.
    • Errors encountered during the CCD fields validation process.`,

    'Conversation Vendor Info Vendor Type Validation': `Checks if CVI.VendorType matches the expected type for the current page (CCaaS or OTT).
    Impact on the demo-connector:
    - BYOCC routing will fail. If the VendorType is not set correctly, the demo connector will not recognize the Bring Your Own Contact Center (BYOCC) configuration. This will prevent the connector from routing events to the correct contact center, leading to failures in handling customer interactions.
    - OTT routing will fail. If the VendorType is not set to Bring Your Own Channel Partner (OTT), the demo connector will not recognize the OTT configuration. This will result in the connector failing to route events to the appropriate channel partner, disrupting the intended workflows.
    Possible failures:
    • No Conversation Channel Definition records found in the org.
    • CVI.VendorType is not properly set or is missing.
    • Incorrect VendorType for the page type (CCaaS or OTT).
    • Page type is unrecognized or does not match the expected values (expected 'ccaas' or 'ott').
    • Errors encountered during the VendorType validation process.`,

    'Contact Center Channel Validation': `Validates the presence of a ContactCenterChannel record for the custom channel type.
    Impact on the demo-connector:
    - Communication channels will not be established. If there are no records in the ContactCenterChannel entity or if the channel type is not set to custom, the demo connector will not be able to establish the necessary channels for communication. This will prevent the connector from handling inbound and outbound messages, leading to failures in contact center interactions.
    Possible failures:
    • No MessagingChannel found with the specified ChannelAddressIdentifier and custom ChannelType.
    • No related ContactCenterChannel record found for the MessagingChannel.
    • Errors encountered during the ContactCenterChannel validation process.`,

    'SCRT2 Permissions Check': `Verifies SCRT2 integration user permission set assignment to the platform event.
    Impact on the demo-connector:
    - Event access and processing will be blocked. Without the proper permissions, the SCRT2 integration user cannot access or interact with the platform event. This will result in the demo connector being unable to process events, causing disruptions in the integration.
    Possible failures:
    • 'sfdc_scrt2' PermissionSet not found in the org.
    • No Conversation Channel Definition records found to retrieve CustomPlatformEvent.
    • ObjectPermissions not set correctly for the SCRT2 integration user (e.g., missing Read or Create permissions).
    • Errors encountered during the SCRT2 permissions validation process.`
};

export const knowledgeArticles = {
    'Conversation Channel Definition Fields Validation': 'https://developer.salesforce.com/docs/service/messaging-partner/guide/create-conversationchanneldefinition-record.html',
    'Conversation Vendor Info Vendor Type Validation': 'https://developer.salesforce.com/docs/service/messaging-partner/guide/create-conversationvendorinfo-record.html',
    'Contact Center Channel Validation': 'https://docs.google.com/document/d/1asojQ45m0r2bCFsG79JCjaIqgEREbaS9aRBsXDo3L1Y/edit#heading=h.69qdyhy2kei5',
    'SCRT2 Permissions Check': 'https://docs.google.com/document/d/1asojQ45m0r2bCFsG79JCjaIqgEREbaS9aRBsXDo3L1Y/edit#heading=h.69qdyhy2kei5',
};