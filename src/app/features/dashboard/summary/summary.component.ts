// src/app/features/dashboard/summary/summary.component.ts
import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout'; // <-- NUEVO: Para detectar móvil

import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NgxEchartsDirective } from 'ngx-echarts';
import { EChartsOption } from 'echarts';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';

import { FinancialSummary } from './summary.model';
import { TransactionWithDetails } from '../../../core/models/transaction.model';
import { FinancialChartService } from '../../../core/services/charts/financial-chart.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionModalComponent } from '../../../shared/components/transaction-modal/transaction-modal.component';

type Timeframe = '7d' | '30d' | '1y' | 'all' | 'custom-year';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [
    DecimalPipe, DatePipe, FormsModule,
    NzGridModule, NzCardModule, NzStatisticModule, NgxEchartsDirective,
    NzButtonModule, NzIconModule, NzRadioModule, NzDatePickerModule,
    TransactionModalComponent
  ],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss'
})
export class SummaryComponent implements OnInit {
  private readonly chartService = inject(FinancialChartService);
  private readonly transactionService = inject(TransactionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver); // <-- INYECTADO

  readonly transactions = signal<TransactionWithDetails[]>([]);
  readonly isModalVisible = signal<boolean>(false);
  readonly timeframe = signal<Timeframe>('30d');
  readonly selectedYear = signal<Date | null>(null);

  // NUEVO: Bandera reactiva de espacio visual
  readonly isMobileView = signal<boolean>(false);

  readonly filteredTransactionsByTime = computed(() => {
    const txs = this.transactions();
    const tf = this.timeframe();

    if (tf === 'all') return txs;

    if (tf === 'custom-year' && this.selectedYear()) {
      const year = this.selectedYear()!.getFullYear();
      return txs.filter(tx => new Date(tx.date).getFullYear() === year);
    }

    const limitDate = new Date();
    limitDate.setHours(0, 0, 0, 0);

    if (tf === '7d') limitDate.setDate(limitDate.getDate() - 7);
    if (tf === '30d') limitDate.setDate(limitDate.getDate() - 30);
    if (tf === '1y') limitDate.setFullYear(limitDate.getFullYear() - 1);

    return txs.filter(tx => new Date(tx.date).getTime() >= limitDate.getTime());
  });

  readonly summary = computed<FinancialSummary>(() => {
    const txs = this.filteredTransactionsByTime();
    const totalIncome = txs.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = txs.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      totalBalance: totalIncome - totalExpenses, totalIncome, totalExpenses,
      currency: 'COP', lastUpdated: new Date()
    };
  });

  readonly balanceChartOptions = computed<EChartsOption | null>(() => {
    const txs = this.filteredTransactionsByTime();
    const tf = this.timeframe();
    const isMobile = this.isMobileView(); // <-- Extraemos el estado reactivo
    if (txs.length === 0) return null;

    const isMonthly = tf === '1y' || tf === 'all' || tf === 'custom-year';
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const groupedNet = new Map<string, number>();

    for (const tx of sortedTxs) {
      const dateObj = new Date(tx.date);
      let key = '';

      if (isMonthly) {
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        key = `${dateObj.getFullYear()}-${month}-01`;
      } else {
        key = tx.date;
      }

      const net = tx.type === 'INCOME' ? Number(tx.amount) : -Number(tx.amount);
      groupedNet.set(key, (groupedNet.get(key) || 0) + net);
    }

    const dates: string[] = [];
    const values: number[] = [];
    let runningBalance = 0;
    const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' });

    for (const [dateString, net] of groupedNet.entries()) {
      runningBalance += net;
      if (isMonthly) {
        const dateObj = new Date(`${dateString}T00:00:00`);
        const formatted = monthFormatter.format(dateObj).replace(/^\w/, (c) => c.toUpperCase());
        dates.push(formatted);
      } else {
        dates.push(dateString);
      }
      values.push(runningBalance);
    }

    // PASAMOS EL TERCER PARÁMETRO: isMobile
    return this.chartService.getBalanceHistoryOptions(dates, values, isMobile);
  });

  readonly expensesChartOptions = computed<EChartsOption | null>(() => {
    const txs = this.filteredTransactionsByTime();
    const isMobile = this.isMobileView(); // <-- Extraemos el estado reactivo
    const expenses = txs.filter(t => t.type === 'EXPENSE' && t.categories?.name);
    if (expenses.length === 0) return null;

    const categoryTotals = new Map<string, number>();
    for (const exp of expenses) {
      const catName = exp.categories!.name;
      categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + Number(exp.amount));
    }

    const sortedCategories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // PASAMOS EL TERCER PARÁMETRO: isMobile
    return this.chartService.getExpensesByCategoryOptions(
      sortedCategories.map(item => item[0]),
      sortedCategories.map(item => item[1]),
      isMobile
    );
  });

  readonly timeframeText = computed(() => {
    const tf = this.timeframe();
    if (tf === '7d') return 'Últimos 7 días';
    if (tf === '30d') return 'Últimos 30 días';
    if (tf === '1y') return 'Último Año';
    if (tf === 'custom-year' && this.selectedYear()) return `Año ${this.selectedYear()!.getFullYear()}`;
    return 'Histórico completo';
  });

  async ngOnInit(): Promise<void> {
    await this.loadRealTransactions();

    // 1. Listeners de Supabase
    this.transactionService.transactionsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadRealTransactions();
      });

    // 2. NUEVO: Listeners de Diseño Responsivo
    this.breakpointObserver.observe(['(max-width: 767px)'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        this.isMobileView.set(result.matches);
      });
  }

  async loadRealTransactions(): Promise<void> {
    try {
      const data = await this.transactionService.getTransactions();
      this.transactions.set(data);
    } catch (error) { console.error('Error al cargar:', error); }
  }

  onYearSelected(date: Date): void {
    if (date) {
      this.selectedYear.set(date);
      this.timeframe.set('custom-year');
    }
  }

  openModal(): void { this.isModalVisible.set(true); }
  closeModal(): void { this.isModalVisible.set(false); }
  onTransactionSaved(): void { this.loadRealTransactions(); }
}
