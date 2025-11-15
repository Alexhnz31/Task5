import { LightningElement, wire, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';
import getUserCases from '@salesforce/apex/ServiceCaseQueueService.getUserCases';
import updateCaseStatus from '@salesforce/apex/ServiceCaseQueueService.updateCaseStatus';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CASE_OBJECT from '@salesforce/schema/Case';

export default class ServiceCaseQueueFiltered extends NavigationMixin(LightningElement) {
    @api title = 'Неделя 5';
    @track cases = [];
    @track isLoading = false;
    @track statusOptions = [];
    wiredCasesResult;

    @wire(getUserCases)
    wiredCases(result) {
        this.wiredCasesResult = result;
        if (result.data) {
            const oldIds = new Set(this.cases.map(c => c.id));
            let newCases = result.data.map(c => ({
                ...c,
                createdDate: new Date(c.createdDate).toLocaleString(),
                className: oldIds.has(c.id) ? '' : 'appearing'
            }));
            const removed = this.cases.filter(c => !result.data.some(nc => nc.id === c.id));
            const disappearingCases = removed.map(c => ({ ...c, className: 'disappearing' }));
            this.cases = [...newCases, ...disappearingCases];
            setTimeout(() => {
                this.cases = this.cases.filter(c => c.className !== 'disappearing').map(c => {
                    if (c.className === 'appearing') c.className = '';
                    return c;
                });
            }, 1000);
            this.isLoading = false;
        } else if (result.error) {
            this.showToast('Ошибка', result.error.body?.message || 'Не удалось загрузить кейсы', 'error');
            this.isLoading = false;
        }
    }

    @wire(getObjectInfo, { objectApiName: CASE_OBJECT }) objectInfo;

    @wire(getPicklistValues, {
        recordTypeId: '$objectInfo.data.defaultRecordTypeId',
        fieldApiName: 'Case.Status'
    })
    wiredPicklistValues({ error, data }) {
        if (data) {
            this.statusOptions = data.values.map(item => ({
                label: item.label,
                value: item.value
            }));
        } else if (error) {
            this.showToast('Ошибка', 'Не удалось загрузить список статусов', 'error');
        }
    }

    connectedCallback() {
        // Слушаем кастомное событие caseChange
        this.addEventListener('caseChange', this.handleCaseChange.bind(this));
    }

    disconnectedCallback() {
        // Удаляем слушатель события
        this.removeEventListener('caseChange', this.handleCaseChange.bind(this));
    }

    handleCaseChange(event) {
        // Обновляем список кейсов при получении события
        this.isLoading = true;
        refreshApex(this.wiredCasesResult).finally(() => {
            this.isLoading = false;
        });
    }

    async handleRefresh() {
        this.isLoading = true;
        try {
            await refreshApex(this.wiredCasesResult);
        } catch (e) {
            this.showToast('Ошибка', e.body?.message || 'Обновление не удалось', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleCaseClick(e) { this.navigateToRecord(e.target.dataset.id); }
    handleOwnerClick(e) { this.navigateToRecord(e.target.dataset.id); }

    navigateToRecord(id) {
        this[NavigationMixin.Navigate]({
        type: 'standard__recordPage',
            attributes: { recordId: id, actionName: 'view' }
        });
    }

    async handleStatusChange(e) {
        const caseId = e.target.dataset.caseId;
        const newStatus = e.detail.value;
        this.isLoading = true;
        try {
            await updateCaseStatus({ caseId, newStatus });
            this.showToast('Успех', 'Статус кейса обновлен', 'success');
            await refreshApex(this.wiredCasesResult);
            // Отправляем кастомное событие после обновления статуса
            const caseChangeEvent = new CustomEvent('caseChange', { bubbles: true, composed: true });
            this.dispatchEvent(caseChangeEvent);
        } catch (e) {
            this.showToast('Ошибка', e.body?.message || 'Обновление не удалось', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}