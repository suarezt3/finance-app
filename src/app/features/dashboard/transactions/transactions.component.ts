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
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal'; // <-- IMPORTAMOS EL MÓDULO Y SERVICIO DE MODALES
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzCardModule } from 'ng-zorro-antd/card';

import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionWithDetails } from '../../../core/models/transaction.model';

import { ExportService } from '../../../core/services/export.service';

// Importamos nuestro Componente Compartido
import { TransactionModalComponent } from '../../../shared/components/transaction-modal/transaction-modal.component';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    ReactiveFormsModule, DatePipe, DecimalPipe,
    NzTableModule, NzTagModule, NzButtonModule, NzIconModule,
    NzInputModule, NzDatePickerModule, NzSelectModule, NzGridModule,
    NzStatisticModule, NzCardModule,
    NzModalModule, // <-- REGISTRAMOS EL MÓDULO EN EL ENTORNO STANDALONE
    TransactionModalComponent
  ],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.scss'
})
export class TransactionsComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly message = inject(NzMessageService);
  private readonly modalService = inject(NzModalService); // <-- INYECTAMOS EL SERVICIO
  private readonly fb = inject(FormBuilder);
  private readonly exportService = inject(ExportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly transactionModal = viewChild(TransactionModalComponent);

  readonly transactions = signal<TransactionWithDetails[]>([]);
  readonly isLoading = signal<boolean>(true);

  readonly isModalVisible = signal<boolean>(false);
  readonly currentTxToEdit = signal<TransactionWithDetails | null>(null);

  readonly filterForm: FormGroup = this.fb.group({
    searchTerm: [''],
    dateRange: [[]],
    type: [null]
  });

  private readonly filters = toSignal(this.filterForm.valueChanges, { initialValue: this.filterForm.value });

  readonly filteredTransactions = computed(() => {
    const txs = this.transactions();
    const currentFilters = this.filters();

    return txs.filter(tx => {
      const term = currentFilters.searchTerm?.toLowerCase() || '';
      const matchesSearch = term === '' ||
                            tx.description?.toLowerCase().includes(term) ||
                            tx.categories?.name.toLowerCase().includes(term);

      const matchesType = !currentFilters.type || tx.type === currentFilters.type;

      let matchesDate = true;
      if (currentFilters.dateRange && currentFilters.dateRange.length === 2) {
        const txDate = new Date(tx.date).getTime();
        const startDate = new Date(currentFilters.dateRange[0]).setHours(0, 0, 0, 0);
        const endDate = new Date(currentFilters.dateRange[1]).setHours(23, 59, 59, 999);
        matchesDate = txDate >= startDate && txDate <= endDate;
      }

      return matchesSearch && matchesType && matchesDate;
    });
  });

  readonly filteredSummary = computed(() => {
    const txs = this.filteredTransactions();
    const totalIncome = txs.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = txs.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
    return { totalBalance: totalIncome - totalExpenses, totalIncome, totalExpenses };
  });

  readonly absoluteBalance = computed(() => {
    const txs = this.transactions();
    const totalIncome = txs.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = txs.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
    return totalIncome - totalExpenses;
  });

  async ngOnInit(): Promise<void> {
    await this.loadTransactions();

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

  clearFilters(): void {
    this.filterForm.reset({ searchTerm: '', dateRange: [], type: null });
  }

  // ==========================================
  // ORQUESTACIÓN DEL MODAL COMPARTIDO
  // ==========================================

  openNewModal(): void {
    this.currentTxToEdit.set(null);
    this.isModalVisible.set(true);
  }

  openEditModal(tx: TransactionWithDetails): void {
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

  // ==========================================
  // LÓGICA DE ELIMINACIÓN CON CONFIRMACIÓN UX
  // ==========================================

  onDelete(id: string): void {
    this.modalService.confirm({
      nzTitle: '¿Estás seguro de eliminar esta transacción?',
      nzContent: 'Esta acción no se puede deshacer. Tus saldos y gráficos se actualizarán inmediatamente.',
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: async () => {
        try {
          this.isLoading.set(true);
          // Asumo que tu servicio tiene este método implementado hacia Supabase
          await this.transactionService.deleteTransaction(id);
          this.message.success('Transacción eliminada con éxito');
          await this.loadTransactions(); // Recarga y actualiza signals
        } catch (error) {
          console.error('Error eliminando la transacción:', error);
          this.message.error('Ocurrió un error al intentar eliminar la transacción');
        } finally {
          this.isLoading.set(false);
        }
      },
      nzCancelText: 'Cancelar'
    });
  }

  // ==========================================
  // EXPORTACIÓN DE DATOS
  // ==========================================
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
