// src/app/features/dashboard/summary/balance-area-chart/balance-area-chart.ts
import { Component, ChangeDetectionStrategy, input, signal, computed, ElementRef, viewChild, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { scaleLinear, line, area, curveMonotoneX } from 'd3';
import { ThemeService } from '../../../../core/services/theme.service';

export interface BalancePoint {
  index: number;
  date: string;
  value: number;
}

export interface IncomeExpensePoint {
  index: number;
  date: string;
  income: number;
  expense: number;
}

export interface YAxisTick {
  y: number;
  formatted: string;
}

export interface XAxisTick {
  x: number;
  label: string;
}

@Component({
  selector: 'app-balance-area-chart',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="balance-chart-root" #chartRoot>
      @if (dates().length === 0 || (mode() === 'balance' && values().length === 0) || (mode() === 'income-expense' && incomes().length === 0 && expenses().length === 0)) {
        <div class="empty-balance-state">
          <div class="empty-icon-wrap">
            <svg viewBox="0 0 48 48" class="empty-svg-icon">
              <path
                d="M6 38L18 26L28 32L42 12"
                fill="none"
                [attr.stroke]="isDark() ? '#334155' : '#cbd5e1'"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-dasharray="4 4"
              />
            </svg>
          </div>
          <p class="empty-title">Sin historial de datos</p>
          <span class="empty-desc">No se registran movimientos en el periodo o cuenta seleccionada.</span>
        </div>
      } @else {
        <div class="chart-canvas-container">
          
          <!-- LEYENDA CUANDO SE ENCUENTRA EN MODO INGRESOS VS GASTOS -->
          @if (mode() === 'income-expense') {
            <div class="chart-dual-legend">
              <span class="legend-badge income">
                <span class="legend-indicator income-indicator"></span>
                <span>Ingresos</span>
              </span>
              <span class="legend-badge expense">
                <span class="legend-indicator expense-indicator"></span>
                <span>Gastos</span>
              </span>
            </div>
          }

          <svg
            #svgElement
            viewBox="0 0 640 260"
            preserveAspectRatio="none"
            class="d3-area-svg"
            (mousemove)="onPointerMove($event)"
            (mouseleave)="onPointerLeave()"
            (touchmove)="onTouchMove($event)"
            (touchend)="onPointerLeave()">

            <defs>
              <!-- 1. Gradiente Balance (Azul) -->
              <linearGradient id="balanceAreaGradD3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" [attr.stop-color]="gradTopColor()" [attr.stop-opacity]="gradTopOpacity()" />
                <stop offset="65%" [attr.stop-color]="gradMidColor()" stop-opacity="0.08" />
                <stop offset="100%" [attr.stop-color]="gradTopColor()" stop-opacity="0.00" />
              </linearGradient>

              <!-- 2. Gradiente Ingresos (Verde Esmeralda) -->
              <linearGradient id="incomeAreaGradD3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.28" />
                <stop offset="70%" stop-color="#059669" stop-opacity="0.06" />
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.00" />
              </linearGradient>

              <!-- 3. Gradiente Gastos (Coral / Rojo) -->
              <linearGradient id="expenseAreaGradD3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ef4444" stop-opacity="0.25" />
                <stop offset="70%" stop-color="#dc2626" stop-opacity="0.06" />
                <stop offset="100%" stop-color="#ef4444" stop-opacity="0.00" />
              </linearGradient>

              <!-- Filtros de resplandor para las líneas -->
              <filter id="lineGlow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" [attr.flood-color]="lineColor()" flood-opacity="0.3" />
              </filter>
              <filter id="incomeLineGlow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#10b981" flood-opacity="0.3" />
              </filter>
              <filter id="expenseLineGlow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#ef4444" flood-opacity="0.3" />
              </filter>
            </defs>

            <!-- RETÍCULA HORIZONTAL Y EJE Y -->
            <g class="grid-group">
              @for (tick of yTicks(); track tick.y) {
                <line
                  [attr.x1]="margins.left"
                  [attr.y1]="tick.y"
                  [attr.x2]="width - margins.right"
                  [attr.y2]="tick.y"
                  class="grid-line"
                />
                <text
                  [attr.x]="margins.left - 10"
                  [attr.y]="tick.y + 4"
                  text-anchor="end"
                  class="y-axis-label tabular-nums">
                  {{ tick.formatted }}
                </text>
              }
            </g>

            <!-- EJE X (FECHAS) -->
            <g class="x-axis-group">
              @for (tick of xTicks(); track tick.x) {
                <text
                  [attr.x]="tick.x"
                  [attr.y]="height - 8"
                  text-anchor="middle"
                  class="x-axis-label">
                  {{ tick.label }}
                </text>
              }
            </g>

            <!-- MODO 1: BALANCE NETO (UNA LÍNEA AZUL + ÁREA) -->
            @if (mode() === 'balance') {
              @if (areaPath()) {
                <path [attr.d]="areaPath()" fill="url(#balanceAreaGradD3)" class="area-shape" />
              }

              @if (linePath()) {
                <path
                  [attr.d]="linePath()"
                  fill="none"
                  [attr.stroke]="lineColor()"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  filter="url(#lineGlow)"
                  class="line-stroke"
                />
              }

              <!-- FOCO EN HOVER PARA BALANCE -->
              @if (hoveredPoint(); as hp) {
                <line
                  [attr.x1]="hp.x"
                  [attr.y1]="margins.top"
                  [attr.x2]="hp.x"
                  [attr.y2]="height - margins.bottom"
                  class="crosshair-guide"
                />
                <circle
                  [attr.cx]="hp.x"
                  [attr.cy]="hp.y"
                  r="7"
                  [attr.fill]="lineColor()"
                  fill-opacity="0.25"
                  class="hover-pulse-ring"
                />
                <circle
                  [attr.cx]="hp.x"
                  [attr.cy]="hp.y"
                  r="4.5"
                  [attr.fill]="focalFill()"
                  [attr.stroke]="focalStroke()"
                  stroke-width="2.5"
                  class="hover-focal-point"
                />
              }
            }

            <!-- MODO 2: INGRESOS VS GASTOS (DOS LÍNEAS + ÁREAS) -->
            @if (mode() === 'income-expense') {
              <!-- Áreas -->
              @if (incomeAreaPath()) {
                <path [attr.d]="incomeAreaPath()" fill="url(#incomeAreaGradD3)" class="area-shape" />
              }
              @if (expenseAreaPath()) {
                <path [attr.d]="expenseAreaPath()" fill="url(#expenseAreaGradD3)" class="area-shape" />
              }

              <!-- Línea Ingresos -->
              @if (incomeLinePath()) {
                <path
                  [attr.d]="incomeLinePath()"
                  fill="none"
                  stroke="#10b981"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  filter="url(#incomeLineGlow)"
                  class="line-stroke"
                />
              }

              <!-- Línea Gastos -->
              @if (expenseLinePath()) {
                <path
                  [attr.d]="expenseLinePath()"
                  fill="none"
                  stroke="#ef4444"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  filter="url(#expenseLineGlow)"
                  class="line-stroke"
                />
              }

              <!-- FOCO EN HOVER PARA INGRESOS VS GASTOS -->
              @if (hoveredDualPoint(); as hdp) {
                <line
                  [attr.x1]="hdp.x"
                  [attr.y1]="margins.top"
                  [attr.x2]="hdp.x"
                  [attr.y2]="height - margins.bottom"
                  class="crosshair-guide"
                />

                <!-- Punto Ingresos (Verde) -->
                <circle
                  [attr.cx]="hdp.x"
                  [attr.cy]="hdp.incomeY"
                  r="5"
                  fill="#ffffff"
                  stroke="#10b981"
                  stroke-width="2.5"
                  class="hover-focal-point"
                />

                <!-- Punto Gastos (Rojo) -->
                <circle
                  [attr.cx]="hdp.x"
                  [attr.cy]="hdp.expenseY"
                  r="5"
                  fill="#ffffff"
                  stroke="#ef4444"
                  stroke-width="2.5"
                  class="hover-focal-point"
                />
              }
            }
          </svg>

          <!-- TOOLTIP FLOTANTE INTERACTIVO: BALANCE -->
          @if (mode() === 'balance' && hoveredPoint(); as hp) {
            <div
              class="d3-tooltip-card"
              [style.left.px]="hp.tooltipX"
              [style.top.px]="hp.tooltipY">
              <div class="tooltip-header">{{ hp.dateFormatted }}</div>
              <div class="tooltip-body">
                <span class="tooltip-label">Saldo Acumulado:</span>
                <span class="tooltip-value tabular-nums" [class.is-negative]="hp.value < 0">
                  {{ currencySymbol() }}{{ hp.value | number:'1.0-2':'es' }}
                </span>
              </div>
            </div>
          }

          <!-- TOOLTIP FLOTANTE INTERACTIVO: INGRESOS VS GASTOS -->
          @if (mode() === 'income-expense' && hoveredDualPoint(); as hdp) {
            <div
              class="d3-tooltip-card dual-tooltip"
              [style.left.px]="hdp.tooltipX"
              [style.top.px]="hdp.tooltipY">
              <div class="tooltip-header">{{ hdp.dateFormatted }}</div>
              <div class="tooltip-dual-body">
                <div class="tooltip-dual-row">
                  <span class="dual-label income-label">
                    <span class="bullet income"></span> Ingresos:
                  </span>
                  <span class="dual-val income-val tabular-nums">
                    +{{ currencySymbol() }}{{ hdp.income | number:'1.0-2':'es' }}
                  </span>
                </div>
                <div class="tooltip-dual-row">
                  <span class="dual-label expense-label">
                    <span class="bullet expense"></span> Gastos:
                  </span>
                  <span class="dual-val expense-val tabular-nums">
                    -{{ currencySymbol() }}{{ hdp.expense | number:'1.0-2':'es' }}
                  </span>
                </div>
                <div class="tooltip-divider"></div>
                <div class="tooltip-dual-row net-row">
                  <span class="dual-label">Flujo Neto:</span>
                  <span class="dual-val tabular-nums" [class.positive]="(hdp.income - hdp.expense) >= 0" [class.negative]="(hdp.income - hdp.expense) < 0">
                    {{ (hdp.income - hdp.expense) >= 0 ? '+' : '-' }}{{ currencySymbol() }}{{ ((hdp.income - hdp.expense) >= 0 ? (hdp.income - hdp.expense) : -(hdp.income - hdp.expense)) | number:'1.0-2':'es' }}
                  </span>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .balance-chart-root {
      position: relative;
      width: 100%;
      height: 330px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-balance-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      text-align: center;

      .empty-icon-wrap {
        width: 64px;
        height: 64px;
        margin-bottom: 12px;
      }

      .empty-svg-icon {
        width: 100%;
        height: 100%;
      }

      .empty-title {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--color-navy);
        margin: 0 0 4px 0;
      }

      .empty-desc {
        font-size: 0.8rem;
        color: var(--color-slate-muted);
      }
    }

    .chart-canvas-container {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .chart-dual-legend {
      position: absolute;
      top: 4px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 5;
      background: var(--color-surface);
      padding: 3px 8px;
      border-radius: 8px;
      border: 1px solid var(--color-border);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

      .legend-badge {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 0.725rem;
        font-weight: 700;

        &.income {
          color: #059669;
          html.dark & { color: #34d399; }
        }

        &.expense {
          color: #dc2626;
          html.dark & { color: #f87171; }
        }

        .legend-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;

          &.income-indicator {
            background-color: #10b981;
          }

          &.expense-indicator {
            background-color: #ef4444;
          }
        }
      }
    }

    .d3-area-svg {
      width: 100%;
      height: 100%;
      display: block;
      cursor: crosshair;

      .grid-line {
        stroke: var(--color-border);
        stroke-dasharray: 4 4;
        stroke-width: 1;
        transition: stroke 0.2s ease;
      }

      .y-axis-label {
        font-size: 10px;
        font-weight: 600;
        fill: var(--color-slate-muted);
        font-family: inherit;
        transition: fill 0.2s ease;
      }

      .x-axis-label {
        font-size: 10px;
        font-weight: 600;
        fill: var(--color-slate-muted);
        font-family: inherit;
        transition: fill 0.2s ease;
      }

      .line-stroke {
        transition: stroke 0.2s ease;
      }

      .crosshair-guide {
        stroke: var(--color-blue-primary);
        stroke-width: 1;
        stroke-dasharray: 3 3;
        opacity: 0.6;
      }

      .hover-pulse-ring {
        animation: pulseRing 1.5s infinite ease-out;
      }

      .hover-focal-point {
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
      }
    }

    @keyframes pulseRing {
      0% { r: 6; opacity: 0.8; }
      50% { r: 10; opacity: 0.2; }
      100% { r: 6; opacity: 0.8; }
    }

    .d3-tooltip-card {
      position: absolute;
      pointer-events: none;
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 8px 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
      z-index: 20;
      transform: translate(-50%, -120%);
      transition: left 0.08s ease-out, top 0.08s ease-out;
      min-width: 130px;

      &.dual-tooltip {
        min-width: 170px;
      }

      .tooltip-header {
        font-size: 0.725rem;
        font-weight: 600;
        color: #94a3b8;
        margin-bottom: 5px;
        text-transform: capitalize;
      }

      .tooltip-body {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .tooltip-label {
          font-size: 0.7rem;
          color: #cbd5e1;
        }

        .tooltip-value {
          font-size: 0.875rem;
          font-weight: 800;
          color: #ffffff;

          &.is-negative {
            color: #f87171;
          }
        }
      }

      .tooltip-dual-body {
        display: flex;
        flex-direction: column;
        gap: 4px;

        .tooltip-dual-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 0.775rem;

          .dual-label {
            display: flex;
            align-items: center;
            gap: 5px;
            color: #cbd5e1;
            font-weight: 500;

            .bullet {
              width: 6px;
              height: 6px;
              border-radius: 50%;

              &.income { background-color: #10b981; }
              &.expense { background-color: #ef4444; }
            }
          }

          .dual-val {
            font-weight: 700;

            &.income-val { color: #34d399; }
            &.expense-val { color: #f87171; }

            &.positive { color: #34d399; }
            &.negative { color: #f87171; }
          }

          &.net-row {
            margin-top: 2px;
            font-weight: 700;
            color: #ffffff;
          }
        }

        .tooltip-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
          margin: 3px 0;
        }
      }
    }
  `]
})
export class BalanceAreaChart {
  private readonly themeService = inject(ThemeService);

  readonly dates = input<string[]>([]);
  readonly values = input<number[]>([]);
  readonly incomes = input<number[]>([]);
  readonly expenses = input<number[]>([]);
  readonly mode = input<'balance' | 'income-expense'>('balance');
  readonly currencySymbol = input<string>('$');
  readonly timeframe = input<string>('30d');

  readonly isDark = computed(() => this.themeService.isDarkMode());

  // Colores dinámicos según el tema
  readonly lineColor = computed(() => this.isDark() ? '#38bdf8' : '#2563eb');
  readonly gradTopColor = computed(() => this.isDark() ? '#38bdf8' : '#2563eb');
  readonly gradMidColor = computed(() => this.isDark() ? '#1e3a8a' : '#3b82f6');
  readonly gradTopOpacity = computed(() => this.isDark() ? 0.36 : 0.28);
  readonly focalStroke = computed(() => this.isDark() ? '#38bdf8' : '#2563eb');
  readonly focalFill = computed(() => this.isDark() ? '#0f172a' : '#ffffff');

  readonly svgElement = viewChild<ElementRef<SVGSVGElement>>('svgElement');
  readonly chartRoot = viewChild<ElementRef<HTMLDivElement>>('chartRoot');

  readonly width = 640;
  readonly height = 260;
  readonly margins = { top: 24, right: 24, bottom: 32, left: 62 };

  readonly hoveredPoint = signal<{
    x: number;
    y: number;
    tooltipX: number;
    tooltipY: number;
    dateFormatted: string;
    value: number;
  } | null>(null);

  readonly hoveredDualPoint = signal<{
    x: number;
    incomeY: number;
    expenseY: number;
    tooltipX: number;
    tooltipY: number;
    dateFormatted: string;
    income: number;
    expense: number;
  } | null>(null);

  // 1. Puntos para modo Balance
  private readonly balancePoints = computed<BalancePoint[]>(() => {
    const d = this.dates();
    const v = this.values();
    if (d.length === 0 || v.length === 0) return [];

    const len = Math.min(d.length, v.length);
    const pts: BalancePoint[] = [];
    for (let i = 0; i < len; i++) {
      pts.push({ index: i, date: d[i], value: Number(v[i]) || 0 });
    }
    return pts;
  });

  // 2. Puntos para modo Ingresos vs Gastos
  private readonly dualPoints = computed<IncomeExpensePoint[]>(() => {
    const d = this.dates();
    const inc = this.incomes();
    const exp = this.expenses();
    if (d.length === 0) return [];

    const len = Math.min(d.length, Math.max(inc.length, exp.length));
    const pts: IncomeExpensePoint[] = [];
    for (let i = 0; i < len; i++) {
      pts.push({
        index: i,
        date: d[i],
        income: Number(inc[i]) || 0,
        expense: Number(exp[i]) || 0
      });
    }
    return pts;
  });

  // Escala X común
  private readonly xScale = computed(() => {
    const count = this.dates().length;
    const maxIdx = count > 1 ? count - 1 : 1;
    return scaleLinear()
      .domain([0, maxIdx])
      .range([this.margins.left, this.width - this.margins.right]);
  });

  // Escala Y adaptada según el modo
  private readonly yScale = computed(() => {
    if (this.mode() === 'income-expense') {
      const dual = this.dualPoints();
      if (dual.length === 0) {
        return scaleLinear().domain([0, 100]).range([this.height - this.margins.bottom, this.margins.top]);
      }
      const maxVal = Math.max(100, ...dual.map(p => Math.max(p.income, p.expense)));
      return scaleLinear()
        .domain([0, maxVal * 1.15])
        .range([this.height - this.margins.bottom, this.margins.top]);
    } else {
      const pts = this.balancePoints();
      if (pts.length === 0) {
        return scaleLinear().domain([0, 100]).range([this.height - this.margins.bottom, this.margins.top]);
      }

      const vals = pts.map(p => p.value);
      let min = Math.min(...vals);
      let max = Math.max(...vals);

      if (min === max) {
        min -= 1000;
        max += 1000;
      } else {
        const padding = (max - min) * 0.15;
        min -= padding;
        max += padding;
      }

      return scaleLinear()
        .domain([min, max])
        .range([this.height - this.margins.bottom, this.margins.top]);
    }
  });

  // Trazados para MODO BALANCE
  readonly linePath = computed<string>(() => {
    if (this.mode() !== 'balance') return '';
    const pts = this.balancePoints();
    if (pts.length === 0) return '';

    const x = this.xScale();
    const y = this.yScale();

    const lineGen = line<BalancePoint>()
      .x(d => x(d.index))
      .y(d => y(d.value))
      .curve(curveMonotoneX);

    return lineGen(pts) || '';
  });

  readonly areaPath = computed<string>(() => {
    if (this.mode() !== 'balance') return '';
    const pts = this.balancePoints();
    if (pts.length === 0) return '';

    const x = this.xScale();
    const y = this.yScale();
    const baseline = this.height - this.margins.bottom;

    const areaGen = area<BalancePoint>()
      .x(d => x(d.index))
      .y0(baseline)
      .y1(d => y(d.value))
      .curve(curveMonotoneX);

    return areaGen(pts) || '';
  });

  // Trazados para MODO INGRESOS VS GASTOS
  readonly incomeLinePath = computed<string>(() => {
    if (this.mode() !== 'income-expense') return '';
    const pts = this.dualPoints();
    if (pts.length === 0) return '';

    const x = this.xScale();
    const y = this.yScale();

    const lineGen = line<IncomeExpensePoint>()
      .x(d => x(d.index))
      .y(d => y(d.income))
      .curve(curveMonotoneX);

    return lineGen(pts) || '';
  });

  readonly incomeAreaPath = computed<string>(() => {
    if (this.mode() !== 'income-expense') return '';
    const pts = this.dualPoints();
    if (pts.length === 0) return '';

    const x = this.xScale();
    const y = this.yScale();
    const baseline = this.height - this.margins.bottom;

    const areaGen = area<IncomeExpensePoint>()
      .x(d => x(d.index))
      .y0(baseline)
      .y1(d => y(d.income))
      .curve(curveMonotoneX);

    return areaGen(pts) || '';
  });

  readonly expenseLinePath = computed<string>(() => {
    if (this.mode() !== 'income-expense') return '';
    const pts = this.dualPoints();
    if (pts.length === 0) return '';

    const x = this.xScale();
    const y = this.yScale();

    const lineGen = line<IncomeExpensePoint>()
      .x(d => x(d.index))
      .y(d => y(d.expense))
      .curve(curveMonotoneX);

    return lineGen(pts) || '';
  });

  readonly expenseAreaPath = computed<string>(() => {
    if (this.mode() !== 'income-expense') return '';
    const pts = this.dualPoints();
    if (pts.length === 0) return '';

    const x = this.xScale();
    const y = this.yScale();
    const baseline = this.height - this.margins.bottom;

    const areaGen = area<IncomeExpensePoint>()
      .x(d => x(d.index))
      .y0(baseline)
      .y1(d => y(d.expense))
      .curve(curveMonotoneX);

    return areaGen(pts) || '';
  });

  // Ticks Eje Y
  readonly yTicks = computed<YAxisTick[]>(() => {
    const y = this.yScale();
    const rawTicks = y.ticks(5);

    return rawTicks.map(val => ({
      y: y(val),
      formatted: this.formatCurrencyCompact(val)
    }));
  });

  // Ticks Eje X
  readonly xTicks = computed<XAxisTick[]>(() => {
    const datesList = this.dates();
    const count = datesList.length;
    if (count === 0) return [];

    const x = this.xScale();
    const desiredTicks = Math.min(6, count);
    const step = Math.max(1, Math.floor((count - 1) / (desiredTicks - 1)));
    const ticks: XAxisTick[] = [];

    for (let i = 0; i < count; i += step) {
      ticks.push({
        x: x(i),
        label: this.formatDateLabel(datesList[i])
      });
    }

    const lastIdx = count - 1;
    if (ticks.length > 0 && ticks[ticks.length - 1].x !== x(lastIdx)) {
      if (ticks.length >= desiredTicks) {
        ticks.pop();
      }
      ticks.push({
        x: x(lastIdx),
        label: this.formatDateLabel(datesList[lastIdx])
      });
    }

    return ticks;
  });

  onPointerMove(event: MouseEvent): void {
    const svg = this.svgElement()?.nativeElement;
    const root = this.chartRoot()?.nativeElement;
    if (!svg || !root) return;

    const rect = svg.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const svgX = (mouseX / rect.width) * this.width;

    this.updateHoverFromSvgX(svgX, rect, root);
  }

  onTouchMove(event: TouchEvent): void {
    const svg = this.svgElement()?.nativeElement;
    const root = this.chartRoot()?.nativeElement;
    if (!svg || !root || event.touches.length === 0) return;

    const touch = event.touches[0];
    const rect = svg.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const svgX = (touchX / rect.width) * this.width;

    this.updateHoverFromSvgX(svgX, rect, root);
  }

  private updateHoverFromSvgX(svgX: number, svgRect: DOMRect, rootEl: HTMLElement): void {
    const count = this.dates().length;
    if (count === 0) return;

    const x = this.xScale();
    const y = this.yScale();

    let closestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < count; i++) {
      const ptX = x(i);
      const dist = Math.abs(ptX - svgX);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = i;
      }
    }

    const ptSvgX = x(closestIdx);
    const rootRect = rootEl.getBoundingClientRect();
    const screenX = svgRect.left + (ptSvgX / this.width) * svgRect.width;

    if (this.mode() === 'income-expense') {
      const dual = this.dualPoints();
      if (!dual[closestIdx]) return;
      const pt = dual[closestIdx];

      const incY = y(pt.income);
      const expY = y(pt.expense);
      const focusY = Math.min(incY, expY);

      const screenY = svgRect.top + (focusY / this.height) * svgRect.height;
      const tooltipX = screenX - rootRect.left;
      const tooltipY = Math.max(10, screenY - rootRect.top);

      this.hoveredDualPoint.set({
        x: ptSvgX,
        incomeY: incY,
        expenseY: expY,
        tooltipX,
        tooltipY,
        dateFormatted: this.formatDateFull(pt.date),
        income: pt.income,
        expense: pt.expense
      });
      this.hoveredPoint.set(null);
    } else {
      const pts = this.balancePoints();
      if (!pts[closestIdx]) return;
      const pt = pts[closestIdx];

      const ptSvgY = y(pt.value);
      const screenY = svgRect.top + (ptSvgY / this.height) * svgRect.height;
      const tooltipX = screenX - rootRect.left;
      const tooltipY = Math.max(10, screenY - rootRect.top);

      this.hoveredPoint.set({
        x: ptSvgX,
        y: ptSvgY,
        tooltipX,
        tooltipY,
        dateFormatted: this.formatDateFull(pt.date),
        value: pt.value
      });
      this.hoveredDualPoint.set(null);
    }
  }

  onPointerLeave(): void {
    this.hoveredPoint.set(null);
    this.hoveredDualPoint.set(null);
  }

  private formatCurrencyCompact(val: number): string {
    const absVal = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    const sym = this.currencySymbol();

    if (absVal >= 1_000_000) {
      return `${sign}${sym}${(absVal / 1_000_000).toFixed(1)}M`;
    }
    if (absVal >= 1_000) {
      return `${sign}${sym}${(absVal / 1_000).toFixed(0)}k`;
    }
    return `${sign}${sym}${absVal.toFixed(0)}`;
  }

  private formatDateLabel(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    } catch {
      return dateStr;
    }
  }

  private formatDateFull(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }
}
