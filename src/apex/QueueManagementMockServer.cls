/**
* Sample code that acts a server for handling Apex queue management requests.
*/
@RestResource(urlMapping='/SCVPartnerTestServer/v1/*')
global with sharing class QueueManagementMockServer {

  private static Boolean shouldServerSucceed = true; // NOTE: Modify this specific param if the entire server should return an error for EVERY method

  @HttpPost
  global static Map<String, String> handleMethod(Map<String, String> payload) {
    RestRequest req = RestContext.request;
    String methodName = req.requestURI.substring(req.requestURI.lastIndexOf('/')+1);
    HttpResponse response = new HttpResponse();
    String body = JSON.serialize(executeMethod(methodName, payload));
    response.setBody(body);
    return executeMethod(methodName, payload); // Alternative option is to let Apex serialize the response implicitly
  }

  global static Map<String, String> executeMethod(String methodName, Map<String, String> payload) {
    // NOTE: Fetch params here from the payload if the integration class is modified to pass additional params
    Boolean shouldMethodSucceed = Boolean.valueOf(payload.get('success'));
    switch on methodName {
        when 'supportsQueueUserGrouping' {
          return supportsQueueUserGrouping(shouldMethodSucceed);
        }
        when 'listQueues' {
          return listQueues(shouldMethodSucceed);
        }
        when 'createQueue' {
          return createQueue(shouldMethodSucceed);
        }
        when 'removeQueue' {
          return removeQueue(shouldMethodSucceed);        
        }
        when 'associateUsersAndGroupsWithQueue' {
            return associateUsersAndGroupsWithQueue(shouldMethodSucceed);      
        }
        when 'listGroups' {
           return listGroups(shouldMethodSucceed);       
        }
        when 'createGroup' {
           return createGroup(shouldMethodSucceed);       
        }
        when 'associateUsersWithGroup' {
           return associateUsersWithGroup(shouldMethodSucceed);      
        }
    }
    return new Map<String, String>();
  }
  
  /**
   * Note: To turn off supportsQueueUserGrouping from the vendor side, modify the boolean passed into the 'supportsQueueUserGrouping' result param
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   */ 
  private static Map<String, String> supportsQueueUserGrouping(Boolean shouldMethodSucceed) {
    Map<String, String> result = getBasicResult(shouldMethodSucceed);
    result.put('supportsQueueUserGrouping', 'true'); // Modify supportsQueueUserGrouping to turn this off or on for the vendor
    return result;
  }
  
  
  /**
   * Note: To change the available queues from the vendor side, modify the numQueues or the actual queues passed into the 'queues' result param
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   */ 
  private static Map<String, String> listQueues(Boolean shouldMethodSucceed) {
    Map<String, String> result = getBasicResult(shouldMethodSucceed);
    Boolean success = shouldServerSucceed && shouldMethodSucceed;
    Integer numQueues = 3; // Modify numQueues based on desired info from vendor
    if (success) {
      Map<String, String> queues = new Map<String, String>();
      for (Integer i = 0; i < numQueues; i++) {
        queues.put('QueueId' + i, 'Customer Support Queue ' + i);
      }
      result.put('queues', JSON.serialize(queues));
    } else {
      result.put('queues', null);
    }
    return result;
  }
  
  /**
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   */ 
  private static Map<String, String> createQueue(Boolean shouldMethodSucceed) {
    Map<String, String> result = getBasicResult(shouldMethodSucceed);
    Boolean success = shouldServerSucceed && shouldMethodSucceed;
    result.put('queueId', success ? 'QueueId' + String.valueOf(Integer.valueOf(Math.random() * 1000)) : null);
    return result;
  }
  
  /**
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   * 1) success - whether the API call should be successful 
   */ 
  private static Map<String, String> removeQueue(Boolean shouldMethodSucceed) {
    return getBasicResult(shouldMethodSucceed);
  }
  
  /**
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   * 1) success - whether the API call should be successful 
   */ 
  private static Map<String, String> associateUsersAndGroupsWithQueue(Boolean shouldMethodSucceed) {
    return getBasicResult(shouldMethodSucceed);
  }
  
  /**
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   */ 
  private static Map<String, String> listGroups(Boolean shouldMethodSucceed) {
    Map<String, String> result = getBasicResult(shouldMethodSucceed);
    Boolean success = shouldServerSucceed && shouldMethodSucceed;
    Integer numGroups = 3; // Modify numGroups based on desired info from vendor
    if (success) {
      Map<String, String> groups = new Map<String, String>();
      for (Integer i = 0; i < numGroups; i++) {
        groups.put('GroupId' + i, 'Routing Group ' + i);
      }
      result.put('groups', JSON.serialize(groups));
    } else {
      result.put('groups', null);
    }
    return result;
  }
  
  /**
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   */ 
  private static Map<String, String> createGroup(Boolean shouldMethodSucceed) {
    Map<String, String> result = getBasicResult(shouldMethodSucceed);
    Boolean success = shouldServerSucceed && shouldMethodSucceed;
    result.put('groupId', success ? 'GroupId' + String.valueOf(Integer.valueOf(Math.random() * 1000)) : null);
    return result;
  }
  
  /**
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   */ 
  private static Map<String, String> associateUsersWithGroup(Boolean shouldMethodSucceed) {
    return getBasicResult(shouldMethodSucceed);
  }

  /**
   * Helper method to get a common base result with success & errorMessage in the result map
   * @param shouldMethodSucceed - Whether this specific method should succeed; otherwise, it should return an error from vendor
   */
  private static Map<String, String> getBasicResult(Boolean shouldMethodSucceed) {
    Map<String, String> result = new Map<String, String>();
    Boolean success = shouldServerSucceed && shouldMethodSucceed;
    result.put('success', String.valueOf(success));
    result.put('errorMessage', success ? null : 'Some Error Occurred');
    return result;
  }

}