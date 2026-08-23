// src/app/shared/components/transaction-modal/transaction-modal.component.ts
import { Component, inject, input, output, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzIconModule } from 'ng-zorro-antd/icon';

import { CatalogService, Category, PaymentMethod } from '../../../core/services/catalog.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionWithDetails } from '../../../core/models/transaction.model';

@Component({
  selector: 'app-transaction-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule, DecimalPipe, NzIconModule,
    NzModalModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzSelectModule, NzDatePickerModule, NzButtonModule
  ],
  templateUrl: './transaction-modal.component.html',
  styleUrl: './transaction-modal.component.scss'
})
export class TransactionModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly transactionService = inject(TransactionService);
  private readonly message = inject(NzMessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isVisible = input.required<boolean>();
  readonly transactionToEdit = input<TransactionWithDetails | null>(null);
  readonly closeModal = output<void>();
  readonly transactionSaved = output<void>();

  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isSubmitting = signal<boolean>(false);

  readonly availableBalance = signal<number | null>(null);
  readonly isCheckingBalance = signal<boolean>(false);

  // -- FORMULARIO REACTIVO (Añadido destination_method_id) --
  readonly transactionForm: FormGroup = this.fb.nonNullable.group({
    type: ['EXPENSE', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [new Date(), [Validators.required]],
    description: [''],
    category_id: [null],
    payment_method_id: [null, [Validators.required]],
    destination_method_id: [null] // Para transferencias
  });

  // -- SEÑALES REACTIVAS DE FORMULARIO --
  readonly selectedType = toSignal(
    this.transactionForm.controls['type'].valueChanges,
    { initialValue: this.transactionForm.controls['type'].value }
  );

  readonly selectedSourceMethod = toSignal(
    this.transactionForm.controls['payment_method_id'].valueChanges,
    { initialValue: this.transactionForm.controls['payment_method_id'].value }
  );

  readonly filteredCategories = computed(() => {
    const currentType = this.selectedType();
    return this.categories().filter(c => c.type === currentType);
  });

  // Evita que el usuario seleccione la misma cuenta de origen como destino
  readonly availableDestinationMethods = computed(() => {
    const source = this.selectedSourceMethod();
    return this.paymentMethods().filter(m => m.id !== source);
  });

  async ngOnInit(): Promise<void> {
    await this.loadCatalogs();
    this.setupFormListeners();
  }

  private async loadCatalogs(): Promise<void> {
    try {
      const [cats, methods] = await Promise.all([
        this.catalogService.getCategories(),
        this.catalogService.getPaymentMethods()
      ]);
      this.categories.set(cats);
      this.paymentMethods.set(methods);
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
    }
  }

  private setupFormListeners(): void {
    // 1. Mutación dinámica del formulario según el Tipo
    this.transactionForm.controls['type'].valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        if (this.isVisible()) {
          const destControl = this.transactionForm.controls['destination_method_id'];
          const catControl = this.transactionForm.controls['category_id'];

          catControl.setValue(null);
          destControl.setValue(null);

          if (type === 'TRANSFER') {
            destControl.setValidators([Validators.required]);
          } else {
            destControl.clearValidators();
          }
          destControl.updateValueAndValidity();
        }
      });

    // 2. Protección contra Sobregiro (Aplicable a Gasto y Transferencia)
    combineLatest([
      this.transactionForm.controls['type'].valueChanges.pipe(startWith(this.transactionForm.value.type)),
      this.transactionForm.controls['payment_method_id'].valueChanges.pipe(startWith(this.transactionForm.value.payment_method_id))
    ])
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(async ([type, methodId]) => {
      const amountControl = this.transactionForm.controls['amount'];

      if ((type === 'EXPENSE' || type === 'TRANSFER') && methodId && this.isVisible()) {
        this.isCheckingBalance.set(true);
        try {
          let balance = await this.transactionService.getBalanceByPaymentMethod(methodId);

          const editTarget = this.transactionToEdit();
          if (editTarget && editTarget.type === 'EXPENSE' && editTarget.payment_method_id === methodId) {
            balance += Number(editTarget.amount);
          }

          this.availableBalance.set(balance);
          amountControl.setValidators([Validators.required, Validators.min(0.01), Validators.max(balance)]);
        } catch (error) {
          console.error('Error validando fondos:', error);
        } finally {
          this.isCheckingBalance.set(false);
          amountControl.updateValueAndValidity({ emitEvent: false });
        }
      } else {
        this.availableBalance.set(null);
        amountControl.setValidators([Validators.required, Validators.min(0.01)]);
        amountControl.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  public openForEdit(tx: TransactionWithDetails): void {
    this.transactionForm.patchValue({
      type: tx.type,
      amount: Number(tx.amount),
      date: new Date(tx.date),
      description: tx.description || '',
      category_id: tx.category_id || null,
      payment_method_id: tx.payment_method_id || null
    });
  }

  public resetForm(): void {
    this.transactionForm.reset({
      type: 'EXPENSE', amount: 0, date: new Date(), description: '', category_id: null, payment_method_id: null, destination_method_id: null
    });
    this.availableBalance.set(null);
  }

  onCancel(): void {
    this.closeModal.emit();
    this.resetForm();
  }

  async onSubmit(): Promise<void> {
    if (this.transactionForm.valid) {
      this.isSubmitting.set(true);
      try {
        const rawValues = this.transactionForm.getRawValue();
        const formattedDate = (rawValues.date as Date).toISOString().split('T')[0];

        // LOGICA DE NEGOCIO: Enrutamiento según el tipo
        if (rawValues.type === 'TRANSFER') {
          await this.transactionService.createTransfer({
            amount: rawValues.amount,
            date: formattedDate,
            description: rawValues.description,
            source_method_id: rawValues.payment_method_id,
            destination_method_id: rawValues.destination_method_id
          });
          this.message.success('Transferencia ejecutada exitosamente');
        } else {
          const formattedData = {
            type: rawValues.type,
            amount: rawValues.amount,
            date: formattedDate,
            description: rawValues.description,
            category_id: rawValues.category_id,
            payment_method_id: rawValues.payment_method_id
          };

          const editTarget = this.transactionToEdit();
          if (editTarget) {
            await this.transactionService.updateTransaction(editTarget.id, formattedData);
            this.message.success('Transacción actualizada exitosamente');
          } else {
            await this.transactionService.createTransaction(formattedData);
            this.message.success('Transacción registrada exitosamente');
          }
        }

        this.closeModal.emit();
        this.resetForm();
        this.transactionSaved.emit();

      } catch (error) {
        console.error('Error al guardar:', error);
        this.message.error('Ocurrió un error al procesar la operación');
      } finally {
        this.isSubmitting.set(false);
      }
    } else {
      Object.values(this.transactionForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }
}
