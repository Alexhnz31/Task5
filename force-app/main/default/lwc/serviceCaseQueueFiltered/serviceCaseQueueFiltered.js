import { LightningElement, wire, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';
import getUserCases from '@salesforce/apex/ServiceCaseQueueService.getUserCases';
import updateCaseStatus from '@salesforce/apex/ServiceCaseQueueService.updateCaseStatus';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CASE_OBJECT from '@salesforce/schema/Case';

export default class ServiceCaseQueueFiltered extends NavigationMixin(LightningElement) {

    @api title = 'Week 5';//без этого не деплоится (даже без api)(почему?)-передаем в тост тип
    @track cases = [];
    @track isLoading = false; //флажок для рефреша + ошибок
    @track statusOptions = []; // пиклист статусов

    //кейсы для рефреша
    wiredCasesResult;
    //апекс
    @wire(getUserCases)
    wiredCases(result) {
        this.wiredCasesResult = result;
        if (result.data) {
            this.cases = result.data.map(c => ({
                ...c,
                createdDate: new Date(c.createdDate).toLocaleString()
            }));
            this.isLoading = false;
        } else if (result.error) {
            this.showToast('Error', result.error.body?.message || 'Failed to load cases', 'error');
            this.isLoading = false;
        }
    }
    //получаем пиклист
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
            this.showToast('Error', 'Failed to load Status picklist', 'error');
        }
    }

    async handleRefresh() {
        this.isLoading = true;
        try {
            await refreshApex(this.wiredCasesResult);
        } catch (e) {
            this.showToast('Error', e.body?.message || 'Refresh failed', 'error');
        } finally {
            this.isLoading = false;
        }
    }
    //кликабельность кейса и овнера
    handleCaseClick(e) { this.navigateToRecord(e.target.dataset.id); }
    handleOwnerClick(e) { this.navigateToRecord(e.target.dataset.id); }

    navigateToRecord(id) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId: id, actionName: 'view' }
        });
    }
    //апекс апдейт статус
    async handleStatusChange(e) {
        const caseId = e.target.dataset.caseId;
        const newStatus = e.detail.value;
        this.isLoading = true;
        try {
            await updateCaseStatus({ caseId, newStatus });
            this.showToast('Success', 'Case status updated', 'success');
            await refreshApex(this.wiredCasesResult);
        } catch (e) {
            this.showToast('Error', e.body?.message || 'Update failed', 'error');
        } finally {
            this.isLoading = false;
        }
    }
    //тост 
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}