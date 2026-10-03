// src/app/core/services/notification.service.ts
import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NativeDeviceService } from './native-device.service';
import { ScheduledPayment } from '../models/scheduled-payment.model';

const NOTIFICATIONS_LOG_KEY = 'finance_notifications_sent_log';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly nativeDeviceService = inject(NativeDeviceService);

  readonly permissionStatus = signal<NotificationPermission | 'unsupported'>('default');
  readonly isSupported = signal<boolean>(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      if ('Notification' in window) {
        this.isSupported.set(true);
        this.permissionStatus.set(Notification.permission);
      } else {
        this.permissionStatus.set('unsupported');
      }
    }
  }

  /**
   * Solicita permiso al usuario para enviar notificaciones en su navegador o celular.
   */
  async requestPermission(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId) || !('Notification' in window)) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionStatus.set(permission);
      if (permission === 'granted') {
        this.nativeDeviceService.triggerHaptic('success');
        this.sendNotification(
          '🔔 Notificaciones Activadas en FinanceApp',
          'Te avisaremos con anticipación cuando se aproxime el vencimiento de tus facturas y servicios.'
        );
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Error solicitando permisos de notificación:', err);
      return false;
    }
  }

  /**
   * Envía una notificación nativa inmediata con vibración háptica.
   */
  sendNotification(title: string, body: string, data?: any): boolean {
    if (!isPlatformBrowser(this.platformId) || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'finance-reminder',
          data
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };

        this.nativeDeviceService.triggerHaptic('warning');
        return true;
      } catch (err) {
        console.warn('Error al disparar notificación nativa:', err);
        return false;
      }
    }

    return false;
  }

  /**
   * Examina los pagos pendientes y envía recordatorios al celular si están dentro del umbral de anticipación.
   * Evita duplicados enviando máximo una alerta diaria por factura.
   */
  checkAndNotifyUpcomingPayments(payments: ScheduledPayment[]): void {
    if (!isPlatformBrowser(this.platformId) || Notification.permission !== 'granted') {
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const log = this.getSentLog();

    const pending = payments.filter(p => p.status === 'PENDING');

    pending.forEach(payment => {
      const due = new Date(payment.dueDate + 'T00:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const diffTime = due.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const logKey = `${payment.id}_${todayStr}`;
      if (log[logKey]) {
        // Ya se notificó hoy para este pago
        return;
      }

      if (diffDays === 0) {
        // VENCE HOY
        this.sendNotification(
          `⚠️ Vence Hoy: ${payment.title}`,
          `Recuerda pagar $${payment.amount.toLocaleString('es-CO')} antes de que finalice el día para evitar recargos.`
        );
        log[logKey] = true;
      } else if (diffDays > 0 && diffDays <= (payment.reminderDaysBefore || 2)) {
        // SE APROXIMA EN 1 O 2 DÍAS
        const plural = diffDays === 1 ? 'mañana' : `en ${diffDays} días`;
        this.sendNotification(
          `🔔 Próximo Pago: ${payment.title}`,
          `Tu compromiso de $${payment.amount.toLocaleString('es-CO')} vence ${plural}. Puedes pagar por PSE o tu banco.`
        );
        log[logKey] = true;
      } else if (diffDays < 0) {
        // VENCIDO
        const overdueDays = Math.abs(diffDays);
        this.sendNotification(
          `🚨 Pago Vencido: ${payment.title}`,
          `Esta factura venció hace ${overdueDays} día(s). Recuerda ponerte al día y registrar el comprobante.`
        );
        log[logKey] = true;
      }
    });

    this.saveSentLog(log);
  }

  private getSentLog(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_LOG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveSentLog(log: Record<string, boolean>): void {
    try {
      localStorage.setItem(NOTIFICATIONS_LOG_KEY, JSON.stringify(log));
    } catch {
      // Ignorar fallos de cuota
    }
  }
}
