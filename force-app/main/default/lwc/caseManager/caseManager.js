import { LightningElement, wire, track } from 'lwc';
import getUserCases from '@salesforce/apex/ServiceCaseQueueService.getUserCases';
import assignCaseToUser from '@salesforce/apex/CaseManagerController.assignCaseToUser';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { publish, MessageContext } from 'lightning/messageService';
import CASE_UPDATES_CHANNEL from '@salesforce/messageChannel/CaseUpdatesChannel__c';
import USER_ID from '@salesforce/user/Id';
import { getRecord } from 'lightning/uiRecordApi';
import NAME_FIELD from '@salesforce/schema/User.Name';

export default class CaseManager extends LightningElement {
    @track cases = [];
    @track displayCases = [];
    @track isLoading = false;
    @track selectedCaseId = null;

    @wire(getRecord, { recordId: USER_ID, fields: [NAME_FIELD] })
    currentUser;

    @wire(MessageContext)
    messageContext;

    // Получаем кейсы из Apexа
    @wire(getUserCases)
    wiredCases({ data, error }) {
        if (data) {
            this.processCases(data);
        } else if (error) {
            this.showToast('Error', error.body?.message || 'Cant Load All CASES', 'error');
        }
    }

    // исключаем кейсы принадлежащие текущему юзеру
    get caseOptions() {
        return this.cases
            .filter(c => c.ownerId !== USER_ID)
            .map(c => ({ label: c.subject, value: c.id }));
    }

    // нажата ли кнопка назначить себе
    get isAssignDisabled() {
        return !this.selectedCaseId || this.isLoading;
    }

    // изменение выбраного кейса
    handleCaseChange(event) {
        this.selectedCaseId = event.detail.value;
    }

    // ассаймент кейса
    async assignCase() {
        if (!this.selectedCaseId) return;
        this.isLoading = true;
        try {
            const caseIdToAssign = this.selectedCaseId;
            await assignCaseToUser({ caseId: caseIdToAssign });

            // Получаем  текущего пользователя 
            const assignedUserName = this.currentUser?.data?.fields?.Name?.value || 'Вам';
            const caseUrl = `/lightning/r/Case/${caseIdToAssign}/view`;

            const caseItem = this.cases.find(ci => ci.id === caseIdToAssign) || {};
            const caseNumberLabel = caseItem.caseNumber || caseIdToAssign;

            // Ссылка на профиль текущего юзера
            const ownerUrl = `/lightning/r/User/${USER_ID}/view`;

            this.dispatchEvent(new ShowToastEvent({
                title: 'Assign',
                message: `Case {0} assign to {1}`,
                messageData: [
                    { url: caseUrl, label: ` ${caseNumberLabel}` },
                    { url: ownerUrl, label: assignedUserName }
                ],
                variant: 'success'
            }));

            this.publishCaseUpdate(caseIdToAssign, 'assigned');
            this.selectedCaseId = null;
        } catch (e) {
            this.showToast('Error', e?.body?.message || 'Cant Assign Case', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // публикуем в месседж канал евент обнолвения кейса
    publishCaseUpdate(caseId, action) {
        const payload = { caseId, action };
        publish(this.messageContext, CASE_UPDATES_CHANNEL, payload);
    }

    // для анимашки
    processCases(rawCases) {
        const oldIds = new Set(this.displayCases.map(dc => dc.id));
        const newCases = rawCases.map(c => ({
            ...c,
            createdDate: new Date(c.createdDate).toLocaleString(),
            className: oldIds.has(c.id) ? '' : 'appearing'
        }));
        const removed = this.displayCases
            .filter(dc => !newCases.some(nc => nc.id === dc.id))
            .map(r => ({ ...r, className: 'disappearing' }));

        this.displayCases = [...newCases, ...removed];
        this.cases = rawCases;
        // Убираем анимацию по таймеру
        setTimeout(() => {
            this.displayCases = this.displayCases
                .filter(d => d.className !== 'disappearing')
                .map(d => ({ ...d, className: d.className === 'appearing' ? '' : d.className }));
        }, 2000);
    }
    showToast(title, message, variant = 'info') {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
