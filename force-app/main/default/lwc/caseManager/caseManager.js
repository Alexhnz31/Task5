import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createCase from '@salesforce/apex/CaseManagerController.createCase';
import assignCaseToUser from '@salesforce/apex/CaseManagerController.assignCaseToUser';

export default class CaseManager extends LightningElement {
    @track caseSubject = '';
    @track caseId = '';
    @track isLoading = false;

    handleCaseSubjectChange(event) {
        this.caseSubject = event.target.value;
    }

    async createCase() {
        this.isLoading = true;
        try {
            this.caseId = await createCase({ subject: this.caseSubject });
            this.showToast('Успех', 'Кейс создан', 'success');
            // Отправляем кастомное событие
            const caseChangeEvent = new CustomEvent('caseChange', { bubbles: true, composed: true });
            this.dispatchEvent(caseChangeEvent);
        } catch (e) {
            this.showToast('Ошибка', e.body?.message || 'Не удалось создать кейс', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async assignCase() {
        if (!this.caseId) {
            this.showToast('Ошибка', 'Сначала создайте кейс', 'error');
            return;
        }
        this.isLoading = true;
        try {
            await assignCaseToUser({ caseId: this.caseId });
            this.showToast('Успех', 'Кейс назначен', 'success');
            // Отправляем кастомное событие
            const caseChangeEvent = new CustomEvent('caseChange', { bubbles: true, composed: true });
            this.dispatchEvent(caseChangeEvent);
        } catch (e) {
            this.showToast('Ошибка', e.body?.message || 'Не удалось назначить кейс', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}