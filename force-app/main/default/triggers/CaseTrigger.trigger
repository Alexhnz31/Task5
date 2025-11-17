trigger CaseTrigger on Case (after insert, after update) {
    CaseNotificationHandler.handleNewQueueCases(Trigger.new, Trigger.oldMap);
    ServiceCaseQueueService.logCaseChanges(Trigger.new, Trigger.oldMap, Trigger.isInsert);
}