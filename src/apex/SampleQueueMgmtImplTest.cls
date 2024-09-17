@isTest
class SampleQueueMgmtImplTest {

  // Mocks the server class
  private class QueueMgmtServerMock implements HttpCalloutMock {
  
    public QueueMgmtServerMock() {
    }
    
    public HTTPResponse respond(HTTPRequest req) {
      System.assertEquals(true, req.getEndpoint().contains('services/apexrest/byotdemoconnect/SCVPartnerTestServer/v1/'));
      System.assertEquals('POST', req.getMethod());
      HTTPResponse res = new HTTPResponse();
      res.setHeader('Content-Type', 'application/json');
      res.setStatusCode(200);
      res.setStatus('OK');
      res.setBody('{"success":"true","supportsQueueUserGrouping":"true","queues":"null","groups":"null"}');
      return res;
    }
  }

  @isTest
  static void testSupportsQueueUserGrouping() {
    SampleQueueManagementImpl queueMgmtImpl = new SampleQueueManagementImpl();
    Test.setMock(HttpCalloutMock.class, new QueueMgmtServerMock());

    service_cloud_voice.QueueUserGroupingResponse response = queueMgmtImpl.supportsQueueUserGrouping(
      new service_cloud_voice.ContactCenterInfo('', '', '', '', '', '')
    );
  }

  @isTest
  static void testListQueues() {
    SampleQueueManagementImpl queueMgmtImpl = new SampleQueueManagementImpl();
    Test.setMock(HttpCalloutMock.class, new QueueMgmtServerMock());

    service_cloud_voice.ListQueuesResponse response = queueMgmtImpl.listQueues(
      new service_cloud_voice.ListQueuesRequest(
          new service_cloud_voice.ContactCenterInfo('', '', '', '', '', '')
      )
    );
  }

  @isTest
  static void testCreateQueue() {
    SampleQueueManagementImpl queueMgmtImpl = new SampleQueueManagementImpl();
    Test.setMock(HttpCalloutMock.class, new QueueMgmtServerMock());

    service_cloud_voice.CreateQueueResponse response = queueMgmtImpl.createQueue(
      new service_cloud_voice.CreateQueueRequest(
          new service_cloud_voice.ContactCenterInfo('', '', '', '', '', ''),
          'Queue 1'
      )
    );
  }

  @isTest
  static void testRemoveQueue() {
    SampleQueueManagementImpl queueMgmtImpl = new SampleQueueManagementImpl();
    Test.setMock(HttpCalloutMock.class, new QueueMgmtServerMock());

    service_cloud_voice.RemoveQueueResponse response = queueMgmtImpl.removeQueue(
      new service_cloud_voice.RemoveQueueRequest(
          new service_cloud_voice.ContactCenterInfo('', '', '', '', '', ''),
          'queueId1'
      )
    );
  }

  @isTest
  static void testAssociateUsersAndGroupsWithQueue() {
    SampleQueueManagementImpl queueMgmtImpl = new SampleQueueManagementImpl();
    Test.setMock(HttpCalloutMock.class, new QueueMgmtServerMock());

    service_cloud_voice.SyncUsersAndGroupsWithQueueResponse response = queueMgmtImpl.associateUsersAndGroupsWithQueue(
      new service_cloud_voice.SyncUsersAndGroupsWithQueueRequest(
          new service_cloud_voice.ContactCenterInfo('', '', '', '', '', ''),
          'queueId1',
          new List<service_cloud_voice.UserInfo>(),
          new List<service_cloud_voice.GroupInfo>()
      )
    );
  }

  @isTest
  static void testListGroups() {
    SampleQueueManagementImpl queueMgmtImpl = new SampleQueueManagementImpl();
    Test.setMock(HttpCalloutMock.class, new QueueMgmtServerMock());

    service_cloud_voice.ListGroupsResponse response = queueMgmtImpl.listGroups(
      new service_cloud_voice.ListGroupsRequest(
          new service_cloud_voice.ContactCenterInfo('', '', '', '', '', '')
      )
    );
  }

  @isTest
  static void testCreateGroup() {
    SampleQueueManagementImpl queueMgmtImpl = new SampleQueueManagementImpl();
    Test.setMock(HttpCalloutMock.class, new QueueMgmtServerMock());

    service_cloud_voice.CreateGroupResponse response = queueMgmtImpl.createGroup(
      new service_cloud_voice.CreateGroupRequest(
          new service_cloud_voice.ContactCenterInfo('', '', '', '', '', ''),
          'Group 1',
          'Group 1 description'
      )
    );
  }

  @isTest
  static void testAssociateUsersWithGroup() {
    SampleQueueManagementImpl queueMgmtImpl = new SampleQueueManagementImpl();
    Test.setMock(HttpCalloutMock.class, new QueueMgmtServerMock());

    service_cloud_voice.SyncUsersWithGroupResponse response = queueMgmtImpl.associateUsersWithGroup(
      new service_cloud_voice.SyncUsersWithGroupRequest(
          new service_cloud_voice.ContactCenterInfo('', '', '', '', '', ''),
          'groupId1',
          new List<service_cloud_voice.UserInfo>(),
          new List<service_cloud_voice.UserInfo>()
      )
    );
  }
}