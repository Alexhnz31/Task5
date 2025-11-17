import { LightningElement, wire, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';
import getUserCases from '@salesforce/apex/ServiceCaseQueueService.getUserCases';
import updateCaseStatus from '@salesforce/apex/ServiceCaseQueueService.updateCaseStatus';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CASE_OBJECT from '@salesforce/schema/Case';

import { publish, subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import CASE_UPDATES_CHANNEL from '@salesforce/messageChannel/CaseUpdatesChannel__c';

export default class ServiceCaseQueueFiltered extends NavigationMixin(LightningElement) {
    @api title = 'Входящие кейсы';
    @track cases = [];
    @track displayCases = [];
    @track isLoading = false;
    @track statusOptions = [];

    wiredCasesResult;
    subscription = null;
    pollingIntervalId = null;
    lastRefreshTime = 0;
    pollingInterval = 1000; // Poll every 1 second for real-time updates

    @track editingCases = new Set(); // кейсы, которые редактируют другие пользователи

    @wire(MessageContext)
    messageContext;

    @wire(getObjectInfo, { objectApiName: CASE_OBJECT }) objectInfo;
    @wire(getPicklistValues, {
        recordTypeId: '$objectInfo.data.defaultRecordTypeId',
        fieldApiName: 'Case.Status'
    })
    wiredPicklistValues({ error, data }) {
        if (data) {
            this.statusOptions = data.values.map(v => ({ label: v.label, value: v.value }));
        } else if (error) {
            this.showToast('Ошибка', 'Не удалось загрузить статусы', 'error');
        }
    }

    @wire(getUserCases)
    wiredCases(result) {
        this.wiredCasesResult = result;
        if (result.data) {
            this.processCases(result.data);
        } else if (result.error) {
            this.showToast('Ошибка', result.error.body?.message || 'Не удалось загрузить кейсы', 'error');
        }
    }

    connectedCallback() {
        if (!this.subscription) {
            this.subscription = subscribe(
                this.messageContext,
                CASE_UPDATES_CHANNEL,
                (message) => this.handleLmsMessage(message)
            );
        }

        // Start polling for real-time updates
        this.startPolling();
    }

    disconnectedCallback() {
        if (this.subscription) {
            unsubscribe(this.subscription);
            this.subscription = null;
        }

        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = null;
        }
    }

    startPolling() {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
        }

        this.pollingIntervalId = setInterval(() => {
            // Don't poll if we're already loading
            if (!this.isLoading) {
                refreshApex(this.wiredCasesResult).catch(() => {});
            }
        }, this.pollingInterval);
    }

    processCases(rawCases) {
        this.isLoading = true;

        // Build map of previous lastModified timestamps
        const prevModifiedMap = new Map();
        if (this.cases && Array.isArray(this.cases)) {
            for (const pc of this.cases) {
                if (pc && pc.id) {
                    prevModifiedMap.set(pc.id, pc.lastModifiedDate ? (new Date(pc.lastModifiedDate)).getTime() : null);
                }
            }
        }

        const oldIds = new Set(this.displayCases.map(dc => dc.id));
        const newCaseIds = new Set(rawCases.map(c => c.id));

        // Cases that were visible before but not now - they should disappear
        const casesToRemove = this.displayCases.filter(dc => !newCaseIds.has(dc.id));

        const newCases = rawCases.map(c => {
            const createdDate = c.createdDate ? new Date(c.createdDate).toLocaleString() : '';
            const lastMod = c.lastModifiedDate ? (new Date(c.lastModifiedDate)).getTime() : null;

            // Determine if this case is new or updated since last seen
            let className = '';
            if (!prevModifiedMap.has(c.id)) {
                // new case
                className = 'appearing';
            } else {
                const prevTs = prevModifiedMap.get(c.id);
                if (prevTs === null && lastMod !== null) {
                    className = 'appearing';
                } else if (prevTs !== null && lastMod !== null && lastMod > prevTs) {
                    // updated case - animate as appearing
                    className = 'appearing';
                }
            }

            return {
                ...c,
                createdDate,
                className,
                isDisabled: this.editingCases.has(c.id)
            };
        });

        // Mark disappearing cases
        const disappearingCases = casesToRemove.map(r => ({ ...r, className: 'disappearing' }));

        this.displayCases = [...newCases, ...disappearingCases];
        this.cases = rawCases;

        // After animation duration, clean up disappearing and reset classNames from 'appearing' to ''
        setTimeout(() => {
            this.displayCases = this.displayCases
                .filter(d => d.className !== 'disappearing')
                .map(d => ({ ...d, className: d.className === 'appearing' ? '' : d.className }));
            this.isLoading = false;
        }, 1000);
    }


    handleLmsMessage(message) {
        if (!message?.caseId) return;

        // если кто-то начал редактировать кейс
        if (message.action === 'editingStart') {
            this.editingCases.add(message.caseId);
        } else if (message.action === 'editingEnd') {
            this.editingCases.delete(message.caseId);
        }

        // любые изменения кейса: assignment, status, creation, deletion
        // Refresh immediately on status change
        if (message.action === 'statusChanged' || message.action === 'assigned') {
            refreshApex(this.wiredCasesResult).catch(() => {});
        }
    }

    handleCaseClick(e) {
        const caseId = e.currentTarget.dataset.id;
        const caseItem = this.displayCases.find(c => c.id === caseId);
        if (caseItem?.isDisabled) return; // не кликаем если редактируется другим
        this.navigateToRecord(caseId);
    }

    handleOwnerClick(e) {
        const caseId = e.currentTarget.dataset.id;
        const caseItem = this.displayCases.find(c => c.id === caseId);
        if (caseItem?.isDisabled) return; 
        this.navigateToRecord(caseId);
    }

    navigateToRecord(id) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: id, actionName: 'view' }
        });
    }

    async handleStatusChange(e) {
        const caseId = e.target.dataset.caseId;
        const newStatus = e.detail.value;

        if (this.editingCases.has(caseId)) return; // не редактируем чужой

        // сигнализируем LMS, что начали редактировать
        publish(this.messageContext, CASE_UPDATES_CHANNEL, { caseId, action: 'editingStart' });

        this.isLoading = true;
        try {
            await updateCaseStatus({ caseId, newStatus });
            this.showToast('Успех', 'Статус обновлён', 'success');

            // публикуем LMS о статусе
            publish(this.messageContext, CASE_UPDATES_CHANNEL, { caseId, action: 'statusChanged' });
            
            // Refresh data immediately
            await refreshApex(this.wiredCasesResult);
        } catch (e) {
            this.showToast('Ошибка', e?.body?.message || 'Не удалось обновить статус', 'error');
        } finally {
            this.isLoading = false;
            // сигнализируем, что закончили редактировать
            publish(this.messageContext, CASE_UPDATES_CHANNEL, { caseId, action: 'editingEnd' });
        }
    }

    showToast(title, message, variant='info') {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
