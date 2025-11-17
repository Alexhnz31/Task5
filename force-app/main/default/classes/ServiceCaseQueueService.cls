public with sharing class ServiceCaseQueueService {


    //Получаем очереди где есть наш юзер
    private static Set<Id> getUserQueueIds() {
        Set<Id> queueIds = new Set<Id>();
        for (GroupMember gm : [
            SELECT GroupId
            FROM GroupMember
            WHERE UserOrGroupId = :UserInfo.getUserId()
              AND Group.Type = 'Queue'
        ]) {
            queueIds.add(gm.GroupId);
        }
        return queueIds;
    }
    // Получаем кейсы для юзеров и очереди где есть юзер + сортируем
    @AuraEnabled(cacheable=true)
    public static List<CaseWrapper> getUserCases() {
        Id userId = UserInfo.getUserId();
        Set<Id> queueIds = getUserQueueIds();

        List<Case> rawCases = [
            SELECT Id, CaseNumber, Subject, Priority, Status, CreatedDate, LastModifiedDate, Owner.Name, OwnerId
            FROM Case
            WHERE OwnerId = :userId OR OwnerId IN :queueIds
            ORDER BY CreatedDate DESC
            LIMIT 25
        ];
        

        List<CaseWrapper> wrappers = new List<CaseWrapper>();
        for (Case c : rawCases) {
            wrappers.add(new CaseWrapper(c, userId));
        }

        wrappers.sort();

        return wrappers;
    }
    //lWC
    @AuraEnabled
    public static void updateCaseStatus(Id caseId, String newStatus) {
        update new Case(Id = caseId, Status = newStatus);
    }

    // Log case changes for real-time synchronization
    public static void logCaseChanges(List<Case> newCases, Map<Id, Case> oldMap, Boolean isInsert) {
        // This method can be extended to log to a custom object if needed
        // For now, the platform event publishing will happen via trigger
        for (Case c : newCases) {
            String action = isInsert ? 'created' : 'updated';
            if (!isInsert && oldMap != null) {
                Case oldCase = oldMap.get(c.Id);
                if (oldCase.OwnerId != c.OwnerId) {
                    action = 'assigned';
                }
            }
            System.debug('Case ' + c.Id + ' action: ' + action);
        }
    }

    //Обертка для кейса + сортировка
    public class CaseWrapper implements Comparable {
        @AuraEnabled public Id id;
        @AuraEnabled public String caseNumber;
        @AuraEnabled public String subject;
        @AuraEnabled public String priority;
        @AuraEnabled public String status;
    @AuraEnabled public DateTime createdDate;
    @AuraEnabled public DateTime lastModifiedDate;
        @AuraEnabled public String ownerName;
        @AuraEnabled public Id ownerId;

        private Id userId; 
        //Конструктор
        public CaseWrapper(Case c, Id currentUserId) {
            this.id = c.Id;
            this.caseNumber = c.CaseNumber;
            this.subject = c.Subject;
            this.priority = c.Priority;
            this.status = c.Status;
            this.createdDate = c.CreatedDate;
            this.lastModifiedDate = c.LastModifiedDate;
            this.ownerName = c.Owner.Name;
            this.ownerId = c.OwnerId;
            this.userId = currentUserId;
        }

        public Integer compareTo(Object obj) {
            CaseWrapper other = (CaseWrapper)obj;
       //Кейсы нашего юзера в приорите=те 
            Boolean isMine = this.ownerId == userId;
            Boolean isOtherMine = other.ownerId == userId;
            if (isMine && !isOtherMine) return -1;
            if (!isMine && isOtherMine) return 1;
            //Приоритет по приоритету
            Integer p1 = priorityValue(this.priority);
            Integer p2 = priorityValue(other.priority);
            if (p1 != p2) return p1 - p2;
            // Приоритет по дате создания
            if (this.createdDate == null && other.createdDate == null) return 0;
            if (this.createdDate == null) return 1;
            if (other.createdDate == null) return -1;
            return other.createdDate.getTime() > this.createdDate.getTime() ? 1 : -1;
        }
        //Приоритеты в инты
        private Integer priorityValue(String pri) {
            if (pri == 'High') return 1;
            if (pri == 'Medium') return 2;
            if (pri == 'Low') return 3;
            return 99;
        }
    }
}