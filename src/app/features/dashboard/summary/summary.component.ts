// src/app/features/dashboard/summary/summary.component.ts
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NgxEchartsDirective } from 'ngx-echarts';
import { EChartsOption } from 'echarts';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';

import { FinancialSummary } from './summary.model';
import { TransactionWithDetails } from '../../../core/models/transaction.model';
import { FinancialChartService } from '../../../core/services/charts/financial-chart.service';
import { TransactionService } from '../../../core/services/transaction.service';

// NUEVO: Importamos el Modal Compartido
import { TransactionModalComponent } from '../../../shared/components/transaction-modal/transaction-modal.component';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [
    DecimalPipe, DatePipe,
    NzGridModule, NzCardModule, NzStatisticModule, NgxEchartsDirective, NzButtonModule, NzIconModule,
    TransactionModalComponent // <-- Lo inyectamos en el ecosistema del Resumen
  ],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss'
})
export class SummaryComponent implements OnInit {
  private readonly chartService = inject(FinancialChartService);
  private readonly transactionService = inject(TransactionService);

  // -- ESTADO BASE --
  readonly transactions = signal<TransactionWithDetails[]>([]);

  // -- ESTADO DEL MODAL COMPARTIDO --
  readonly isModalVisible = signal<boolean>(false);

  // -- ESTADOS DERIVADOS (KPIs y Gráfico) --
  readonly summary = computed<FinancialSummary>(() => {
    const txs = this.transactions();
    const totalIncome = txs.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = txs.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      totalBalance: totalIncome - totalExpenses,
      totalIncome,
      totalExpenses,
      currency: 'COP',
      lastUpdated: new Date()
    };
  });

  readonly balanceChartOptions = computed<EChartsOption | null>(() => {
    const txs = this.transactions();
    if (txs.length === 0) return null;

    const sortedTxs = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const dailyNet = new Map<string, number>();

    for (const tx of sortedTxs) {
      const net = tx.type === 'INCOME' ? Number(tx.amount) : -Number(tx.amount);
      dailyNet.set(tx.date, (dailyNet.get(tx.date) || 0) + net);
    }

    const dates: string[] = [];
    const values: number[] = [];
    let runningBalance = 0;

    for (const [date, net] of dailyNet.entries()) {
      runningBalance += net;
      dates.push(date);
      values.push(runningBalance);
    }

    return this.chartService.getBalanceHistoryOptions(dates, values);
  });

  async ngOnInit(): Promise<void> {
    await this.loadRealTransactions();
  }

  async loadRealTransactions(): Promise<void> {
    try {
      const data = await this.transactionService.getTransactions();
      this.transactions.set(data);
    } catch (error) {
      console.error('Error al cargar transacciones:', error);
    }
  }

  // ==========================================
  // ORQUESTACIÓN DEL MODAL COMPARTIDO
  // ==========================================

  openModal(): void {
    this.isModalVisible.set(true);
  }

  closeModal(): void {
    this.isModalVisible.set(false);
  }

  onTransactionSaved(): void {
    // Cuando el modal compartido avisa que guardó, refrescamos la base de datos (y los KPIs se actualizan solos)
    this.loadRealTransactions();
  }
}
