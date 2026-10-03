// src/app/features/dashboard/scheduled-payments/confirm-payment-modal/confirm-payment-modal.component.ts
import { Component, input, output, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';

import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAlertModule } from 'ng-zorro-antd/alert';

import { ScheduledPayment } from '../../../../core/models/scheduled-payment.model';
import { PaymentMethod } from '../../../../core/services/catalog.service';
import { UserPreferencesService } from '../../../../core/services/user-preferences.service';
import { DecimalInputDirective } from '../../../../shared/directives/decimal-input.directive';

@Component({
  selector: 'app-confirm-payment-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule, DatePipe,
    NzModalModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzDatePickerModule, NzSelectModule, NzButtonModule, NzIconModule, NzAlertModule,
    DecimalInputDirective
  ],
  templateUrl: './confirm-payment-modal.component.html',
  styleUrl: './confirm-payment-modal.component.scss'
})
export class ConfirmPaymentModalComponent {
  private readonly fb = inject(FormBuilder);
  readonly userPreferences = inject(UserPreferencesService);

  readonly isVisible = input.required<boolean>();
  readonly payment = input<ScheduledPayment | null>(null);
  readonly paymentMethods = input<PaymentMethod[]>([]);
  readonly isSubmitting = signal<boolean>(false);

  readonly close = output<void>();
  readonly confirmed = output<{ amount: number; paymentDate: string; paymentMethodId: string }>();

  readonly confirmForm: FormGroup = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentDate: [new Date(), [Validators.required]],
    paymentMethodId: ['', [Validators.required]]
  });

  constructor() {
    effect(() => {
      const p = this.payment();
      const visible = this.isVisible();
      if (visible && p) {
        this.confirmForm.patchValue({
          amount: p.amount,
          paymentDate: new Date(),
          paymentMethodId: this.paymentMethods()[0]?.id || ''
        });
      }
    });
  }

  onCancel(): void {
    this.close.emit();
  }

  onSubmit(): void {
    if (this.confirmForm.invalid) {
      Object.values(this.confirmForm.controls).forEach(c => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }

    const val = this.confirmForm.getRawValue();
    const dateObj = new Date(val.paymentDate);
    const dateStr = dateObj.toISOString().split('T')[0];

    this.confirmed.emit({
      amount: Number(val.amount),
      paymentDate: dateStr,
      paymentMethodId: val.paymentMethodId
    });
  }
}
