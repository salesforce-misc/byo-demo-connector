# Sample Conversation History Payloads
## Conversation History payload

- Participants.json

```
{
    "conversationParticipants": [
        {
            "displayName": "{{fromUserId}}",
            "participant": {
                "subject": "End User Participant",
                "role": "EndUser", // Chatbot or EndUser
                "appType": "custom"
            },
            "joinedTime": {{timestamp}}
        },
        {
            "displayName": "Bot123",
            "participant": {
                "subject": "Bot Participant",
                "role": "Chatbot",
                "appType": "custom"
            },
            "joinedTime": {{timestamp}},
            "leftTime": {{timestamp}}
        }
    ]
}
```
- Entries.json
```
{
    "conversationEntries": [
        {
            "clientTimestamp": {{timestamp}},
            "sender": {
                "subject": "End User Participant",
                "role": "EndUser", // Chatbot or EndUser
                "appType": "custom"
            },
            "entryPayload": {
                "entryType": "Message",
                "id": "{{uuid}}",
                "abstractMessage": {
                    "messageType": "StaticContentMessage",
                    // "inReplyToMessageId": <inReplyToMessageId>,
                    "id": "{{uuid}}",
                    "staticContent": {
                        "formatType": "Text",
                        "text": "Conversation with Bots - Message1"
                    }
                }
            }
        }
    ]
}
```

## Conversation History payload with attachment
- Participants.json
```
{
    "conversationParticipants": [
        {
            "displayName": "{{fromUserId}}",
            "participant": {
                "subject": "End User Participant",
                "role": "EndUser", // Chatbot or EndUser
                "appType": "custom"
            },
            "joinedTime": {{timestamp}}
        },
        {
            "displayName": "Bot123",
            "participant": {
                "subject": "Bot Participant",
                "role": "Chatbot",
                "appType": "custom"
            },
            "joinedTime": {{timestamp}},
            "leftTime": {{timestamp}}
        }
    ]
}
```
- Entries.json
```
{
   "conversationEntries": [
        {
            "clientTimestamp": {{timestamp}},
            "sender": {
                "subject": "End User Participant",
                "role": "EndUser", // Chatbot or EndUser
                "appType": "custom"
            },
            "entryPayload": {
                "entryType": "Message",
                "id": "{{uuid}}",
                "abstractMessage": {
                    "messageType": "StaticContentMessage",
                    "inReplyToMessageId": "{{uuid}}",
                    "id": "{{uuid}}",
                    "references": [
                        {
                            "recordId": "1234",
                            "id": "{{uuid}}",
                        }
                    ],
                    "staticContent": {
                        "formatType": "Attachments",
                        "text": "Conversation with Bots - AttachmentMessage1",
                        "attachments": [
                            {
                                "name": "pdf-sample.pdf",
                                "attachmentUploadResult": "<attachmentUploadResult>",
                                "id": "attachment123",
                                "mimeType": "<supported-mimeTypes>",
                                "url": "<publicURl-of-uploaded-file>",
                                "referenceId": "<referenceId>"
                            }
                        ]
                    }
                }
            }
        }
    ]
}
```

## Sample
- Participant.json
```
{
    "conversationParticipants": [
        {
            "displayName": "testUser",
            "participant": {
                "subject": "End User Participant",
                "role": "EndUser",
                "appType": "custom"
            },
            "joinedTime": 1737579987000
        },
        {
            "displayName": "Bot123",
            "participant": {
                "subject": "Bot Participant",
                "role": "Chatbot",
                "appType": "custom"
            },
            "joinedTime": 1737579987000,
            "endTime": 1737579989000
        }
    ]
}
```
- Entries.json
```
{
    "conversationEntries": [
        {
            "clientTimestamp": 1737579988000,
            "sender": {
                "subject": "EndUser ConversationEntries",
                "role": "EndUser", 
                "appType": "custom"
            },
            "entryPayload": {
                "entryType": "Message",
                "id": "8b1b7cb0-ed33-491c-95f6-1069618127fc",
                "abstractMessage": {
                    "messageType": "StaticContentMessage",
                    "id": "8b1b7cb0-ed33-491c-95f6-1069618127fc",
                    "staticContent": {
                        "formatType": "Text",
                        "text": "Conversation with Bots - Message1"
                    }
                }
            }
        },
        {
            "clientTimestamp": 1737579988000,
            "sender": {
                "subject": "EndUser ConversationEntries",
                "role": "EndUser", 
                "appType": "custom"
            },
            "entryPayload": {
                "entryType": "Message",
                "id": "1e120d9b-6bee-429a-adfa-0b43b6aaa050",
                "abstractMessage": {
                    "messageType": "StaticContentMessage",
                    "id": "1e120d9b-6bee-429a-adfa-0b43b6aaa050",
                    "staticContent": {
                        "formatType": "Text",
                        "text": "Conversation with Bots - Message1"
                    }
                }
            }
        }
    ]
}
```

[back](/README.md)