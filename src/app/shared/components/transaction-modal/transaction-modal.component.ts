// src/app/shared/components/transaction-modal/transaction-modal.component.ts
import { Component, inject, input, output, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { DecimalPipe } from '@angular/common'; // <-- FIX 1: Importamos el DecimalPipe
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
import { NzIconModule } from 'ng-zorro-antd/icon'; // <-- FIX 2: Importamos el módulo de íconos de NG-Zorro

import { CatalogService, Category, PaymentMethod } from '../../../core/services/catalog.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionWithDetails } from '../../../core/models/transaction.model';

@Component({
  selector: 'app-transaction-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DecimalPipe, // <-- REGISTRAMOS EL PIPE AQUÍ
    NzIconModule, // <-- REGISTRAMOS EL MÓDULO DE ÍCONOS AQUÍ
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

  // -- INPUTS Y OUTPUTS --
  readonly isVisible = input.required<boolean>();
  readonly transactionToEdit = input<TransactionWithDetails | null>(null);
  readonly closeModal = output<void>();
  readonly transactionSaved = output<void>();

  // -- ESTADOS BASE Y CATÁLOGOS --
  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isSubmitting = signal<boolean>(false);

  // <-- NUEVO: ESTADOS PARA LA VALIDACIÓN DE FONDOS -->
  readonly availableBalance = signal<number | null>(null);
  readonly isCheckingBalance = signal<boolean>(false);

  // -- FORMULARIO REACTIVO --
  readonly transactionForm: FormGroup = this.fb.nonNullable.group({
    type: ['EXPENSE', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [new Date(), [Validators.required]],
    description: [''],
    category_id: [null],
    payment_method_id: [null, [Validators.required]] // <-- Aseguramos que siempre haya método
  });

  // -- FILTRADO REACTIVO DE CATEGORÍAS --
  readonly selectedType = toSignal(
    this.transactionForm.controls['type'].valueChanges,
    { initialValue: this.transactionForm.controls['type'].value }
  );

  readonly filteredCategories = computed(() => {
    const currentType = this.selectedType();
    return this.categories().filter(c => c.type === currentType);
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

  /**
   * Configura los listeners del formulario para la Validación Cruzada
   */
  private setupFormListeners(): void {
    // 1. Limpieza de categoría al cambiar de tipo (Ingreso/Gasto)
    this.transactionForm.controls['type'].valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isVisible()) {
          this.transactionForm.controls['category_id'].setValue(null);
        }
      });

    // 2. NUEVO: Prevención de Sobregiro (Overdraft Protection)
    combineLatest([
      this.transactionForm.controls['type'].valueChanges.pipe(startWith(this.transactionForm.value.type)),
      this.transactionForm.controls['payment_method_id'].valueChanges.pipe(startWith(this.transactionForm.value.payment_method_id))
    ])
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(async ([type, methodId]) => {

      const amountControl = this.transactionForm.controls['amount'];

      // Solo evaluamos el saldo si es un GASTO y hay una BILLETERA seleccionada
      if (type === 'EXPENSE' && methodId && this.isVisible()) {
        this.isCheckingBalance.set(true);

        try {
          let balance = await this.transactionService.getBalanceByPaymentMethod(methodId);

          // CASO ESPECIAL: Modo Edición.
          // Si edita el mismo gasto, debemos sumarle el monto actual al saldo para que la validación sea justa
          const editTarget = this.transactionToEdit();
          if (editTarget && editTarget.type === 'EXPENSE' && editTarget.payment_method_id === methodId) {
            balance += Number(editTarget.amount);
          }

          this.availableBalance.set(balance);

          // INYECTAMOS EL VALIDADOR DINÁMICO
          amountControl.setValidators([Validators.required, Validators.min(0.01), Validators.max(balance)]);

        } catch (error) {
          console.error('Error validando fondos:', error);
        } finally {
          this.isCheckingBalance.set(false);
          amountControl.updateValueAndValidity({ emitEvent: false }); // Forzamos la re-evaluación del campo
        }
      } else {
        // Si es INGRESO o no hay método, liberamos la restricción
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
      type: 'EXPENSE', amount: 0, date: new Date(), description: '', category_id: null, payment_method_id: null
    });
    this.availableBalance.set(null); // Limpiamos el saldo en pantalla
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
        const formattedData = {
          ...rawValues,
          date: (rawValues.date as Date).toISOString().split('T')[0]
        };

        const editTarget = this.transactionToEdit();

        if (editTarget) {
          await this.transactionService.updateTransaction(editTarget.id, formattedData);
          this.message.success('Transacción actualizada exitosamente');
        } else {
          await this.transactionService.createTransaction(formattedData);
          this.message.success('Transacción registrada exitosamente');
        }

        this.closeModal.emit();
        this.resetForm();
        this.transactionSaved.emit();

      } catch (error) {
        console.error('Error al guardar transacción:', error);
        this.message.error('Ocurrió un error al procesar la transacción');
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
