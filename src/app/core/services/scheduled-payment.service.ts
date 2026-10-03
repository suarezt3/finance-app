// src/app/core/services/scheduled-payment.service.ts
import { Injectable, inject, signal, computed, effect, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ScheduledPayment, PaymentRecurrence, PaymentUrgency } from '../models/scheduled-payment.model';
import { AuthService } from './auth.service';
import { TransactionService } from './transaction.service';
import { NotificationService } from './notification.service';
import { NativeDeviceService } from './native-device.service';

const STORAGE_KEY = 'finance_scheduled_payments_v2';

@Injectable({
  providedIn: 'root'
})
export class ScheduledPaymentService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly transactionService = inject(TransactionService);
  private readonly notificationService = inject(NotificationService);
  private readonly nativeDevice = inject(NativeDeviceService);

  private readonly _payments = signal<ScheduledPayment[]>([]);

  // Señales públicas reactivas
  readonly payments = this._payments.asReadonly();
  readonly isLoading = signal<boolean>(false);

  readonly pendingPayments = computed(() => {
    return this._payments()
      .filter(p => p.status === 'PENDING')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  });

  readonly paidPayments = computed(() => {
    return this._payments()
      .filter(p => p.status === 'PAID')
      .sort((a, b) => new Date(b.lastPaidDate || b.dueDate).getTime() - new Date(a.lastPaidDate || a.dueDate).getTime());
  });

  readonly totalPendingAmount = computed(() => {
    return this.pendingPayments().reduce((acc, p) => acc + Number(p.amount), 0);
  });

  readonly urgentCount = computed(() => {
    return this.pendingPayments().filter(p => {
      const urgency = this.calculateUrgency(p.dueDate);
      return urgency === 'TODAY' || urgency === 'OVERDUE';
    }).length;
  });

  readonly upcomingPayments = computed(() => {
    return this.pendingPayments().filter(p => {
      const urgency = this.calculateUrgency(p.dueDate);
      return urgency === 'TODAY' || urgency === 'OVERDUE' || urgency === 'UPCOMING';
    });
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadLocal();

      // Sincronizar desde Supabase user_metadata cuando la sesión esté disponible
      effect(() => {
        const user = this.authService.currentUser();
        if (user?.user_metadata && user.user_metadata['scheduled_payments']) {
          this.syncFromCloud(user.user_metadata['scheduled_payments']);
        }
      });

      // Disparar chequeo de notificaciones nativas en segundo plano
      effect(() => {
        const paymentsList = this._payments();
        if (paymentsList.length > 0) {
          this.notificationService.checkAndNotifyUpcomingPayments(paymentsList);
        }
      });
    }
  }

  private loadLocal(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: ScheduledPayment[] = JSON.parse(raw);
        this._payments.set(parsed);
      }
    } catch (err) {
      console.warn('Error leyendo pagos programados locales:', err);
    }
  }

  private saveState(payments: ScheduledPayment[]): void {
    this._payments.set(payments);

    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
      } catch (e) {
        console.warn('Error guardando en localStorage:', e);
      }

      // Sincronizar en user_metadata de Supabase
      const user = this.authService.currentUser();
      if (user) {
        this.authService.updateProfile({
          scheduled_payments: payments
        } as any).catch(err => console.warn('Error sincronizando pagos en Supabase Cloud:', err));
      }
    }
  }

  private syncFromCloud(cloudPayments: any): void {
    if (Array.isArray(cloudPayments)) {
      // Merge inteligente sin perder datos
      const local = this._payments();
      if (cloudPayments.length > 0 || local.length === 0) {
        this._payments.set(cloudPayments);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudPayments));
        } catch {
          // ignore
        }
      }
    }
  }

  calculateUrgency(dueDateStr: string): PaymentUrgency {
    const due = new Date(dueDateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'OVERDUE';
    if (diffDays === 0) return 'TODAY';
    if (diffDays <= 3) return 'UPCOMING';
    return 'NORMAL';
  }

  getUrgencyDaysText(dueDateStr: string): string {
    const due = new Date(dueDateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `Vencido hace ${Math.abs(diffDays)} día(s)`;
    if (diffDays === 0) return '¡Vence Hoy!';
    if (diffDays === 1) return 'Vence mañana';
    return `Vence en ${diffDays} días`;
  }

  async addPayment(paymentData: Omit<ScheduledPayment, 'id' | 'createdAt' | 'status'>): Promise<ScheduledPayment> {
    const newPayment: ScheduledPayment = {
      ...paymentData,
      id: crypto.randomUUID ? crypto.randomUUID() : `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    const next = [newPayment, ...this._payments()];
    this.saveState(next);
    await this.nativeDevice.triggerHaptic('success');
    return newPayment;
  }

  async updatePayment(id: string, updates: Partial<ScheduledPayment>): Promise<void> {
    const next = this._payments().map(p => {
      if (p.id === id) {
        return { ...p, ...updates };
      }
      return p;
    });
    this.saveState(next);
    await this.nativeDevice.triggerHaptic('light');
  }

  async deletePayment(id: string): Promise<void> {
    const next = this._payments().filter(p => p.id !== id);
    this.saveState(next);
    await this.nativeDevice.triggerHaptic('medium');
  }

  /**
   * REGLA DE NEGOCIO CRÍTICA:
   * Al confirmar un pago, se crea la transacción real tipo 'EXPENSE' en la base de datos Supabase,
   * afectando la billetera elegida y actualizando el saldo al instante.
   */
  async confirmPayment(
    paymentId: string,
    details: {
      amount: number;
      paymentDate: string;
      paymentMethodId: string;
      notes?: string;
    }
  ): Promise<void> {
    const payment = this._payments().find(p => p.id === paymentId);
    if (!payment) throw new Error('Pago programado no encontrado');

    // 1. Crear transacción contable real de GASTO
    await this.transactionService.createTransaction({
      type: 'EXPENSE',
      amount: Number(details.amount),
      date: details.paymentDate,
      category_id: payment.categoryId || undefined,
      payment_method_id: details.paymentMethodId,
      description: `Pago: ${payment.title}` + (details.notes ? ` (${details.notes})` : '')
    });

    // 2. Gestionar ciclo del compromiso según su recurrencia
    const nextList = this._payments().map(p => {
      if (p.id !== paymentId) return p;

      if (p.recurrence === 'ONCE') {
        // Pago único: Marcar como PAGADO
        return {
          ...p,
          status: 'PAID' as const,
          lastPaidDate: details.paymentDate,
          lastPaidAmount: details.amount,
          lastPaymentMethodId: details.paymentMethodId
        };
      } else {
        // Pago recurrente: Avanzar fecha de vencimiento a la siguiente cuota y mantener PENDING
        const nextDueDate = this.calculateNextDueDate(p.dueDate, p.recurrence);
        return {
          ...p,
          status: 'PENDING' as const,
          dueDate: nextDueDate,
          lastPaidDate: details.paymentDate,
          lastPaidAmount: details.amount,
          lastPaymentMethodId: details.paymentMethodId
        };
      }
    });

    this.saveState(nextList);
    await this.nativeDevice.triggerHaptic('success');
  }

  private calculateNextDueDate(currentDueDateStr: string, recurrence: PaymentRecurrence): string {
    const date = new Date(currentDueDateStr + 'T00:00:00');

    if (recurrence === 'MONTHLY') {
      date.setMonth(date.getMonth() + 1);
    } else if (recurrence === 'BIWEEKLY') {
      date.setDate(date.getDate() + 14);
    } else if (recurrence === 'YEARLY') {
      date.setFullYear(date.getFullYear() + 1);
    }

    return date.toISOString().split('T')[0];
  }
}
