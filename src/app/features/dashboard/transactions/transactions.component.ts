// src/app/features/dashboard/transactions/transactions.component.ts
import { Component, inject, signal, computed, OnInit, viewChild, DestroyRef } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzCardModule } from 'ng-zorro-antd/card';

import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionWithDetails } from '../../../core/models/transaction.model';
import { CatalogService, PaymentMethod } from '../../../core/services/catalog.service';
import { ExportService } from '../../../core/services/export.service';

import { TransactionModalComponent } from '../../../shared/components/transaction-modal/transaction-modal.component';

export interface TransactionView extends TransactionWithDetails {
  isTransfer: boolean;
  isMergedTransfer?: boolean;
  linkedTransferId?: string;
  sourceMethodName?: string;
  destinationMethodName?: string;
  destinationMethodId?: string;
  displayCategory?: string;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    ReactiveFormsModule, DatePipe, DecimalPipe,
    NzTableModule, NzTagModule, NzButtonModule, NzIconModule,
    NzInputModule, NzDatePickerModule, NzSelectModule, NzGridModule,
    NzStatisticModule, NzCardModule,
    NzModalModule,
    TransactionModalComponent
  ],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.scss'
})
export class TransactionsComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly catalogService = inject(CatalogService);
  private readonly message = inject(NzMessageService);
  private readonly modalService = inject(NzModalService);
  private readonly fb = inject(FormBuilder);
  private readonly exportService = inject(ExportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly transactionModal = viewChild(TransactionModalComponent);

  readonly transactions = signal<TransactionWithDetails[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isLoading = signal<boolean>(true);

  readonly isModalVisible = signal<boolean>(false);
  readonly currentTxToEdit = signal<TransactionWithDetails | null>(null);

  readonly filterForm: FormGroup = this.fb.group({
    searchTerm: [''],
    dateRange: [[]],
    type: [null],
    paymentMethodId: [null]
  });

  private readonly filters = toSignal(this.filterForm.valueChanges, { initialValue: this.filterForm.value });

  // ==========================================
  // LÓGICA DE DOMINIO: Cashflow vs Ledger
  // ==========================================

  readonly enrichedTransactions = computed<TransactionView[]>(() => {
    const raw = this.transactions();
    const processed: TransactionView[] = [];
    const transferPairs = new Map<string, { expense?: TransactionWithDetails, income?: TransactionWithDetails }>();

    raw.forEach(tx => {
      const isTransfer = !tx.category_id && !!tx.description?.toLowerCase().includes('transferencia');

      if (!isTransfer) {
        processed.push({
          ...tx,
          isTransfer: false,
          displayCategory: tx.categories?.name || '---'
        });
      } else {
        const matchKey = `${tx.date}_${tx.amount}`;
        if (!transferPairs.has(matchKey)) {
          transferPairs.set(matchKey, {});
        }

        const pair = transferPairs.get(matchKey)!;
        if (tx.type === 'EXPENSE') pair.expense = tx;
        if (tx.type === 'INCOME') pair.income = tx;
      }
    });

    transferPairs.forEach(pair => {
      if (pair.expense && pair.income) {
        processed.push({
          ...pair.expense,
          isTransfer: true,
          isMergedTransfer: true,
          linkedTransferId: pair.income.id,
          sourceMethodName: pair.expense.payment_methods?.name || '---',
          destinationMethodName: pair.income.payment_methods?.name || '---',
          destinationMethodId: pair.income.payment_method_id,
          displayCategory: 'Transferencia Interna'
        });
      } else {
        const orphan = pair.expense || pair.income;
        if (orphan) {
          processed.push({ ...orphan, isTransfer: true, displayCategory: 'Transferencia (Anómala)' });
        }
      }
    });

    return processed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  readonly filteredTransactions = computed(() => {
    const txs = this.enrichedTransactions();
    const currentFilters = this.filters();

    return txs.filter(tx => {
      const term = currentFilters.searchTerm?.toLowerCase() || '';
      const matchesSearch = term === '' ||
                            tx.description?.toLowerCase().includes(term) ||
                            (tx.displayCategory?.toLowerCase().includes(term) ?? false);

      const matchesType = !currentFilters.type || tx.type === currentFilters.type;

      const matchesMethod = !currentFilters.paymentMethodId ||
                            tx.payment_method_id === currentFilters.paymentMethodId ||
                            tx.destinationMethodId === currentFilters.paymentMethodId;

      let matchesDate = true;
      if (currentFilters.dateRange && currentFilters.dateRange.length === 2) {
        const txDate = new Date(tx.date).getTime();
        const startDate = new Date(currentFilters.dateRange[0]).setHours(0, 0, 0, 0);
        const endDate = new Date(currentFilters.dateRange[1]).setHours(23, 59, 59, 999);
        matchesDate = txDate >= startDate && txDate <= endDate;
      }

      return matchesSearch && matchesType && matchesMethod && matchesDate;
    });
  });

  /**
   * REFACTORIZADO: Cálculo inteligente de Saldo Filtrado
   */
  readonly filteredSummary = computed(() => {
    const txs = this.filteredTransactions();
    const selectedMethodId = this.filters().paymentMethodId;

    let totalIncome = 0;
    let totalExpenses = 0;
    let transferImpact = 0; // Rastreará el impacto neto de las transferencias en la cuenta filtrada

    txs.forEach(t => {
      if (!t.isTransfer) {
        if (t.type === 'INCOME') totalIncome += Number(t.amount);
        if (t.type === 'EXPENSE') totalExpenses += Number(t.amount);
      } else if (t.isMergedTransfer && selectedMethodId) {
        // Lógica de "Account Ledger": Si estamos viendo una cuenta específica,
        // las transferencias sí afectan su saldo disponible.
        if (t.payment_method_id === selectedMethodId) {
          // El dinero salió de esta cuenta
          transferImpact -= Number(t.amount);
        } else if (t.destinationMethodId === selectedMethodId) {
          // El dinero entró a esta cuenta
          transferImpact += Number(t.amount);
        }
      }
    });

    return {
      // El saldo ahora suma los ingresos/gastos puros MÁS el impacto de las transferencias
      totalBalance: (totalIncome - totalExpenses) + transferImpact,
      totalIncome,
      totalExpenses
    };
  });

  readonly absoluteBalance = computed(() => {
    const txs = this.enrichedTransactions();
    let totalIncome = 0;
    let totalExpenses = 0;

    txs.forEach(t => {
      if (!t.isTransfer) {
        if (t.type === 'INCOME') totalIncome += Number(t.amount);
        if (t.type === 'EXPENSE') totalExpenses += Number(t.amount);
      }
    });
    return totalIncome - totalExpenses;
  });

  // ==========================================
  // CICLO DE VIDA Y ORQUESTACIÓN
  // ==========================================

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadTransactions(),
      this.loadCatalogs()
    ]);

    this.transactionService.transactionsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadTransactions();
      });
  }

  public async loadTransactions(): Promise<void> {
    this.isLoading.set(true);
    try {
      const data = await this.transactionService.getTransactions();
      this.transactions.set(data);
    } catch (error) {
      console.error('Error cargando el libro mayor:', error);
      this.message.error('Error al cargar el historial de transacciones');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadCatalogs(): Promise<void> {
    try {
      const methods = await this.catalogService.getPaymentMethods();
      this.paymentMethods.set(methods);
    } catch (error) {
      console.error('Error al cargar métodos de pago:', error);
    }
  }

  clearFilters(): void {
    this.filterForm.reset({ searchTerm: '', dateRange: [], type: null, paymentMethodId: null });
  }

  openNewModal(): void {
    this.currentTxToEdit.set(null);
    this.isModalVisible.set(true);
  }

  openEditModal(tx: TransactionView): void {
    this.currentTxToEdit.set(tx);
    this.isModalVisible.set(true);
    this.transactionModal()?.openForEdit(tx);
  }

  closeModal(): void {
    this.isModalVisible.set(false);
    this.currentTxToEdit.set(null);
  }

  onTransactionSaved(): void {
    this.loadTransactions();
  }

  onDelete(tx: TransactionView): void {
    this.modalService.confirm({
      nzTitle: '¿Estás seguro de eliminar este registro?',
      nzContent: tx.isMergedTransfer
        ? 'Esto eliminará tanto el gasto de la cuenta origen como el ingreso de la cuenta destino.'
        : 'Esta acción no se puede deshacer. Tus saldos se actualizarán inmediatamente.',
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: async () => {
        try {
          this.isLoading.set(true);

          const deletePromises = [this.transactionService.deleteTransaction(tx.id)];
          if (tx.isMergedTransfer && tx.linkedTransferId) {
            deletePromises.push(this.transactionService.deleteTransaction(tx.linkedTransferId));
          }

          await Promise.all(deletePromises);

          this.message.success('Registro eliminado con éxito');
          await this.loadTransactions();
        } catch (error) {
          console.error('Error eliminando:', error);
          this.message.error('Ocurrió un error al intentar eliminar el registro');
        } finally {
          this.isLoading.set(false);
        }
      },
      nzCancelText: 'Cancelar'
    });
  }

  exportToCSV(): void {
    const currentData = this.filteredTransactions();
    if (currentData.length === 0) {
      this.message.warning('No hay datos para exportar con los filtros actuales.');
      return;
    }
    this.exportService.exportTransactionsToCSV(currentData, 'Libro_Mayor_FinanceApp');
    this.message.success('Archivo exportado correctamente.');
  }
}
