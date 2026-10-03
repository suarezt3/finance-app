// src/app/features/dashboard/scheduled-payments/scheduled-payments.component.ts
import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { NzCardModule } from 'ng-zorro-antd/card';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzAlertModule } from 'ng-zorro-antd/alert';

import { ScheduledPaymentService } from '../../../core/services/scheduled-payment.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CatalogService, Category, PaymentMethod } from '../../../core/services/catalog.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { ScheduledPayment } from '../../../core/models/scheduled-payment.model';
import { DecimalInputDirective } from '../../../shared/directives/decimal-input.directive';
import { ConfirmPaymentModalComponent } from './confirm-payment-modal/confirm-payment-modal.component';

@Component({
  selector: 'app-scheduled-payments',
  standalone: true,
  imports: [
    ReactiveFormsModule, DatePipe, DecimalPipe,
    NzCardModule, NzGridModule, NzButtonModule, NzIconModule, NzTagModule,
    NzModalModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzDatePickerModule, NzSelectModule, NzDropdownModule, NzTooltipModule, NzAlertModule,
    DecimalInputDirective, ConfirmPaymentModalComponent
  ],
  templateUrl: './scheduled-payments.component.html',
  styleUrl: './scheduled-payments.component.scss'
})
export class ScheduledPaymentsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly modalService = inject(NzModalService);
  private readonly message = inject(NzMessageService);
  private readonly catalogService = inject(CatalogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly paymentService = inject(ScheduledPaymentService);
  readonly notificationService = inject(NotificationService);
  readonly userPreferences = inject(UserPreferencesService);

  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);

  // Filtro de pestañas
  readonly activeFilter = signal<'ALL' | 'UPCOMING' | 'PENDING' | 'PAID'>('ALL');

  // Formatters para separador de miles con puntos (.) acorde a pesos colombianos
  readonly formatterCurrency = (value: number | string): string => {
    if (value == null || value === '') return '';
    const parts = value.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts.join(',');
  };

  readonly parserCurrency = (value: string): number => {
    const cleanString = value.replace(/\./g, '').replace(',', '.');
    const parsedNumber = parseFloat(cleanString);
    return isNaN(parsedNumber) ? 0 : parsedNumber;
  };

  // Estados de modales
  readonly isCreateModalVisible = signal<boolean>(false);
  readonly isSavingPayment = signal<boolean>(false);
  readonly editingPayment = signal<ScheduledPayment | null>(null);

  readonly isConfirmModalVisible = signal<boolean>(false);
  readonly paymentToConfirm = signal<ScheduledPayment | null>(null);

  // Formulario de Creación / Edición
  readonly paymentForm: FormGroup = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    dueDate: [new Date(), [Validators.required]],
    categoryId: [null],
    paymentUrl: [''],
    reminderDaysBefore: [2, [Validators.required]],
    recurrence: ['MONTHLY', [Validators.required]],
    notes: ['']
  });

  // Lista filtrada
  readonly filteredPayments = computed(() => {
    const list = this.paymentService.payments();
    const filter = this.activeFilter();

    switch (filter) {
      case 'UPCOMING':
        return list.filter(p => {
          if (p.status !== 'PENDING') return false;
          const u = this.paymentService.calculateUrgency(p.dueDate);
          return u === 'TODAY' || u === 'OVERDUE' || u === 'UPCOMING';
        }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      case 'PENDING':
        return list.filter(p => p.status === 'PENDING')
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      case 'PAID':
        return list.filter(p => p.status === 'PAID')
          .sort((a, b) => new Date(b.lastPaidDate || b.dueDate).getTime() - new Date(a.lastPaidDate || a.dueDate).getTime());

      case 'ALL':
      default:
        return [...list].sort((a, b) => {
          if (a.status === 'PENDING' && b.status === 'PAID') return -1;
          if (a.status === 'PAID' && b.status === 'PENDING') return 1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
    }
  });

  async ngOnInit(): Promise<void> {
    try {
      const [cats, methods] = await Promise.all([
        this.catalogService.getCategories(),
        this.catalogService.getPaymentMethods()
      ]);
      this.categories.set(cats);
      this.paymentMethods.set(methods);
    } catch (e) {
      console.warn('Error cargando catálogos en ScheduledPayments:', e);
    }
  }

  async onRequestNotificationPermission(): Promise<void> {
    const granted = await this.notificationService.requestPermission();
    if (granted) {
      this.message.success('¡Notificaciones nativas activadas con éxito! Te avisaremos al celular.');
      this.paymentService.payments(); // disparar chequeo
    } else {
      this.message.warning('No se concedieron permisos de notificación en este navegador.');
    }
  }

  // ==========================================
  // APERTURA DE MODALES
  // ==========================================

  openCreateModal(paymentToEdit?: ScheduledPayment): void {
    if (paymentToEdit) {
      this.editingPayment.set(paymentToEdit);
      this.paymentForm.patchValue({
        title: paymentToEdit.title,
        amount: paymentToEdit.amount,
        dueDate: new Date(paymentToEdit.dueDate + 'T00:00:00'),
        categoryId: paymentToEdit.categoryId || null,
        paymentUrl: paymentToEdit.paymentUrl || '',
        reminderDaysBefore: paymentToEdit.reminderDaysBefore || 2,
        recurrence: paymentToEdit.recurrence || 'MONTHLY',
        notes: paymentToEdit.notes || ''
      });
    } else {
      this.editingPayment.set(null);
      this.paymentForm.reset({
        title: '',
        amount: 0,
        dueDate: new Date(),
        categoryId: this.categories()[0]?.id || null,
        paymentUrl: '',
        reminderDaysBefore: 2,
        recurrence: 'MONTHLY',
        notes: ''
      });
    }
    this.isCreateModalVisible.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalVisible.set(false);
    this.editingPayment.set(null);
  }

  async onSavePayment(): Promise<void> {
    if (this.paymentForm.invalid) {
      Object.values(this.paymentForm.controls).forEach(c => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }

    this.isSavingPayment.set(true);
    try {
      const val = this.paymentForm.getRawValue();
      const dateObj = new Date(val.dueDate);
      const dueDateStr = dateObj.toISOString().split('T')[0];

      const selectedCat = this.categories().find(c => c.id === val.categoryId);

      const payload = {
        title: val.title.trim(),
        amount: Number(val.amount),
        dueDate: dueDateStr,
        categoryId: val.categoryId || null,
        categoryName: selectedCat ? selectedCat.name : undefined,
        paymentUrl: val.paymentUrl ? val.paymentUrl.trim() : null,
        reminderDaysBefore: Number(val.reminderDaysBefore),
        recurrence: val.recurrence,
        notes: val.notes ? val.notes.trim() : null
      };

      const editing = this.editingPayment();
      if (editing) {
        await this.paymentService.updatePayment(editing.id, payload);
        this.message.success('Pago programado actualizado exitosamente.');
      } else {
        await this.paymentService.addPayment(payload);
        this.message.success('Pago programado registrado. Se activaron los recordatorios.');
      }

      this.closeCreateModal();
    } catch (err: unknown) {
      this.message.error('Error al guardar el pago programado.');
    } finally {
      this.isSavingPayment.set(false);
    }
  }

  onDeletePayment(payment: ScheduledPayment): void {
    this.modalService.confirm({
      nzTitle: `¿Eliminar "${payment.title}"?`,
      nzContent: 'Ya no recibirás recordatorios para este pago programado.',
      nzOkText: 'Sí, eliminar',
      nzOkDanger: true,
      nzCancelText: 'Cancelar',
      nzOnOk: async () => {
        await this.paymentService.deletePayment(payment.id);
        this.message.success('Pago programado eliminado.');
      }
    });
  }

  // ==========================================
  // FLUJO DE "IR A PAGAR" (PASARELA / ENLACE DIRECTO)
  // ==========================================

  openPaymentPortal(payment: ScheduledPayment): void {
    if (payment.paymentUrl) {
      let target = payment.paymentUrl;
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = 'https://' + target;
      }
      window.open(target, '_blank', 'noopener,noreferrer');
      this.message.info(`Abriendo portal oficial de pago para ${payment.title}.`);
    }
  }

  // ==========================================
  // FLUJO DE VALIDACIÓN AL PAGAR (CHECK)
  // ==========================================

  openConfirmPaymentModal(payment: ScheduledPayment): void {
    this.paymentToConfirm.set(payment);
    this.isConfirmModalVisible.set(true);
  }

  closeConfirmModal(): void {
    this.isConfirmModalVisible.set(false);
    this.paymentToConfirm.set(null);
  }

  async onPaymentConfirmed(details: { amount: number; paymentDate: string; paymentMethodId: string }): Promise<void> {
    const payment = this.paymentToConfirm();
    if (!payment) return;

    try {
      await this.paymentService.confirmPayment(payment.id, details);
      this.message.success(`¡Pago de "${payment.title}" confirmado! Se registró el gasto y se actualizó tu saldo.`);
      this.closeConfirmModal();
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.message.error(err.message || 'Error al procesar el pago.');
      } else {
        this.message.error('Error desconocido al confirmar el pago.');
      }
    }
  }
}
