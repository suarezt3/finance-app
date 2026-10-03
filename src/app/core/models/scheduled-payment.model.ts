// src/app/core/models/scheduled-payment.model.ts

export type PaymentRecurrence = 'ONCE' | 'MONTHLY' | 'BIWEEKLY' | 'YEARLY';
export type PaymentStatus = 'PENDING' | 'PAID';
export type PaymentUrgency = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NORMAL' | 'PAID';

export interface ScheduledPayment {
  id: string;
  title: string;
  amount: number;
  dueDate: string; // Formato YYYY-MM-DD
  categoryId?: string | null;
  categoryName?: string;
  paymentUrl?: string | null; // URL de pago oficial o PSE
  reminderDaysBefore: number; // Ej. 1, 2, 3 o 5 días antes
  recurrence: PaymentRecurrence;
  status: PaymentStatus;
  lastPaidDate?: string | null;
  lastPaidAmount?: number | null;
  lastPaymentMethodId?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface QuickPayPortal {
  id: string;
  name: string;
  icon: string;
  color: string;
  url: string;
  description: string;
}

export const COMMON_PAYMENT_PORTALS: QuickPayPortal[] = [
  {
    id: 'pse',
    name: 'PSE Colombia',
    icon: 'bank',
    color: '#0284c7',
    url: 'https://www.pse.com.co/persona-paga-aqui',
    description: 'Portal oficial de pagos seguros en línea'
  },
  {
    id: 'nequi',
    name: 'Nequi / Pagos',
    icon: 'mobile',
    color: '#ec4899',
    url: 'https://recarga.nequi.com.co/',
    description: 'Paga con Nequi o recarga para pagar servicios'
  },
  {
    id: 'bancolombia',
    name: 'Sucursal Bancolombia',
    icon: 'credit-card',
    color: '#eab308',
    url: 'https://sucursalpersonas.transaccionesbancolombia.com/',
    description: 'Pago de facturas y convenios registrados'
  },
  {
    id: 'daviplata',
    name: 'DaviPlata',
    icon: 'wallet',
    color: '#ef4444',
    url: 'https://www.daviplata.com/',
    description: 'Pago de servicios públicos y privados'
  }
];
