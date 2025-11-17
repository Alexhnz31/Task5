public with sharing class CaseNotificationHandler {

    public static void handleNewQueueCases(List<Case> newCases, Map<Id, Case> oldMap) {
        Set<Id> queueIds = new Set<Id>();//уникальные кушки
        List<Case> casesForNotification = new List<Case>();
        for (Case c : newCases) {
            //Insert или Update?
            Boolean isInsert = (oldMap == null);
            Id oldOwner = isInsert ? null : oldMap.get(c.Id).OwnerId;
            if ((isInsert || oldOwner != c.OwnerId) && //это новый кейс или owner изменился?
             String.valueOf(c.OwnerId).startsWith('00G')) //новый овнер это очередь?
            {
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
            // Проверяем что gm user 
            if (String.valueOf(gm.UserOrGroupId).startsWith('005')) {
                queueMembers.get(gm.GroupId).add(gm.UserOrGroupId);
            }
        }
        Id notifTypeId;
        try {//без этого не работает assigmnent на кейсе
            notifTypeId = [SELECT Id FROM CustomNotificationType WHERE DeveloperName = 'New_Case_Available' LIMIT 1].Id;
        } catch (QueryException e) {
            System.debug('CustomNotificationType not found, skipping notifications');
            return;
        }
        // юрл орги 
        String baseUrl = System.URL.getOrgDomainUrl().toExternalForm();

        for (Case c : casesForNotification) {
            if (queues.containsKey(c.OwnerId)) {
                //кастом уведомление 
                Messaging.CustomNotification notif = new Messaging.CustomNotification();
                notif.setTitle('Новый кейс доступен');
                //ссылки для юзера
                String caseLink = baseUrl + '/lightning/r/Case/' + c.Id + '/view';
                String componentLink = baseUrl + '/lightning/n/Case_Inbox';
                
                String body = 'New Case ' + c.CaseNumber + ' is available. Direct link: ' + caseLink + '. Case inbox: ' + componentLink;
                notif.setBody(body);
                notif.setNotificationTypeId(notifTypeId);
                notif.setTargetId(c.Id);
                
                // отправляем 
                Set<String> recipients = new Set<String>();
                for (Id userId : queueMembers.get(c.OwnerId)) {
                    recipients.add(String.valueOf(userId));
                }
                notif.send(recipients);
            }
        }
    }
}
