# Apex Test Server Guide

The Apex test server is used to mimic calling a vendor API from the Sample Apex Integration class, ex. for implementing QueueSetup, QueueManager, GroupSetup, etc.

---

## Getting Started

Use the following files to get started:

- [Sample Integration Class](SampleQueueManagementImpl.cls)
- [Apex Test Server Class](QueueManagementTestServer.cls)

1. In the org that will host the server, add the server Apex class QueueManagementTestServer. 
2. In the dev org that will act as the client calling the server, add the server org domain to Remote Site Settings. For further instruction, follow [Adding Remote Site Settings] (https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_callouts_remote_site_settings.htm).
3. In the dev org, add the sample integration Apex class SampleQueueManagementImpl.cls and add the Apex class id to the corresponding ConversationVendorInfo.IntegrationClassId field. TODO: update this instruction with the managed package link.
4. Modify the payload passed in SampleQueueManagementImpl to the server to test various responses.

Note: QueueManagementTestServer can also be modified to test different scenarios, but ideally, this would be a static server that already encapsulates any required test scenarios. If you find a case that should be added, reach out to the Voice Routings team and create a PR to update the QueueManagementTestServer class.

Happy Testing!

---

## Client/Server structure

The Apex test server should ideally be hosted statically in one org and should not change. The server can be accessed by any dev org.
The example currently uses an NA44 STMFA org for hosting the server. The domain is https://stmfabyot.lightning.stmfa.stm.force.com.

The dev org should contain the actual Apex integration class that implements QueueSetup, QueueManager, GroupSetup, etc. and calls the server endpoint.

See an example of how the dev org should call the server:
```
// Set up the test server request
HttpRequest request = new HttpRequest();
request.setEndpoint('https://stmfabyot.lightning.stmfa.stm.force.com/services/apexrest/SCVPartnerTestServer/v1/' + methodName);
request.setMethod('POST');
request.setHeader('Content-Type', 'application/json');
request.setBody(JSON.serialize(payload));

// Send the test server request
Http http = new Http();
HttpResponse response = http.send(request);
```