public with sharing class CaseNotificationHandler {
    public static void handleNewQueueCases(List<Case> newCases, Map<Id, Case> oldMap) {
        Set<Id> queueIds = new Set<Id>();
        List<Case> casesForNotification = new List<Case>();

        for (Case c : newCases) {
            Boolean isInsert = (oldMap == null);
            Id oldOwner = isInsert ? null : oldMap.get(c.Id).OwnerId;
            if ((isInsert || oldOwner != c.OwnerId) && String.valueOf(c.OwnerId).startsWith('00G')) {
                queueIds.add(c.OwnerId);
                casesForNotification.add(c);
            }
        }
        if (queueIds.isEmpty()) return;

        Map<Id, Group> queues = new Map<Id, Group>([
            SELECT Id FROM Group WHERE Id IN :queueIds AND Type = 'Queue'
        ]);

        Map<Id, Set<Id>> queueMembers = new Map<Id, Set<Id>>();
        for (Id q : queues.keySet()) {
            queueMembers.put(q, new Set<Id>());
        }
        for (GroupMember gm : [
            SELECT GroupId, UserOrGroupId 
            FROM GroupMember
            WHERE GroupId IN :queues.keySet()
        ]) {
            // Проверяем, что UserOrGroupId — это пользователь (префикс '005')
            if (String.valueOf(gm.UserOrGroupId).startsWith('005')) {
                queueMembers.get(gm.GroupId).add(gm.UserOrGroupId);
            }
        }

        Id notifTypeId;
        try {
            notifTypeId = [SELECT Id FROM CustomNotificationType WHERE DeveloperName = 'New_Case_Available' LIMIT 1].Id;
        } catch (QueryException e) {
            System.debug('CustomNotificationType not found, skipping notifications');
            return;
        }
        String baseUrl = System.URL.getOrgDomainUrl().toExternalForm();

        for (Case c : casesForNotification) {
            if (queues.containsKey(c.OwnerId)) {
                Messaging.CustomNotification notif = new Messaging.CustomNotification();
                notif.setTitle('Новый кейс доступен');
                
                // Get the component link - using the standard flexipage that contains our component
                String caseLink = baseUrl + '/lightning/r/Case/' + c.Id + '/view';
                String componentLink = baseUrl + '/lightning/n/Case_Inbox';
                
                String body = 'New Case ' + c.CaseNumber + ' is available. Direct link: ' + caseLink + '. Case inbox: ' + componentLink;
                notif.setBody(body);
                notif.setNotificationTypeId(notifTypeId);
                notif.setTargetId(c.Id);
                
                // Преобразуем Set<Id> в Set<String> для метода send
                Set<String> recipients = new Set<String>();
                for (Id userId : queueMembers.get(c.OwnerId)) {
                    recipients.add(String.valueOf(userId));
                }
                notif.send(recipients);
            }
        }
    }
}
