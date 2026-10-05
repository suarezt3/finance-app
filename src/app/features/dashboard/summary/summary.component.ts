// src/app/features/dashboard/summary/summary.component.ts
import { Component, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { DecimalPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';

import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';

import { RouterLink } from '@angular/router';

import { FinancialSummary } from './summary.model';
import { TransactionWithDetails } from '../../../core/models/transaction.model';
import { TransactionService } from '../../../core/services/transaction.service';
import { CatalogService, PaymentMethod } from '../../../core/services/catalog.service';
import { TransactionModalComponent } from '../../../shared/components/transaction-modal/transaction-modal.component';
import { ExpensesDonutChart, ExpenseCategorySlice } from './expenses-donut-chart/expenses-donut-chart';
import { BalanceAreaChart } from './balance-area-chart/balance-area-chart';
import { ThemeService } from '../../../core/services/theme.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { ScheduledPaymentService } from '../../../core/services/scheduled-payment.service';

import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Wallet01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowLeft01Icon,
  ArrowLeftRightIcon,
  PlusSignIcon,
  Clock01Icon,
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  InboxIcon
} from '@hugeicons/core-free-icons';

type Timeframe = 'month' | '7d' | '30d' | '1y' | 'all' | 'custom-year';

// ==========================================
// VIEW MODEL: Interfaz extendida para la UI
// ==========================================
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
  selector: 'app-summary',
  standalone: true,
  imports: [
    DecimalPipe, DatePipe, TitleCasePipe, FormsModule, RouterLink,
    HugeiconsIconComponent,
    NzGridModule, NzCardModule, NzStatisticModule,
    NzButtonModule, NzIconModule, NzRadioModule, NzDatePickerModule,
    NzSelectModule, NzTableModule, NzTagModule, NzTooltipModule,
    TransactionModalComponent, ExpensesDonutChart, BalanceAreaChart
  ],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss'
})
export class SummaryComponent implements OnInit {
  // Hugeicons para KPIs, filtros y transacciones
  readonly WalletIcon = Wallet01Icon;
  readonly ArrowUpIcon = ArrowUp01Icon;
  readonly ArrowDownIcon = ArrowDown01Icon;
  readonly ArrowRightIcon = ArrowRight01Icon;
  readonly ArrowLeftIcon = ArrowLeft01Icon;
  readonly TransferIcon = ArrowLeftRightIcon;
  readonly PlusIcon = PlusSignIcon;
  readonly ClockIcon = Clock01Icon;
  readonly AlertIcon = AlertCircleIcon;
  readonly CheckCircleIcon = CheckmarkCircle01Icon;
  readonly EmptyIcon = InboxIcon;

  private readonly transactionService = inject(TransactionService);
  private readonly catalogService = inject(CatalogService);
  readonly themeService = inject(ThemeService);
  readonly userPreferences = inject(UserPreferencesService);
  readonly scheduledPaymentService = inject(ScheduledPaymentService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currencySymbol = this.userPreferences.currencySymbol;
  readonly preferredCurrency = this.userPreferences.preferredCurrency;

  readonly budgetAlert = computed<{ ratio: number; threshold: number } | null>(() => {
    if (!this.userPreferences.alertsEnabled()) return null;
    const s = this.summary();
    if (s.totalIncome <= 0 || s.totalExpenses <= 0) return null;
    const ratio = Math.round((s.totalExpenses / s.totalIncome) * 100);
    const threshold = this.userPreferences.budgetAlertPercentage();
    if (ratio >= threshold) {
      return { ratio, threshold };
    }
    return null;
  });
  private readonly breakpointObserver = inject(BreakpointObserver);

  // Estado puro
  readonly transactions = signal<TransactionWithDetails[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);

  readonly isModalVisible = signal<boolean>(false);
  readonly timeframe = signal<Timeframe>('all');
  readonly selectedMonthDate = signal<Date>(new Date());
  readonly selectedYear = signal<Date | null>(new Date());
  readonly selectedPaymentMethod = signal<string | null>(null);
  readonly chartViewMode = signal<'balance' | 'income-expense'>('balance');

  readonly isMobileView = signal<boolean>(false);

  // Navegación rápida unificada de períodos
  readonly isCurrentPeriod = computed<boolean>(() => {
    const now = new Date();
    const tf = this.timeframe();
    if (tf === 'month') {
      const d = this.selectedMonthDate();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (tf === 'custom-year') {
      const y = this.selectedYear() || now;
      return y.getFullYear() === now.getFullYear();
    }
    return true;
  });

  onPrevPeriod(): void {
    const tf = this.timeframe();
    if (tf === 'month') {
      const d = new Date(this.selectedMonthDate());
      d.setMonth(d.getMonth() - 1);
      this.selectedMonthDate.set(d);
    } else if (tf === 'custom-year') {
      const y = this.selectedYear() || new Date();
      const newD = new Date(y);
      newD.setFullYear(newD.getFullYear() - 1);
      this.selectedYear.set(newD);
    }
  }

  onNextPeriod(): void {
    const tf = this.timeframe();
    if (tf === 'month') {
      const d = new Date(this.selectedMonthDate());
      d.setMonth(d.getMonth() + 1);
      this.selectedMonthDate.set(d);
    } else if (tf === 'custom-year') {
      const y = this.selectedYear() || new Date();
      const newD = new Date(y);
      newD.setFullYear(newD.getFullYear() + 1);
      this.selectedYear.set(newD);
    }
  }

  onCurrentPeriod(): void {
    const now = new Date();
    this.selectedMonthDate.set(now);
    this.selectedYear.set(now);
  }

  onTimeframeSelect(newTf: Timeframe): void {
    this.timeframe.set(newTf);
    if (newTf === 'custom-year' && !this.selectedYear()) {
      this.selectedYear.set(new Date());
    }
  }

  onPrevMonth(): void {
    this.onPrevPeriod();
  }

  onNextMonth(): void {
    this.onNextPeriod();
  }

  onCurrentMonth(): void {
    this.onCurrentPeriod();
  }

  // ==========================================
  // LÓGICA DE DOMINIO: Aggregation & ViewModel
  // ==========================================
  readonly enrichedTransactions = computed<TransactionView[]>(() => {
    const raw = this.transactions();
    const processed: TransactionView[] = [];
    const transferPairs = new Map<string, { expense?: TransactionWithDetails, income?: TransactionWithDetails }>();

    raw.forEach(tx => {
      const isTransfer = !tx.category_id && !!tx.description?.toLowerCase().includes('transferencia');

      if (!isTransfer) {
        processed.push({ ...tx, isTransfer: false, displayCategory: tx.categories?.name || '---' });
      } else {
        const matchKey = `${tx.date}_${tx.amount}`;
        if (!transferPairs.has(matchKey)) transferPairs.set(matchKey, {});
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
        if (orphan) processed.push({ ...orphan, isTransfer: true, displayCategory: 'Transferencia (Anómala)' });
      }
    });

    return processed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // -- FILTRO CRUZADO MAESTRO --
  readonly masterFilteredTransactions = computed(() => {
    const txs = this.enrichedTransactions(); // Usamos la data enriquecida
    const tf = this.timeframe();
    const methodId = this.selectedPaymentMethod();

    let filtered = txs;
    if (methodId) {
      // Soportamos cuentas de origen y destino en transferencias fusionadas
      filtered = filtered.filter(tx =>
        tx.payment_method_id === methodId || tx.destinationMethodId === methodId
      );
    }

    if (tf === 'all') return filtered;

    if (tf === 'month') {
      const targetYear = this.selectedMonthDate().getFullYear();
      const targetMonth = this.selectedMonthDate().getMonth();
      return filtered.filter(tx => {
        const d = new Date(tx.date);
        return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
      });
    }

    if (tf === 'custom-year' && this.selectedYear()) {
      const year = this.selectedYear()!.getFullYear();
      return filtered.filter(tx => new Date(tx.date).getFullYear() === year);
    }

    const limitDate = new Date();
    limitDate.setHours(0, 0, 0, 0);

    if (tf === '7d') limitDate.setDate(limitDate.getDate() - 7);
    if (tf === '30d') limitDate.setDate(limitDate.getDate() - 30);
    if (tf === '1y') limitDate.setFullYear(limitDate.getFullYear() - 1);

    return filtered.filter(tx => new Date(tx.date).getTime() >= limitDate.getTime());
  });

  // -- TABLA DE ÚLTIMOS MOVIMIENTOS --
  readonly latestTransactions = computed(() => {
    const txs = this.masterFilteredTransactions();
    return [...txs]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5); // Automáticamente hereda la vista fusionada (1 fila = 1 transferencia)
  });

  // -- KPIs ACTUALES --
  readonly summary = computed<FinancialSummary>(() => {
    const txs = this.masterFilteredTransactions();
    const methodId = this.selectedPaymentMethod();

    let totalIncome = 0;
    let totalExpenses = 0;
    let transferImpact = 0;

    txs.forEach(t => {
      if (!t.isTransfer) {
        if (t.type === 'INCOME') totalIncome += Number(t.amount);
        if (t.type === 'EXPENSE') totalExpenses += Number(t.amount);
      } else if (t.isMergedTransfer && methodId) {
        // Lógica Ledger para transferencias si hay una cuenta específica filtrada
        if (t.payment_method_id === methodId) transferImpact -= Number(t.amount);
        else if (t.destinationMethodId === methodId) transferImpact += Number(t.amount);
      }
    });

    return {
      totalBalance: (totalIncome - totalExpenses) + transferImpact,
      totalIncome,
      totalExpenses,
      currency: this.preferredCurrency(),
      lastUpdated: new Date()
    };
  });



  // -- SEMÁFORO DE SALUD FINANCIERA & AHORRO --
  readonly financialHealth = computed(() => {
    const s = this.summary();
    const income = s.totalIncome;
    const expenses = s.totalExpenses;

    if (income === 0 && expenses === 0) {
      return {
        status: 'NEUTRAL',
        icon: 'dashboard',
        title: 'Sin Movimientos en el Período',
        message: 'Registra tus ingresos y gastos para activar el análisis inteligente de salud financiera.',
        savingsRate: null
      };
    }

    if (income > 0) {
      const netSavings = income - expenses;
      const rate = Math.round((netSavings / income) * 100);

      if (rate >= 20) {
        return {
          status: 'EXCELLENT',
          icon: 'check-circle',
          title: 'Excelente Salud Financiera',
          message: `¡Felicitaciones! Estás ahorrando el ${rate}% de tus ingresos en este período.`,
          savingsRate: rate
        };
      } else if (rate >= 0) {
        return {
          status: 'MODERATE',
          icon: 'info-circle',
          title: 'Presupuesto Equilibrado',
          message: `Tus gastos representan el ${100 - rate}% de tus ingresos. Mantienes un margen de ahorro del ${rate}%.`,
          savingsRate: rate
        };
      } else {
        return {
          status: 'DEFICIT',
          icon: 'warning',
          title: 'Déficit Financiero Detectado',
          message: `Tus gastos superan tus ingresos en un ${Math.abs(rate)}% en este período. Te recomendamos moderar gastos variables.`,
          savingsRate: rate
        };
      }
    }

    return {
      status: 'DEFICIT',
      icon: 'warning',
      title: 'Gastos sin Ingresos Registrados',
      message: 'Has registrado salidas de dinero pero ningún ingreso en este período.',
      savingsRate: -100
    };
  });

  // -- INTELIGENCIA DE NEGOCIO: VARIACIONES --
  readonly kpiVariations = computed(() => {
    const tf = this.timeframe();
    if (tf === 'all') return null;

    const txs = this.enrichedTransactions(); // Evaluamos sobre la data enriquecida
    const methodId = this.selectedPaymentMethod();
    const current = this.summary();

    let filteredTxs = methodId
      ? txs.filter(tx => tx.payment_method_id === methodId || tx.destinationMethodId === methodId)
      : txs;

    if (tf === 'month') {
      const currentYear = this.selectedMonthDate().getFullYear();
      const currentMonth = this.selectedMonthDate().getMonth();
      const prevDate = new Date(currentYear, currentMonth - 1, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonth = prevDate.getMonth();

      let prevIncome = 0;
      let prevExpense = 0;

      filteredTxs.forEach(t => {
        const d = new Date(t.date);
        if (d.getFullYear() === prevYear && d.getMonth() === prevMonth) {
          if (!t.isTransfer) {
            if (t.type === 'INCOME') prevIncome += Number(t.amount);
            if (t.type === 'EXPENSE') prevExpense += Number(t.amount);
          }
        }
      });

      const incomeDiff = prevIncome > 0 ? ((current.totalIncome - prevIncome) / prevIncome) * 100 : 0;
      const expenseDiff = prevExpense > 0 ? ((current.totalExpenses - prevExpense) / prevExpense) * 100 : 0;

      return {
        incomePercentage: incomeDiff,
        expensePercentage: expenseDiff
      };
    }

    const now = new Date();
    let prevStart = new Date();
    let prevEnd = new Date();

    if (tf === '7d') {
      prevEnd.setDate(now.getDate() - 7);
      prevStart.setDate(now.getDate() - 14);
    } else if (tf === '30d') {
      prevEnd.setDate(now.getDate() - 30);
      prevStart.setDate(now.getDate() - 60);
    } else if (tf === '1y') {
      prevEnd.setFullYear(now.getFullYear() - 1);
      prevStart.setFullYear(now.getFullYear() - 2);
    } else if (tf === 'custom-year' && this.selectedYear()) {
      const year = this.selectedYear()!.getFullYear();
      prevStart = new Date(year - 1, 0, 1);
      prevEnd = new Date(year - 1, 11, 31, 23, 59, 59);
    }

    const prevTxs = filteredTxs.filter(tx => {
      const txTime = new Date(tx.date).getTime();
      return txTime >= prevStart.getTime() && txTime < prevEnd.getTime();
    });

    // Ignoramos las transferencias para el cálculo puro de ingresos/gastos pasados
    const prevIncome = prevTxs.filter(t => t.type === 'INCOME' && !t.isTransfer).reduce((sum, t) => sum + Number(t.amount), 0);
    const prevExpenses = prevTxs.filter(t => t.type === 'EXPENSE' && !t.isTransfer).reduce((sum, t) => sum + Number(t.amount), 0);

    const calculatePercentage = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      incomePercentage: calculatePercentage(current.totalIncome, prevIncome),
      expensePercentage: calculatePercentage(current.totalExpenses, prevExpenses)
    };
  });

  // -- DATOS PARA EL GRÁFICO DE BALANCE D3 (CURVA Y GRADIENTE) --
  readonly balanceChartData = computed<{ dates: string[]; values: number[] }>(() => {
    const txs = this.masterFilteredTransactions();
    const tf = this.timeframe();
    const methodId = this.selectedPaymentMethod();
    if (txs.length === 0) return { dates: [], values: [] };

    const isMonthly = tf === '1y' || tf === 'all' || tf === 'custom-year';
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const groupedNet = new Map<string, number>();

    for (const tx of sortedTxs) {
      const dateObj = new Date(tx.date);
      let key = isMonthly ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-01` : tx.date;

      let net = 0;
      if (!tx.isTransfer) {
        net = tx.type === 'INCOME' ? Number(tx.amount) : -Number(tx.amount);
      } else if (tx.isMergedTransfer && methodId) {
        net = tx.payment_method_id === methodId ? -Number(tx.amount) : Number(tx.amount);
      }

      groupedNet.set(key, (groupedNet.get(key) || 0) + net);
    }

    const dates: string[] = [];
    const values: number[] = [];
    let runningBalance = 0;

    for (const [dateString, net] of groupedNet.entries()) {
      runningBalance += net;
      dates.push(dateString);
      values.push(runningBalance);
    }

    return { dates, values };
  });

  // -- DATOS PARA EL GRÁFICO COMPARATIVO D3: INGRESOS VS GASTOS --
  readonly incomeExpenseChartData = computed<{ dates: string[]; incomes: number[]; expenses: number[] }>(() => {
    const txs = this.masterFilteredTransactions();
    const tf = this.timeframe();
    if (txs.length === 0) return { dates: [], incomes: [], expenses: [] };

    const isMonthly = tf === '1y' || tf === 'all' || tf === 'custom-year';
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const grouped = new Map<string, { income: number; expense: number }>();

    for (const tx of sortedTxs) {
      const dateObj = new Date(tx.date);
      let key = isMonthly ? `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-01` : tx.date;

      if (!grouped.has(key)) {
        grouped.set(key, { income: 0, expense: 0 });
      }
      const entry = grouped.get(key)!;

      if (!tx.isTransfer) {
        if (tx.type === 'INCOME') entry.income += Number(tx.amount);
        if (tx.type === 'EXPENSE') entry.expense += Number(tx.amount);
      }
    }

    const dates: string[] = [];
    const incomes: number[] = [];
    const expenses: number[] = [];

    for (const [dateString, val] of grouped.entries()) {
      dates.push(dateString);
      incomes.push(val.income);
      expenses.push(val.expense);
    }

    return { dates, incomes, expenses };
  });

  // -- DATOS PARA EL GRÁFICO DE ANILLOS D3 (SLATE NAVY & FINANCIAL BLUE) --
  readonly expenseCategoriesData = computed<ExpenseCategorySlice[]>(() => {
    const txs = this.masterFilteredTransactions();
    const expenses = txs.filter(t => t.type === 'EXPENSE' && !t.isTransfer && t.categories?.name);
    if (expenses.length === 0) return [];

    const categoryTotals = new Map<string, number>();
    let total = 0;

    for (const exp of expenses) {
      const catName = exp.categories!.name;
      const amt = Number(exp.amount);
      categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + amt);
      total += amt;
    }

    if (total === 0) return [];

    const sorted = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1]);

    // Paleta Slate Navy & Financial Blue reactiva al modo oscuro
    const isDark = this.themeService.isDarkMode();
    const colors = isDark ? [
      '#38bdf8', // Sky Blue 400 (Vibrante)
      '#60a5fa', // Blue 400 (Eléctrico)
      '#3b82f6', // Financial Blue 500
      '#818cf8', // Indigo Slate 400
      '#a78bfa', // Violet Tint 400
    ] : [
      '#0f172a', // Slate Navy Profundo (Top 1)
      '#1e3a8a', // Deep Navy (Top 2)
      '#2563eb', // Financial Blue (Top 3)
      '#3b82f6', // Electric Blue (Top 4)
      '#60a5fa', // Sky Blue (Top 5)
    ];

    const otherColor = isDark ? '#64748b' : '#94a3b8';

    const result: ExpenseCategorySlice[] = [];
    const topLimit = 5;

    for (let i = 0; i < Math.min(topLimit, sorted.length); i++) {
      const [name, amount] = sorted[i];
      result.push({
        name,
        amount,
        percentage: (amount / total) * 100,
        color: colors[i] || otherColor
      });
    }

    if (sorted.length > topLimit) {
      const othersAmount = sorted.slice(topLimit).reduce((sum, item) => sum + item[1], 0);
      if (othersAmount > 0) {
        result.push({
          name: 'Otras categorías',
          amount: othersAmount,
          percentage: (othersAmount / total) * 100,
          color: otherColor
        });
      }
    }

    return result;
  });

  readonly totalExpensesSum = computed<number>(() => {
    return this.expenseCategoriesData().reduce((acc, cat) => acc + cat.amount, 0);
  });

  readonly timeframeText = computed(() => {
    const tf = this.timeframe();
    if (tf === 'month') {
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const d = this.selectedMonthDate();
      return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (tf === '7d') return 'Últimos 7 días';
    if (tf === '30d') return 'Últimos 30 días';
    if (tf === '1y') return 'Último Año';
    if (tf === 'custom-year' && this.selectedYear()) return `Año ${this.selectedYear()!.getFullYear()}`;
    return 'Histórico completo';
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadRealTransactions(), this.loadCatalogs()]);

    this.transactionService.transactionsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.loadRealTransactions(); });

    this.breakpointObserver.observe(['(max-width: 767px)'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => { this.isMobileView.set(result.matches); });
  }

  async loadRealTransactions(retries = 3): Promise<void> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const data = await this.transactionService.getTransactions();
        this.transactions.set(data);
        return;
      } catch (error: any) {
        console.error(`Error al cargar transacciones (intento ${attempt + 1}):`, error);
        if (attempt < retries) {
          const isSkew = error?.message?.includes('JWT') || error?.message?.includes('future');
          const delay = isSkew ? 1200 * (attempt + 1) : 400 * (attempt + 1);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
  }

  async loadCatalogs(retries = 3): Promise<void> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const methods = await this.catalogService.getPaymentMethods();
        this.paymentMethods.set(methods);
        return;
      } catch (error: any) {
        console.error(`Error al cargar métodos de pago (intento ${attempt + 1}):`, error);
        if (attempt < retries) {
          const isSkew = error?.message?.includes('JWT') || error?.message?.includes('future');
          const delay = isSkew ? 1200 * (attempt + 1) : 400 * (attempt + 1);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
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
