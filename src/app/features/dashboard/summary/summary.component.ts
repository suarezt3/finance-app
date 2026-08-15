// src/app/features/dashboard/summary/summary.component.ts
import { Component, signal } from '@angular/core';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { FinancialSummary } from './summary.model';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [NzGridModule, NzCardModule, NzStatisticModule],
  templateUrl: './summary.component.html', // <-- Cambiado a archivo externo
  styleUrl: './summary.component.scss'     // <-- Vinculamos la hoja de estilos
})
export class SummaryComponent {

  readonly summary = signal<FinancialSummary>({
    totalBalance: 12500.50,
    totalIncome: 5000.00,
    totalExpenses: 2500.00,
    currency: 'USD',
    lastUpdated: new Date()
  });

}
