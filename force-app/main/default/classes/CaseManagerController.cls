public with sharing class CaseManagerController {
    @AuraEnabled
    public static Id createCase(String subject) {
        Case c = new Case(
            Subject = subject, // Используем subject вместо CaseNumber
            Status = 'New',
            Priority = 'Medium',
            Origin = 'Web'
        );
        insert c;
        return c.Id; // Возвращаем ID созданного кейса для дальнейшего использования
    }

    @AuraEnabled
    public static void assignCaseToUser(String caseId) {
        Case c = [SELECT Id FROM Case WHERE Id = :caseId LIMIT 1];
        c.OwnerId = UserInfo.getUserId();
        update c;
    }
}