// src/app/features/dashboard/summary/summary.component.ts
import { Component, inject, signal, OnInit } from '@angular/core';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NgxEchartsDirective } from 'ngx-echarts'; // <-- Importación crucial
import { EChartsOption } from 'echarts';
import { FinancialSummary } from './summary.model';
import { FinancialChartService } from '../../../core/services/charts/financial-chart.service';

@Component({
  selector: 'app-summary',
  standalone: true,
  // Agregamos NgxEchartsDirective a los imports
  imports: [NzGridModule, NzCardModule, NzStatisticModule, NgxEchartsDirective],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss'
})
export class SummaryComponent implements OnInit {
  private readonly chartService = inject(FinancialChartService);

  // Estado para los KPIs
  readonly summary = signal<FinancialSummary>({
    totalBalance: 12500.50,
    totalIncome: 5000.00,
    totalExpenses: 2500.00,
    currency: 'USD',
    lastUpdated: new Date()
  });

  // Estado estricto para el gráfico
  readonly balanceChartOptions = signal<EChartsOption | null>(null);

  ngOnInit(): void {
    this.loadMockChartData();
  }

  /**
   * Simula la carga de datos del backend.
   * Más adelante, esto será una llamada asíncrona a Supabase.
   */
  private loadMockChartData(): void {
    const mockDates = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const mockValues = [11200, 11800, 11500, 12100, 12500, 12300, 12500.50];

    const options = this.chartService.getBalanceHistoryOptions(mockDates, mockValues);
    this.balanceChartOptions.set(options);
  }
}
