trigger CaseTrigger on Case (after insert, after update) {
    CaseNotificationHandler.handleNewQueueCases(Trigger.new, Trigger.oldMap);
}