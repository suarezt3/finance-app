import { Component, inject, input, output, signal, computed, OnInit, DestroyRef, effect } from '@angular/core';
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

// NUEVOS IMPORTS REQUERIDOS PARA LA NUEVA UI
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';

import { CatalogService, Category, PaymentMethod } from '../../../core/services/catalog.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionWithDetails } from '../../../core/models/transaction.model';
import { NativeDeviceService } from '../../../core/services/native-device.service';
import { ReceiptScannerService, ScannedReceiptData } from '../../../core/services/receipt-scanner.service';

// NUEVO: Importamos la directiva que acabamos de crear
import { DecimalInputDirective } from '../../directives/decimal-input.directive';

@Component({
  selector: 'app-transaction-modal',
  standalone: true,
  imports: [
    NzRadioModule,
    NzGridModule,
    NzSpinModule,
    NzTagModule,
    ReactiveFormsModule, DecimalPipe, NzIconModule,
    NzModalModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzSelectModule, NzDatePickerModule, NzButtonModule,
    DecimalInputDirective
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
  readonly nativeDeviceService = inject(NativeDeviceService);
  private readonly receiptScannerService = inject(ReceiptScannerService);

  readonly isVisible = input.required<boolean>();
  readonly transactionToEdit = input<TransactionWithDetails | null>(null);
  readonly closeModal = output<void>();
  readonly transactionSaved = output<void>();

  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isSubmitting = signal<boolean>(false);
  readonly isLoadingCatalogs = signal<boolean>(false);

  // Estados de escaneo directo de comprobantes con Gemini AI
  readonly isCapturingImage = signal<boolean>(false);
  readonly isScanningReceipt = signal<boolean>(false);
  readonly scannedReceiptInfo = signal<ScannedReceiptData | null>(null);
  readonly scannedReceiptThumbnail = signal<string | null>(null);

  readonly availableBalance = signal<number | null>(null);
  readonly isCheckingBalance = signal<boolean>(false);

  constructor() {
    effect(() => {
      const visible = this.isVisible();
      if (visible) {
        // Al abrir el modal, si los catálogos aún no están en memoria, refrescar de inmediato
        if (this.categories().length === 0 || this.paymentMethods().length === 0) {
          this.loadCatalogs();
        }
      }
    });
  }

  // -- FORMULARIO REACTIVO --
  readonly transactionForm: FormGroup = this.fb.nonNullable.group({
    type: ['EXPENSE', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [new Date(), [Validators.required]],
    description: [''],
    category_id: [null],
    payment_method_id: [null, [Validators.required]],
    destination_method_id: [null]
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

  readonly availableDestinationMethods = computed(() => {
    const source = this.selectedSourceMethod();
    return this.paymentMethods().filter(m => m.id !== source);
  });

  // ==========================================
  // FORMATTERS PARA UX VISUAL
  // ==========================================

  readonly formatterAmount = (value: number | string): string => {
    if (value == null || value === '') return '';
    const parts = value.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  readonly parserAmount = (value: string): number => {
    const cleanString = value.replace(/,/g, '');
    const parsedNumber = parseFloat(cleanString);
    return isNaN(parsedNumber) ? 0 : parsedNumber;
  };

  // ==========================================
  // CICLO DE VIDA Y LÓGICA DE NEGOCIO
  // ==========================================

  async ngOnInit(): Promise<void> {
    await this.loadCatalogs();
    this.setupFormListeners();
  }

  public async loadCatalogs(force = false): Promise<void> {
    if (this.isLoadingCatalogs()) return;
    if (!force && this.categories().length > 0 && this.paymentMethods().length > 0) {
      return;
    }

    this.isLoadingCatalogs.set(true);
    try {
      const [cats, methods] = await Promise.all([
        this.catalogService.getCategories(),
        this.catalogService.getPaymentMethods()
      ]);
      this.categories.set(cats);
      this.paymentMethods.set(methods);
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      try {
        await new Promise(r => setTimeout(r, 600));
        const [cats, methods] = await Promise.all([
          this.catalogService.getCategories(),
          this.catalogService.getPaymentMethods()
        ]);
        this.categories.set(cats);
        this.paymentMethods.set(methods);
      } catch (retryErr) {
        console.error('Fallo definitivo al cargar catálogos:', retryErr);
      }
    } finally {
      this.isLoadingCatalogs.set(false);
    }
  }

  private setupFormListeners(): void {
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

  public async onCapturePhoto(): Promise<void> {
    if (this.isCapturingImage() || this.isScanningReceipt()) return;
    this.isCapturingImage.set(true);

    try {
      const captured = await this.nativeDeviceService.captureFromCamera();
      if (captured) {
        await this.processImageDirectly(captured);
      }
    } catch (err: any) {
      console.error('Error al capturar foto con cámara:', err);
      this.message.error('No se pudo acceder a la cámara.');
    } finally {
      this.isCapturingImage.set(false);
    }
  }

  public async onPickFile(): Promise<void> {
    if (this.isCapturingImage() || this.isScanningReceipt()) return;
    this.isCapturingImage.set(true);

    try {
      const captured = await this.nativeDeviceService.pickFromGallery();
      if (captured) {
        await this.processImageDirectly(captured);
      }
    } catch (err: any) {
      console.error('Error al seleccionar archivo de comprobante:', err);
      this.message.error('No se pudo cargar el archivo.');
    } finally {
      this.isCapturingImage.set(false);
    }
  }

  private async processImageDirectly(captured: { base64: string; mimeType: string; dataUrl: string }): Promise<void> {
    this.isScanningReceipt.set(true);
    this.scannedReceiptThumbnail.set(captured.dataUrl);
    await this.nativeDeviceService.triggerHaptic('light');

    try {
      const data = await this.receiptScannerService.scanReceipt(captured.base64, captured.mimeType);
      this.scannedReceiptInfo.set(data);

      // Auto-rellenar valores en el formulario reactivo
      const patchObj: Record<string, any> = {
        type: data.type || 'EXPENSE',
        amount: data.amount > 0 ? data.amount : this.transactionForm.value.amount,
        description: data.description || (data.merchant ? `Compra en ${data.merchant}` : ''),
      };

      if (data.date) {
        try {
          const parts = data.date.split('-');
          if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            patchObj['date'] = new Date(year, month, day);
          }
        } catch {
          // fecha actual por defecto
        }
      }

      // Auto-seleccionar categoría sugerida
      if (data.category_hint) {
        const matchedCatId = this.receiptScannerService.findBestMatchingCategory(
          data.category_hint,
          this.categories()
        );
        if (matchedCatId) {
          patchObj['category_id'] = matchedCatId;
        }
      }

      // Auto-seleccionar método de pago si fue detectado
      if (data.payment_method_hint && data.payment_method_hint !== 'Desconocido') {
        const hintLower = data.payment_method_hint.toLowerCase();
        const matchedMethod = this.paymentMethods().find(m => {
          const nameLower = m.name.toLowerCase();
          return nameLower.includes(hintLower) || hintLower.includes(nameLower);
        });
        if (matchedMethod) {
          patchObj['payment_method_id'] = matchedMethod.id;
        }
      }

      this.transactionForm.patchValue(patchObj);
      await this.nativeDeviceService.triggerHaptic('success');
      this.message.success(`Factura de "${data.merchant}" analizada con éxito`);
    } catch (err: any) {
      console.error('Error al escanear comprobante:', err);
      await this.nativeDeviceService.triggerHaptic('error');
      this.message.error(err?.message || 'No se pudo analizar la factura.');
    } finally {
      this.isScanningReceipt.set(false);
    }
  }

  public clearScannedReceipt(): void {
    this.scannedReceiptInfo.set(null);
    this.scannedReceiptThumbnail.set(null);
  }

  public resetForm(): void {
    this.transactionForm.reset({
      type: 'EXPENSE', amount: 0, date: new Date(), description: '', category_id: null, payment_method_id: null, destination_method_id: null
    });
    this.availableBalance.set(null);
    this.clearScannedReceipt();
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
