/**
* Sample code that implements QueueManager, QueueSetup, GroupSetup in order to handle
* queue management requests.
*/
public class SampleQueueManagementImpl implements service_cloud_voice.QueueManager,
                                                   service_cloud_voice.QueueSetup, service_cloud_voice.GroupSetup {
 
   /**
    * @description Returns whether the contact center supports user grouping.
    *              (Implementation for QueueManager.)
    * @param contactCenterInfo Info about the contact center.
    * @return QueueUserGroupingResponse Response containing whether the queue
    *                                   supports user grouping.
    */
   public service_cloud_voice.QueueUserGroupingResponse supportsQueueUserGrouping(service_cloud_voice.ContactCenterInfo contactCenterInfo) {
        // Execute the test server request
        Map<String, String> payload = new Map<String, String>(); // NOTE: Add additional params as desired & remember to update the server to fetch the param
        payload.put('success', 'true'); // NOTE: Modify this param based on whether this specific method should succeed or fail
        Map<String, Object> results = executeHttpRequest(payload, 'supportsQueueUserGrouping');

        boolean success = Boolean.valueOf(results.get('success'));
        String errorMessage = (String) results.get('errorMessage');
        boolean supportsQueueUserGrouping = Boolean.valueOf(results.get('supportsQueueUserGrouping'));

        // Returns whether contact center supports user grouping.
        // * @param boolean Indicates whether the method execution was successful.
        // * @param String Contains any error info that occurred during the
        // *               method execution.
        // * @param boolean Indicate if user grouping is supported.     
        return new service_cloud_voice.QueueUserGroupingResponse(success, errorMessage, supportsQueueUserGrouping);
   }
  
   /**
    * @description Gets the list of queues. (Implementation for QueueSetup.)
    * @param queueListRequest Request containing information about queue list.
    * @return ListQueuesResponse Response containing the desired queues.
    */
   public service_cloud_voice.ListQueuesResponse
       listQueues(service_cloud_voice.ListQueuesRequest queueListRequest) {
        // Execute the test server request
        Map<String, String> payload = new Map<String, String>(); // NOTE: Add additional params as desired & remember to update the server to fetch the param
        payload.put('success', 'true'); // NOTE: Modify this param based on whether this specific method should succeed or fail
        Map<String, Object> results = executeHttpRequest(payload, 'listQueues');

        boolean success = Boolean.valueOf(results.get('success'));
        String errorMessage = (String) results.get('errorMessage');
        Map<String, String> queues = convertMap((Map<String, Object>) JSON.deserializeUntyped((String) results.get('queues')));
      
       // Returns the list of queues (for a successful response).
       // * @param boolean Indicates whether the method execution was successful.
       // * @param Map<String, String> List of queues.
       // * @param String Contains any error info that occurred during the
       // *               method execution.
       return new service_cloud_voice.ListQueuesResponse(success, queues, errorMessage);
   }
 
   /**
    * @description Creates a queue. (Implementation for QueueSetup.)
    * @param createQueueRequest Request containing information about the new queue.
    * @return CreateQueueResponse Response containing the new queue (or an error).
    */
   public service_cloud_voice.CreateQueueResponse createQueue(service_cloud_voice.CreateQueueRequest createQueueRequest) {
        Map<String, String> payload = new Map<String, String>(); // NOTE: Add additional params as desired & remember to update the server to fetch the param
        payload.put('success', 'true'); // NOTE: Modify this param based on whether this specific method should succeed or fail
        Map<String, Object> results = executeHttpRequest(payload, 'createQueue');

        boolean success = Boolean.valueOf(results.get('success'));
        String errorMessage = (String) results.get('errorMessage');
        String queueId = (String) results.get('queueId');
      
       // Returns the new queue ID (for a successful response).
       // * @param boolean Indicates whether the method execution was successful.
       // * @param String ID of the new queue.
       // * @param String Contains any error that occurred during the method execution.
       return new service_cloud_voice.CreateQueueResponse(success, queueId, errorMessage);
   }
 
   /**
    * @description Removes an existing queue. (Implementation for QueueSetup.)
    * @param removeQueueRequest Request containing information about queue removal.
    * @return RemoveQueueResponse Response containing the queue removal information.
    */    
   public service_cloud_voice.RemoveQueueResponse removeQueue(service_cloud_voice.RemoveQueueRequest removeQueueRequest) {
        // Execute the test server request
        Map<String, String> payload = new Map<String, String>(); // NOTE: Add additional params as desired & remember to update the server to fetch the param
        payload.put('success', 'true'); // NOTE: Modify this param based on whether this specific method should succeed or fail
        Map<String, Object> results = executeHttpRequest(payload, 'removeQueue');

        boolean success = Boolean.valueOf(results.get('success'));
        String errorMessage = (String) results.get('errorMessage');
      
        // Returns the status of the removed queue (for a successful response).
        // * @param boolean Indicates whether the method execution was successful.
        // * @param String Contains any error info that occurred during the
        // *               method execution.
        return new service_cloud_voice.RemoveQueueResponse(success, errorMessage);
   } 
 
   /**
    * @description Associates users and groups with a queue.
    * @param associateUsersAndGroupsWithQueueRequest Request containing
    *        information about the users and groups.
    * @return SyncUsersAndGroupsWithQueueResponse Response containing the result.
    */    
   public service_cloud_voice.SyncUsersAndGroupsWithQueueResponse associateUsersAndGroupsWithQueue(service_cloud_voice.SyncUsersAndGroupsWithQueueRequest associateUsersAndGroupsWithQueueRequest) {
        // Execute the test server request
        Map<String, String> payload = new Map<String, String>(); // NOTE: Add additional params as desired & remember to update the server to fetch the param
        payload.put('success', 'true'); // NOTE: Modify this param based on whether this specific method should succeed or fail
        Map<String, Object> results = executeHttpRequest(payload, 'associateUsersAndGroupsWithQueue');
  
        boolean success = Boolean.valueOf(results.get('success'));
        String errorMessage = (String) results.get('errorMessage');
      
        // Returns the status of the association (for a successful response).
        // * @param boolean Indicates whether the method execution was successful.
        // * @param String Contains any error info that occurred during the
        // *               method execution.
        return new service_cloud_voice.SyncUsersAndGroupsWithQueueResponse(success, errorMessage);
   }

   /**
    * @description Gets the list of groups. (Implementation for GroupSetup.)
    * @param listGroupsRequest Request containing information about group list.
    * @return ListGroupsResponse Response containing the desired groupd.
    */
   public service_cloud_voice.ListGroupsResponse listGroups(service_cloud_voice.ListGroupsRequest listGroupsRequest) {
        // Execute the test server request
        Map<String, String> payload = new Map<String, String>(); // NOTE: Add additional params as desired & remember to update the server to fetch the param
        payload.put('success', 'true'); // NOTE: Modify this param based on whether this specific method should succeed or fail
        Map<String, Object> results = executeHttpRequest(payload, 'listGroups');

        boolean success = Boolean.valueOf(results.get('success'));
        String errorMessage = (String) results.get('errorMessage');
        Map<String, String> groups = convertMap((Map<String, Object>) JSON.deserializeUntyped((String) results.get('groups')));

        // Returns the list of groups (for a successful response).
        // * @param boolean Indicates whether the method execution was successful.
        // * @param Map<String, String> List of groups.
        // * @param String Contains any error info that occurred during the
        // *               method execution.
        return new service_cloud_voice.ListGroupsResponse(success, groups, errorMessage);

   }

   /**
    * @description Creates a group. (Implementation for GroupSetup.)
    * @param createQueueRequest Request containing information about the new group.
    * @return CreateQueueResponse Response containing the new group (or an error).
    */
   public service_cloud_voice.CreateGroupResponse createGroup(service_cloud_voice.CreateGroupRequest createGroupRequest) {
        // Execute the test server request
        Map<String, String> payload = new Map<String, String>(); // NOTE: Add additional params as desired & remember to update the server to fetch the param
        payload.put('success', 'true'); // NOTE: Modify this param based on whether this specific method should succeed or fail
        Map<String, Object> results = executeHttpRequest(payload, 'createGroup');
  
        boolean success = Boolean.valueOf(results.get('success'));
        String errorMessage = (String) results.get('errorMessage');
        String groupId = (String) results.get('groupId');
      
       // Returns the new queue ID (for a successful response).
       // * @param boolean Indicates whether the method execution was successful.
       // * @param String ID of the new group.
       // * @param String Contains any error that occurred during the method execution.
       return new service_cloud_voice.CreateGroupResponse(success, groupId, errorMessage);
   }
 
   /**
    * @description Associates users with a group.
    * @param syncUsersWithGroupRequest Request containing
    *        information about the users.
    * @return SyncUsersWithGroupResponse Response containing the result.
    */    
   public service_cloud_voice.SyncUsersWithGroupResponse associateUsersWithGroup(service_cloud_voice.SyncUsersWithGroupRequest syncUsersWithGroupRequest) {
        // Execute the test server request
        Map<String, String> payload = new Map<String, String>(); // NOTE: Add additional params as desired & remember to update the server to fetch the param
        payload.put('success', 'true'); // NOTE: Modify this param based on whether this specific method should succeed or fail
        Map<String, Object> results = executeHttpRequest(payload, 'associateUsersWithGroup');
  
        boolean success = Boolean.valueOf(results.get('success'));
        String errorMessage = (String) results.get('errorMessage');
      
        // Returns the status of the association (for a successful response).
        // * @param boolean Indicates whether the method execution was successful.
        // * @param String Contains any error info that occurred during the
        // *               method execution.
        return new service_cloud_voice.SyncUsersWithGroupResponse(success, errorMessage);
   }
   
   private Map<String, Object> executeHttpRequest(Map<String, String> payload, String methodName) {
        // Set up the test server request
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:ApexTestServer/services/apexrest/byotdemoconnect/SCVPartnerTestServer/v1/' + methodName);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Content-Length', '0');
        
        // Prepare the request body
        Map<String, Map<String, String>> bodyMap = new Map<String, Map<String, String>>();
        bodyMap.put('payload', payload);
        String bodyStr = JSON.serialize(bodyMap);
        req.setBody(bodyStr);
        //system.debug(req.getBody()); // Note: Uncomment to debug
        
        // Send the test server request and deserialize the response body
        Http http = new Http();
        HTTPResponse res = http.send(req);
        //system.debug(res.getStatusCode()); // Note: Uncomment to debug
        //system.debug(res.getBody()); // Note: Uncomment to debug
        Map<String, Object> results = (Map<String, Object>)JSON.deserializeUntyped(res.getBody());

        // Validate the response body
        if (results == null) {
          throw new CalloutException('Some error occurred and ' + methodName + ' method was unsuccessful');
        }
        return results;

   }
   
   private Map<String, String> convertMap(Map<String, Object> objectMap) {
       Map<String, String> strMap = new Map<String, String>();
       if (objectMap != null) {
           for (String key: objectMap.keyset()) {
               strMap.put(key, String.valueof(objectMap.get(key)));
           }
       }
       return strMap;
   }
}