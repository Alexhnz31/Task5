import { LightningElement, wire, track } from 'lwc';
import getUserCases from '@salesforce/apex/ServiceCaseQueueService.getUserCases';
import assignCaseToUser from '@salesforce/apex/CaseManagerController.assignCaseToUser';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { publish, MessageContext } from 'lightning/messageService';
import CASE_UPDATES_CHANNEL from '@salesforce/messageChannel/CaseUpdatesChannel__c';

export default class CaseManager extends LightningElement {
    @track cases = [];
    @track displayCases = [];
    @track isLoading = false;
    @track selectedCaseId = null;

    @wire(MessageContext)
    messageContext;

    // Получаем кейсы из Apex
    @wire(getUserCases)
    wiredCases({ data, error }) {
        if (data) {
            this.processCases(data);
        } else if (error) {
            this.showToast('Ошибка', error.body?.message || 'Не удалось загрузить кейсы', 'error');
        }
    }

    get caseOptions() {
        return this.cases.map(c => ({ label: c.subject, value: c.id }));
    }

    get isAssignDisabled() {
        return !this.selectedCaseId || this.isLoading;
    }

    handleCaseChange(event) {
        this.selectedCaseId = event.detail.value;
    }

    async assignCase() {
        if (!this.selectedCaseId) return;
        this.isLoading = true;
        try {
            await assignCaseToUser({ caseId: this.selectedCaseId });
            this.showToast('Успех', 'Кейс назначен вам', 'success');
            this.publishCaseUpdate(this.selectedCaseId, 'assigned');
            this.selectedCaseId = null;
        } catch (e) {
            this.showToast('Ошибка', e?.body?.message || 'Не удалось назначить кейс', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    publishCaseUpdate(caseId, action) {
        const payload = { caseId, action };
        publish(this.messageContext, CASE_UPDATES_CHANNEL, payload);
    }

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

        setTimeout(() => {
            this.displayCases = this.displayCases
                .filter(d => d.className !== 'disappearing')
                .map(d => ({ ...d, className: d.className === 'appearing' ? '' : d.className }));
        }, 1000);
    }

    showToast(title, message, variant = 'info') {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
