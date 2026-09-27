// src/app/features/dashboard/summary/expenses-donut-chart/expenses-donut-chart.ts
import { Component, ChangeDetectionStrategy, input, signal, computed, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { pie, arc, PieArcDatum } from 'd3';
import { ThemeService } from '../../../../core/services/theme.service';

export interface ExpenseCategorySlice {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface ArcPathData {
  data: ExpenseCategorySlice;
  path: string;
  hoverPath: string;
  isHovered: boolean;
}

@Component({
  selector: 'app-expenses-donut-chart',
  imports: [CommonModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="donut-chart-wrapper">
      @if (categories().length === 0 || totalAmount() === 0) {
        <div class="empty-donut-state">
          <div class="empty-ring-illustration">
            <svg viewBox="0 0 160 160" class="empty-svg">
              <circle
                cx="80"
                cy="80"
                r="58"
                fill="none"
                [attr.stroke]="isDark() ? '#1e293b' : '#e2e8f0'"
                stroke-width="14"
                stroke-dasharray="6 6"
              />
            </svg>
          </div>
          <p class="empty-title">Sin gastos en este periodo</p>
          <span class="empty-sub">Registra un nuevo gasto o amplía el rango de fechas.</span>
        </div>
      } @else {
        <div class="donut-content-layout">
          <!-- DONUT SVG D3 -->
          <div class="svg-container">
            <svg
              viewBox="0 0 280 280"
              class="donut-svg"
              (mouseleave)="onMouseLeave()">
              <g transform="translate(140, 140)">
                <!-- Slices del Anillo D3 -->
                @for (item of arcPaths(); track item.data.name) {
                  <path
                    [attr.d]="activeItem()?.name === item.data.name ? item.hoverPath : item.path"
                    [attr.fill]="item.data.color"
                    class="donut-slice"
                    [class.is-dimmed]="activeItem() && activeItem()?.name !== item.data.name"
                    (mouseenter)="onSliceHover(item.data)"
                    (focus)="onSliceHover(item.data)"
                    tabindex="0"
                    [attr.aria-label]="item.data.name + ': $' + item.data.amount + ' (' + (item.data.percentage | number:'1.0-1':'es') + '%)'"
                  />
                }

                <!-- Centro Informativo Interactivo -->
                <circle
                  cx="0"
                  cy="0"
                  r="62"
                  [attr.fill]="centerCircleColor()"
                  [attr.stroke]="centerCircleStroke()"
                  stroke-width="1.5"
                  class="center-circle"
                />

                <g class="center-text-group">
                  <text
                    y="-16"
                    text-anchor="middle"
                    [attr.fill]="centerSublabelColor()"
                    class="center-sublabel">
                    {{ activeItem() ? activeItem()!.name : 'TOTAL GASTOS' }}
                  </text>

                  <text
                    y="10"
                    text-anchor="middle"
                    [attr.fill]="centerAmountColor()"
                    class="center-amount tabular-nums">
                    \${{ displayAmount() | number:'1.0-0':'es' }}
                  </text>

                  <text
                    y="28"
                    text-anchor="middle"
                    [attr.fill]="centerPercentageColor()"
                    class="center-percentage">
                    {{ activeItem() ? ((activeItem()!.percentage | number:'1.0-1':'es') + '% del total') : timeframeLabel() }}
                  </text>
                </g>
              </g>
            </svg>
          </div>

          <!-- LEYENDA LATERAL CON PORCENTAJES Y CIFRAS TABULARES -->
          <div class="donut-legend">
            <div class="legend-header">
              <span class="col-title">CATEGORÍA</span>
              <span class="col-pct">% TOTAL</span>
              <span class="col-amount">MONTO</span>
            </div>

            <div class="legend-items-list">
              @for (cat of categories(); track cat.name) {
                <div
                  class="legend-row"
                  [class.is-active]="activeItem()?.name === cat.name"
                  [class.is-dimmed]="activeItem() && activeItem()?.name !== cat.name"
                  (mouseenter)="onSliceHover(cat)"
                  (mouseleave)="onMouseLeave()">
                  <div class="category-meta">
                    <span class="color-dot" [style.backgroundColor]="cat.color"></span>
                    <span class="category-name" [title]="cat.name">{{ cat.name }}</span>
                  </div>

                  <span class="percentage-pill tabular-nums">
                    {{ cat.percentage | number:'1.0-1':'es' }}%
                  </span>

                  <span class="amount-val tabular-nums">
                    \${{ cat.amount | number:'1.0-2':'es' }}
                  </span>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .donut-chart-wrapper {
      width: 100%;
      height: 100%;
      min-height: 330px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .empty-donut-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      text-align: center;

      .empty-ring-illustration {
        width: 90px;
        height: 90px;
        margin-bottom: 12px;
      }

      .empty-title {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--color-navy);
        margin: 0 0 4px 0;
      }

      .empty-sub {
        font-size: 0.8rem;
        color: var(--color-slate-muted);
      }
    }

    .donut-content-layout {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      width: 100%;

      @media (max-width: 900px) {
        flex-direction: column;
        justify-content: center;
      }
    }

    .svg-container {
      flex: 0 0 240px;
      height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;

      @media (max-width: 900px) {
        flex: 0 0 220px;
        height: 220px;
      }
    }

    .donut-svg {
      width: 100%;
      height: 100%;
      overflow: visible;

      .donut-slice {
        cursor: pointer;
        outline: none;
        transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease, filter 0.2s ease;
        transform-origin: 0 0;

        &:hover,
        &:focus {
          filter: drop-shadow(0 4px 8px rgba(15, 23, 42, 0.35));
        }

        &.is-dimmed {
          opacity: 0.3;
        }
      }

      .center-circle {
        filter: drop-shadow(0 1px 3px rgba(15, 23, 42, 0.12));
        transition: fill 0.2s ease, stroke 0.2s ease;
      }

      .center-text-group {
        pointer-events: none;

        .center-sublabel {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-family: 'Inter', sans-serif;
          transition: fill 0.2s ease;
        }

        .center-amount {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.02em;
          font-family: 'Inter', sans-serif;
          transition: fill 0.2s ease;
        }

        .center-percentage {
          font-size: 9.5px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          transition: fill 0.2s ease;
        }
      }
    }

    // LEYENDA LATERAL
    .donut-legend {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;

      @media (max-width: 900px) {
        width: 100%;
      }

      .legend-header {
        display: grid;
        grid-template-columns: 1fr 60px 85px;
        gap: 8px;
        padding: 0 8px 6px;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--color-slate-muted);

        .col-pct {
          text-align: center;
        }

        .col-amount {
          text-align: right;
        }
      }

      .legend-items-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 250px;
        overflow-y: auto;
        padding-right: 2px;

        &::-webkit-scrollbar {
          width: 4px;
        }
        &::-webkit-scrollbar-thumb {
          background-color: var(--color-border);
          border-radius: 2px;
        }
      }

      .legend-row {
        display: grid;
        grid-template-columns: 1fr 60px 85px;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover,
        &.is-active {
          background-color: var(--color-surface-hover);
        }

        &.is-dimmed {
          opacity: 0.35;
        }

        .category-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;

          .color-dot {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            flex-shrink: 0;
          }

          .category-name {
            font-size: 0.8125rem;
            font-weight: 600;
            color: var(--color-navy);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }

        .percentage-pill {
          font-size: 0.725rem;
          font-weight: 700;
          color: var(--color-blue-primary);
          background-color: var(--color-blue-subtle);
          padding: 2px 6px;
          border-radius: 5px;
          text-align: center;
        }

        .amount-val {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--color-navy);
          text-align: right;
        }
      }
    }
  `]
})
export class ExpensesDonutChart {
  private readonly themeService = inject(ThemeService);

  readonly categories = input<ExpenseCategorySlice[]>([]);
  readonly totalAmount = input<number>(0);
  readonly timeframeLabel = input<string>('Últimos 30 días');

  readonly isDark = computed(() => this.themeService.isDarkMode());

  readonly activeItem = signal<ExpenseCategorySlice | null>(null);

  readonly displayAmount = computed(() => {
    const item = this.activeItem();
    return item ? item.amount : this.totalAmount();
  });

  // Colores dinámicos del núcleo central para modo claro / oscuro
  readonly centerCircleColor = computed(() => this.isDark() ? '#0f172a' : '#ffffff');
  readonly centerCircleStroke = computed(() => this.isDark() ? '#1e293b' : 'rgba(15, 23, 42, 0.06)');
  readonly centerSublabelColor = computed(() => this.isDark() ? '#94a3b8' : '#64748b');
  readonly centerAmountColor = computed(() => this.isDark() ? '#f8fafc' : '#0f172a');
  readonly centerPercentageColor = computed(() => this.isDark() ? '#38bdf8' : '#2563eb');

  // Generador de arcos D3
  readonly arcPaths = computed<ArcPathData[]>(() => {
    const cats = this.categories();
    if (cats.length === 0) return [];

    const pieGenerator = pie<ExpenseCategorySlice>()
      .value(d => d.amount)
      .sort(null)
      .padAngle(0.025);

    const normalArc = arc<PieArcDatum<ExpenseCategorySlice>>()
      .innerRadius(68)
      .outerRadius(102)
      .cornerRadius(4);

    const hoverArc = arc<PieArcDatum<ExpenseCategorySlice>>()
      .innerRadius(66)
      .outerRadius(110)
      .cornerRadius(5);

    const pieData = pieGenerator(cats);

    return pieData.map(d => ({
      data: d.data,
      path: normalArc(d) || '',
      hoverPath: hoverArc(d) || '',
      isHovered: false
    }));
  });

  onSliceHover(item: ExpenseCategorySlice): void {
    this.activeItem.set(item);
  }

  onMouseLeave(): void {
    this.activeItem.set(null);
  }
}
