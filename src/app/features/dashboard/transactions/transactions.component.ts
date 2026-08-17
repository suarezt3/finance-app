// src/app/features/dashboard/transactions/transactions.component.ts
import { Component, inject, signal, computed, OnInit, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzCardModule } from 'ng-zorro-antd/card';

import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionWithDetails } from '../../../core/models/transaction.model';

// NUEVO: Importamos nuestro Componente Compartido
import { TransactionModalComponent } from '../../../shared/components/transaction-modal/transaction-modal.component';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    ReactiveFormsModule, DatePipe, DecimalPipe,
    NzTableModule, NzTagModule, NzButtonModule, NzIconModule,
    NzInputModule, NzDatePickerModule, NzSelectModule, NzGridModule,
    NzStatisticModule, NzCardModule,
    TransactionModalComponent // <-- Lo inyectamos en el ecosistema
  ],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.scss'
})
export class TransactionsComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly message = inject(NzMessageService);
  private readonly fb = inject(FormBuilder);

  // -- REFERENCIA AL COMPONENTE HIJO (Moderno Angular 17+) --
  readonly transactionModal = viewChild(TransactionModalComponent);

  // -- ESTADOS BASE --
  readonly transactions = signal<TransactionWithDetails[]>([]);
  readonly isLoading = signal<boolean>(true);

  // -- ESTADOS DEL MODAL --
  readonly isModalVisible = signal<boolean>(false);
  readonly currentTxToEdit = signal<TransactionWithDetails | null>(null);

  // -- FORMULARIO DE FILTROS --
  readonly filterForm: FormGroup = this.fb.group({
    searchTerm: [''],
    dateRange: [[]],
    type: [null]
  });

  private readonly filters = toSignal(this.filterForm.valueChanges, { initialValue: this.filterForm.value });

  // -- ESTADOS DERIVADOS (Buscador y KPIs) --
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
  }

  // Ahora es público para que el Modal pueda ordenar la recarga al terminar
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
    // Le indicamos al componente hijo que parchee el formulario con estos datos
    this.transactionModal()?.openForEdit(tx);
  }

  closeModal(): void {
    this.isModalVisible.set(false);
    this.currentTxToEdit.set(null);
  }

  onTransactionSaved(): void {
    // Cuando el hijo emite que guardó exitosamente, forzamos la recarga reactiva de los datos
    this.loadTransactions();
  }

  // ==========================================

  onDelete(id: string): void {
    this.message.info('Funcionalidad de eliminación en construcción');
  }
}
