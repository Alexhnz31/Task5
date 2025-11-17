import { LightningElement, wire, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';
import getUserCases from '@salesforce/apex/ServiceCaseQueueService.getUserCases';
import getCurrentUserName from '@salesforce/apex/ServiceCaseQueueService.getCurrentUserName';
import updateCaseStatus from '@salesforce/apex/ServiceCaseQueueService.updateCaseStatus';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CASE_OBJECT from '@salesforce/schema/Case';
import { publish, subscribe, unsubscribe, MessageContext } from 'lightning/messageService';
import CASE_UPDATES_CHANNEL from '@salesforce/messageChannel/CaseUpdatesChannel__c';
export default class ServiceCaseQueueFiltered extends NavigationMixin(LightningElement) {

    @api title = 'кейсы';
    @track cases = []; // кейсы из апекса
    @track displayCases = [];// кейсы для анимашки
    @track isLoading = false; //флаг для загрузки
    @track statusOptions = [];// статусы для селекта
    @track currentUserName = ''; // текущий юзер

    wiredCasesResult;// результат вайра
    subscription = null;// лмс
    pollingIntervalId = null; // ид таймера
    lastRefreshTime = 0;// время последнего рефреша
    pollingInterval = 1000; // интервал опроса в мс канале

    @track editingCases = new Set(); // кейсы редактируюемые другими пользователями

    // LMS контекст
    @wire(MessageContext)
    messageContext;
    // метадата о кейсе 
    @wire(getObjectInfo, { objectApiName: CASE_OBJECT }) objectInfo;
    @wire(getPicklistValues, {
        recordTypeId: '$objectInfo.data.defaultRecordTypeId',
        fieldApiName: 'Case.Status'
    })
    // пиклист статусов
    wiredPicklistValues({ error, data }) {
        if (data) {
            this.statusOptions = data.values.map(v => ({ label: v.label, value: v.value }));
        } else if (error) {
            this.showToast('Error', 'Cant Download Status', 'error');
        }
    }
    // юзернейм 
    @wire(getCurrentUserName)
    wiredCurrentUserName({ error, data }) {
        if (data) {
            this.currentUserName = data;
        } else if (error) {
            console.error('Error loading current user name:', error);
            this.currentUserName = '';
        }
    }
    // кейсы из апекса 
    @wire(getUserCases)
    wiredCases(result) {
        this.wiredCasesResult = result;
        if (result.data) {
            this.processCases(result.data);
        } else if (result.error) {
            this.showToast('Error', result.error.body?.message || 'Error with case loading ', 'error');
        }
    }
    // Логика работы с LMS и опросом
    connectedCallback() {
        // Подписываемся на канал LMS 
        // чтобы получать уведомления о смене статуса
        if (!this.subscription) {
            this.subscription = subscribe(
                this.messageContext,
                CASE_UPDATES_CHANNEL,
                (message) => this.handleLmsMessage(message)
            );
        }

        //  запасной механизм обновления .
        this.startPolling();
    }

    disconnectedCallback() {
        // Отписываемся от LMS 
        if (this.subscription) {
            unsubscribe(this.subscription);
            this.subscription = null;
        }

        // Останавливаем интервал polling
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
            if (!this.isLoading) {
                // подтягиваем актуальные данные
                refreshApex(this.wiredCasesResult).catch(() => {});
            }
        }, this.pollingInterval);
    }

    processCases(rawCases) {
        this.isLoading = true;

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

        const casesToRemove = this.displayCases.filter(dc => !newCaseIds.has(dc.id));

        const delayStep = 100; 
        const animationDuration = 900; 

        const sortedRawCases = this.sortCases(rawCases);

        const allCasesWithAnimation = sortedRawCases.map((c, idx) => {
            const createdDate = c.createdDate ? new Date(c.createdDate).toLocaleString() : '';

            const animationDelay = idx * delayStep;
            const rowStyle = `animation-delay: ${animationDelay}ms;`;

            const renderKey = `${c.id}-refresh-${Date.now()}-${idx}`;

            return {
                ...c,
                createdDate,
                className: 'appearing',
                rowStyle,
                renderKey,
                isDisabled: this.editingCases.has(c.id),
                priorityClass: this.getPriorityClass(c.priority)
            };
        });

        this.displayCases = allCasesWithAnimation;
        this.cases = sortedRawCases;

        const maxDelay = (sortedRawCases.length - 1) * delayStep;
        const cleanupWait = maxDelay + animationDuration + 50; // небольшой запас

        setTimeout(() => {
            this.displayCases = this.displayCases.map(d => ({ ...d, className: '' }));
            this.isLoading = false;
        }, cleanupWait);
    }
    getPriorityClass(priority) {
        const priorityMap = {
            'High': 'priority-high',
            'Medium': 'priority-medium',
            'Low': 'priority-low'
        };
        return priorityMap[priority] || '';
    }

    sortCases(cases) {
        console.log('Sorting cases. Current user name:', this.currentUserName);
        return [...cases].sort((a, b) => {
            
            const aIsMine = a.ownerName === this.currentUserName;
            const bIsMine = b.ownerName === this.currentUserName;
            
            if (aIsMine && !bIsMine) return -1; 
            if (!aIsMine && bIsMine) return 1;
            
            const aOwner = (a.ownerName || '').toLowerCase();
            const bOwner = (b.ownerName || '').toLowerCase();
            const ownerResult = aOwner.localeCompare(bOwner);
            
            if (ownerResult !== 0) return ownerResult;
            
            const aSubject = (a.subject || '').toLowerCase();
            const bSubject = (b.subject || '').toLowerCase();
            
            return aSubject.localeCompare(bSubject);
        });
    }

    // обработка в лмс
    handleLmsMessage(message) {
        if (!message?.caseId) return;

        // если начал редактировать 
        if (message.action === 'editingStart') {
            this.editingCases.add(message.caseId);
        } else if (message.action === 'editingEnd') {
            this.editingCases.delete(message.caseId);
        }

        // любые изменения кейса
        if (message.action === 'statusChanged' || message.action === 'assigned') {
            refreshApex(this.wiredCasesResult).catch(() => {});
        }
    }
    // навигация к кейсу + обраточик 
    handleCaseClick(e) {
        const caseId = e.currentTarget.dataset.id;
        const caseItem = this.displayCases.find(c => c.id === caseId);
        if (caseItem?.isDisabled) return; 
        this.navigateToRecord(caseId);
    }
    // навигация к овнеру + обработчик 
    handleOwnerClick(e) {
        const caseId = e.currentTarget.dataset.id;
        const caseItem = this.displayCases.find(c => c.id === caseId);
        if (caseItem?.isDisabled) return; 
        this.navigateToRecord(caseId);
    }
    // открыть кейс 
    navigateToRecord(id) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: id, actionName: 'view' }
        });
    }
    // изменение статуса
    async handleStatusChange(e) {
        const caseId = e.target.dataset.caseId;
        const newStatus = e.detail.value;

        if (this.editingCases.has(caseId)) return; // не редактируем чужой

        //  LMS начали редактировать
        publish(this.messageContext, CASE_UPDATES_CHANNEL, { caseId, action: 'editingStart' });

        this.isLoading = true;
        try {
            await updateCaseStatus({ caseId, newStatus });
            this.showToast('Success', 'Status is uploaded', 'success');

            //  LMS статус
            publish(this.messageContext, CASE_UPDATES_CHANNEL, { caseId, action: 'statusChanged' });
            
            // обновляем кейсы 
            await refreshApex(this.wiredCasesResult);
        } catch (e) {
            this.showToast('Error', e?.body?.message || 'Failing with status updating', 'error');
        } finally {
            this.isLoading = false;
            publish(this.messageContext, CASE_UPDATES_CHANNEL, { caseId, action: 'editingEnd' });
        }
    }
    // дефолт тост
    showToast(title, message, variant='info') {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
