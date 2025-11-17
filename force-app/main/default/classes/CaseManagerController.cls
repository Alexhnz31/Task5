public with sharing class CaseManagerController {
    @AuraEnabled(cacheable=true)
    public static List<Case> getOpenCases() {
        return [
            SELECT Id, CaseNumber, Subject 
            FROM Case 
            WHERE Status != 'Closed' 
            ORDER BY CreatedDate DESC
            LIMIT 50
        ];
    }
    @AuraEnabled
    public static void assignCaseToUser(Id caseId) {
        Case c = [SELECT Id, OwnerId FROM Case WHERE Id = :caseId LIMIT 1];
        c.OwnerId = UserInfo.getUserId();
        update c;
    }
}
