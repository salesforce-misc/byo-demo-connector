# Sample Register Capability Payloads
## Register Capabilities text with namespace 
```
{
    "capabilities": {
        "appType": "custom", // Required, enum Custom only
        "channelCapabilities": [ // Required
            {
                "channelType": "custom", // Optional, enum Custom only
                "customIntegration": {
                    "customIntegrationType": "CustomChannelIntegration",  // Required
                    "integrationNamespace": "{{nameSpace}}",  // Required, orgId or nameSpacePrefix
                    "conversationChannelDefinitionDevName": "{{conversationChannelDefinitionName}}" // Required, CCD dev name 
                },
                "messageTypeCapabilities": [
                    {
                        "messageType": "StaticContentMessage", // StaticContentMessage / ChoicesMessage FormMessage
                        "formatTypeCapabilities": [
                            {
                                "formatType": "Text", // For StaticContentMessage: Text, RichLink, Links, Attachments; For ChoicesMessage: Buttons, QuickReplies; For FormMessage: Inputs
                                "capabilityFieldRestriction": [
                                    {
                                        "fieldJsonPath": "$.staticContent.text",
                                        "restriction": {
                                            "fieldRestrictionType": "StringFieldRestriction", // ArrayRestriction, StringFieldRestriction, RequiredFieldRestriction, For Attachments: MimeTypeRestriction, FileSizeRestriction, DimensionRestriction
                                            "encoding": "UTF8",
                                            "maxLength": 10
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    }
}
```
## Register Capabilities - Text, Richlink, Links, Attachment, QuickReplies, Buttons, Form with CapabilityFieldRestriction
```
{
    "capabilities": {
        "appType": "custom",
        "channelCapabilities": [
            {
                "channelType": "custom",
                "customIntegration": {
                    "customIntegrationType": "CustomChannelIntegration",
                    "integrationNamespace": "{{nameSpace}}", // Required, orgId or nameSpace
                    "conversationChannelDefinitionDevName": "{{conversationChannelDefinitionName}}"
                },
                "messageTypeCapabilities": [
                    {
                        "messageType": "StaticContentMessage",
                        "formatTypeCapabilities": [
                            {
                                "formatType": "Text",
                                "capabilityFieldRestriction": [
                                    {
                                        "fieldJsonPath": "$.staticContent.text",
                                        "restriction": {
                                            "fieldRestrictionType": "ArrayRestriction",
                                            "maxItems": 9
                                        }
                                    },
                                    {
                                        "fieldJsonPath": "$.staticContent.text",
                                        "restriction": {
                                            "fieldRestrictionType": "StringFieldRestriction",
                                            "encoding": "UTF8",
                                            "maxLength": 10
                                        }
                                    },
                                    {
                                        "fieldJsonPath": "$.staticContent.text",
                                        "restriction": {
                                            "fieldRestrictionType": "RequiredFieldRestriction",
                                            "fieldRequired": false
                                        }
                                    }
                                ]
                            },
                            {
                                "formatType": "RichLink",
                                "capabilityFieldRestriction": [
                                    {
                                        "fieldJsonPath": "$.staticContent.image",
                                        "restriction": {
                                            "fieldRestrictionType": "RequiredFieldRestriction",
                                            "fieldRequired": false
                                        }
                                    }
                                ]
                            },
                            {
                                "formatType": "Links"
                            },
                            {
                                "formatType": "Attachments",
                                "capabilityFieldRestriction": [
                                    {
                                        "fieldJsonPath": "$.staticContent.attachments.mimeType",
                                        "restriction": {
                                            "fieldRestrictionType": "MimeTypeRestriction",
                                            "mimeType": "image/png"
                                        }
                                    },
                                    {
                                        "fieldJsonPath": "$.staticContent.attachments",
                                        "restriction": {
                                            "fieldRestrictionType": "FileSizeRestriction",
                                            "maxSizeInKb": 1000
                                        }
                                    },
                                    {
                                        "fieldJsonPath": "$.staticContent.attachments",
                                        "restriction": {
                                            "fieldRestrictionType": "DimensionRestriction",
                                            "dimensionType": "PIXEL",
                                            "x": 0.1,
                                            "y": 0.1
                                        }
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "messageType": "ChoicesMessage",
                        "formatTypeCapabilities": [
                            {
                                "formatType": "Buttons"
                            },
                            {
                                "formatType": "QuickReplies",
                                "fieldRestrictions": [
                                    {
                                        "fieldJsonPath": "$.choices.optionItems",
                                        "restriction": {
                                            "fieldRestrictionType": "ArrayRestriction",
                                            "maxItems": 9
                                        }
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "messageType": "FormMessage",
                        "formatTypeCapabilities": [
                            {
                                "formatType": "Inputs"
                            }
                        ]
                    }
                ]
            }
        ]
    }
}
```

## Register Capabilities - Attachments with file size restrictions
```
{
    "capabilities": {
        "appType": "custom",
        "channelCapabilities": [
            {
                "channelType": "custom",
                "customIntegration": {
                    "customIntegrationType": "CustomChannelIntegration",
                    "integrationNamespace": "{{nameSpace}}", // Required, orgId or nameSpace
                    "conversationChannelDefinitionDevName": "{{conversationChannelDefinitionName}}"
                },
                "messageTypeCapabilities": [
                    {
                        "messageType": "StaticContentMessage",
                        "formatTypeCapabilities": [
                            {
                                "formatType": "Attachments",
                                "capabilityFieldRestriction": [
                                    {
                                        "fieldJsonPath": "$.staticContent.attachments",
                                        "restriction": {
                                            "fieldRestrictionType": "FileSizeRestriction",
                                            "maxSizeInKb": 1000
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    }
}
```


[back](/README.md)