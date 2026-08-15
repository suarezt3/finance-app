// src/app/features/dashboard/summary/summary.component.ts
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NgxEchartsDirective } from 'ngx-echarts';
import { EChartsOption } from 'echarts';

import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';

import { FinancialSummary } from './summary.model';
import { TransactionWithDetails } from '../../../core/models/transaction.model';
import { FinancialChartService } from '../../../core/services/charts/financial-chart.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { CatalogService, Category, PaymentMethod } from '../../../core/services/catalog.service';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    NzGridModule, NzCardModule, NzStatisticModule, NgxEchartsDirective,
    NzModalModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzSelectModule, NzDatePickerModule, NzButtonModule
  ],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss'
})
export class SummaryComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly chartService = inject(FinancialChartService);
  private readonly transactionService = inject(TransactionService);
  private readonly catalogService = inject(CatalogService);

  // -- ESTADO BASE DE DATOS --
  readonly transactions = signal<TransactionWithDetails[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);

  // -- ESTADOS DERIVADOS (Reactivos) --
  readonly summary = computed<FinancialSummary>(() => {
    const txs = this.transactions();
    const totalIncome = txs.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = txs.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      totalBalance: totalIncome - totalExpenses,
      totalIncome,
      totalExpenses,
      currency: 'USD',
      lastUpdated: new Date()
    };
  });

  readonly balanceChartOptions = computed<EChartsOption | null>(() => {
    const txs = this.transactions();

    // Si no hay transacciones, retornamos null (el HTML mostrará el placeholder)
    if (txs.length === 0) return null;

    // 1. Ordenamos las transacciones cronológicamente (de más antigua a más reciente)
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 2. Agrupamos el balance neto por día usando un Map
    const dailyNet = new Map<string, number>();
    for (const tx of sortedTxs) {
      const net = tx.type === 'INCOME' ? Number(tx.amount) : -Number(tx.amount);
      dailyNet.set(tx.date, (dailyNet.get(tx.date) || 0) + net);
    }

    // 3. Calculamos el saldo acumulado (Running Balance) a lo largo del tiempo
    const dates: string[] = [];
    const values: number[] = [];
    let runningBalance = 0;

    for (const [date, net] of dailyNet.entries()) {
      runningBalance += net;
      dates.push(date); // Eje X
      values.push(runningBalance); // Eje Y
    }

    // 4. Inyectamos los datos procesados a nuestro servicio de gráficos
    return this.chartService.getBalanceHistoryOptions(dates, values);
  });

  // -- ESTADO DEL MODAL Y FORMULARIO --
  readonly isModalVisible = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);

  readonly transactionForm: FormGroup = this.fb.nonNullable.group({
    type: ['EXPENSE', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [new Date(), [Validators.required]],
    description: [''],
    category_id: [null],
    payment_method_id: [null]
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadRealTransactions(),
      this.loadCatalogs()
    ]);
    // Eliminamos this.loadMockChartData() porque ya no existe ni se necesita
  }

  async loadRealTransactions(): Promise<void> {
    try {
      const data = await this.transactionService.getTransactions();
      this.transactions.set(data);
    } catch (error) {
      console.error('Error al cargar transacciones:', error);
    }
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

  openModal(): void {
    this.isModalVisible.set(true);
  }

  closeModal(): void {
    this.isModalVisible.set(false);
    this.isSubmitting.set(false);
    this.transactionForm.reset({
      type: 'EXPENSE', amount: 0, date: new Date(), description: '', category_id: null, payment_method_id: null
    });
  }

  async onSubmitTransaction(): Promise<void> {
    if (this.transactionForm.valid) {
      this.isSubmitting.set(true);

      try {
        const rawValues = this.transactionForm.getRawValue();
        const formattedData = {
          ...rawValues,
          date: (rawValues.date as Date).toISOString().split('T')[0]
        };

        await this.transactionService.createTransaction(formattedData);
        this.closeModal();
        await this.loadRealTransactions();

      } catch (error) {
        console.error('Error en el flujo de inserción:', error);
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
