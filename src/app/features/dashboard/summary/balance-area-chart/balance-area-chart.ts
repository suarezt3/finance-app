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
  imports: [CommonModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="balance-chart-root" #chartRoot>
      @if (dates().length === 0 || values().length === 0) {
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
          <p class="empty-title">Sin historial de balance</p>
          <span class="empty-desc">No se registran movimientos en el periodo o cuenta seleccionada.</span>
        </div>
      } @else {
        <div class="chart-canvas-container">
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
              <!-- Gradiente Slate Navy & Financial Blue reactivo para el área -->
              <linearGradient id="balanceAreaGradD3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" [attr.stop-color]="gradTopColor()" [attr.stop-opacity]="gradTopOpacity()" />
                <stop offset="65%" [attr.stop-color]="gradMidColor()" stop-opacity="0.08" />
                <stop offset="100%" [attr.stop-color]="gradTopColor()" stop-opacity="0.00" />
              </linearGradient>

              <!-- Filtro de sombra para la línea -->
              <filter id="lineGlow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" [attr.flood-color]="lineColor()" flood-opacity="0.3" />
              </filter>
            </defs>

            <!-- 1. RETÍCULA HORIZONTAL Y EJE Y -->
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

            <!-- 2. EJE X (FECHAS) -->
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

            <!-- 3. ÁREA CON GRADIENTE D3 -->
            @if (areaPath()) {
              <path [attr.d]="areaPath()" fill="url(#balanceAreaGradD3)" class="area-shape" />
            }

            <!-- 4. LÍNEA PRINCIPAL D3 -->
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

            <!-- 5. CROSSHAIR Y PUNTO EN HOVER -->
            @if (hoveredPoint(); as hp) {
              <!-- Línea vertical de guía -->
              <line
                [attr.x1]="hp.x"
                [attr.y1]="margins.top"
                [attr.x2]="hp.x"
                [attr.y2]="height - margins.bottom"
                class="crosshair-guide"
              />

              <!-- Anillo exterior de foco -->
              <circle
                [attr.cx]="hp.x"
                [attr.cy]="hp.y"
                r="7"
                [attr.fill]="lineColor()"
                fill-opacity="0.25"
                class="hover-pulse-ring"
              />

              <!-- Punto focal central -->
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
          </svg>

          <!-- TOOLTIP FLOTANTE INTERACTIVO -->
          @if (hoveredPoint(); as hp) {
            <div
              class="d3-tooltip-card"
              [style.left.px]="hp.tooltipX"
              [style.top.px]="hp.tooltipY">
              <div class="tooltip-header">{{ hp.dateFormatted }}</div>
              <div class="tooltip-body">
                <span class="tooltip-label">Saldo Acumulado:</span>
                <span class="tooltip-value tabular-nums" [class.is-negative]="hp.value < 0">
                  \${{ hp.value | number:'1.0-2':'es' }}
                </span>
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
        font-family: 'Inter', sans-serif;
        transition: fill 0.2s ease;
      }

      .x-axis-label {
        font-size: 10.5px;
        font-weight: 600;
        fill: var(--color-slate-muted);
        font-family: 'Inter', sans-serif;
        transition: fill 0.2s ease;
      }

      .area-shape {
        pointer-events: none;
      }

      .line-stroke {
        pointer-events: none;
        transition: stroke 0.2s ease;
      }

      .crosshair-guide {
        stroke: var(--color-slate-muted);
        stroke-width: 1;
        stroke-dasharray: 3 3;
        pointer-events: none;
      }

      .hover-pulse-ring {
        pointer-events: none;
      }

      .hover-focal-point {
        pointer-events: none;
        filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.3));
        transition: fill 0.2s ease, stroke 0.2s ease;
      }
    }

    // TOOLTIP FLOTANTE
    .d3-tooltip-card {
      position: absolute;
      transform: translate(-50%, -115%);
      background-color: #020617;
      border: 1px solid #1e293b;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 4px 10px -2px rgba(0, 0, 0, 0.4);
      border-radius: 8px;
      padding: 8px 12px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 20;
      transition: left 0.05s ease, top 0.05s ease;

      &::after {
        content: '';
        position: absolute;
        bottom: -5px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 5px 5px 0;
        border-style: solid;
        border-color: #020617 transparent transparent transparent;
      }

      .tooltip-header {
        font-size: 0.7rem;
        font-weight: 600;
        color: #94a3b8;
        text-transform: capitalize;
        margin-bottom: 2px;
      }

      .tooltip-body {
        display: flex;
        align-items: center;
        gap: 6px;

        .tooltip-label {
          font-size: 0.725rem;
          color: #cbd5e1;
          font-weight: 500;
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
    }
  `]
})
export class BalanceAreaChart {
  private readonly themeService = inject(ThemeService);

  readonly dates = input<string[]>([]);
  readonly values = input<number[]>([]);
  readonly timeframe = input<string>('30d');

  readonly isDark = computed(() => this.themeService.isDarkMode());

  // Colores dinámicos según el modo
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
  readonly margins = { top: 20, right: 24, bottom: 32, left: 62 };

  readonly hoveredPoint = signal<{
    x: number;
    y: number;
    tooltipX: number;
    tooltipY: number;
    dateFormatted: string;
    value: number;
  } | null>(null);

  // Puntos normalizados
  private readonly points = computed<BalancePoint[]>(() => {
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

  // Escala X
  private readonly xScale = computed(() => {
    const pts = this.points();
    const count = pts.length;
    const maxIdx = count > 1 ? count - 1 : 1;
    return scaleLinear()
      .domain([0, maxIdx])
      .range([this.margins.left, this.width - this.margins.right]);
  });

  // Escala Y
  private readonly yScale = computed(() => {
    const pts = this.points();
    if (pts.length === 0) return scaleLinear().domain([0, 100]).range([this.height - this.margins.bottom, this.margins.top]);

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
  });

  // Generador de Trazado de Línea D3
  readonly linePath = computed<string>(() => {
    const pts = this.points();
    if (pts.length === 0) return '';

    const x = this.xScale();
    const y = this.yScale();

    const lineGen = line<BalancePoint>()
      .x(d => x(d.index))
      .y(d => y(d.value))
      .curve(curveMonotoneX);

    return lineGen(pts) || '';
  });

  // Generador de Trazado de Área D3
  readonly areaPath = computed<string>(() => {
    const pts = this.points();
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

  // Ticks y Etiquetas del Eje Y
  readonly yTicks = computed<YAxisTick[]>(() => {
    const y = this.yScale();
    const rawTicks = y.ticks(5);

    return rawTicks.map(val => ({
      y: y(val),
      formatted: this.formatCurrencyCompact(val)
    }));
  });

  // Ticks y Etiquetas del Eje X
  readonly xTicks = computed<XAxisTick[]>(() => {
    const pts = this.points();
    if (pts.length === 0) return [];

    const x = this.xScale();
    const count = pts.length;

    const desiredTicks = Math.min(6, count);
    const step = Math.max(1, Math.floor((count - 1) / (desiredTicks - 1)));
    const ticks: XAxisTick[] = [];

    for (let i = 0; i < count; i += step) {
      ticks.push({
        x: x(pts[i].index),
        label: this.formatDateLabel(pts[i].date)
      });
    }

    const lastIdx = count - 1;
    if (ticks.length > 0 && ticks[ticks.length - 1].x !== x(pts[lastIdx].index)) {
      if (ticks.length >= desiredTicks) {
        ticks.pop();
      }
      ticks.push({
        x: x(pts[lastIdx].index),
        label: this.formatDateLabel(pts[lastIdx].date)
      });
    }

    return ticks;
  });

  // Manejo de eventos puntero para Tooltip reactivo
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
    const pts = this.points();
    if (pts.length === 0) return;

    const x = this.xScale();
    const y = this.yScale();

    let closestPt = pts[0];
    let minDistance = Infinity;

    for (const pt of pts) {
      const ptX = x(pt.index);
      const dist = Math.abs(ptX - svgX);
      if (dist < minDistance) {
        minDistance = dist;
        closestPt = pt;
      }
    }

    const ptSvgX = x(closestPt.index);
    const ptSvgY = y(closestPt.value);

    const rootRect = rootEl.getBoundingClientRect();
    const screenX = svgRect.left + (ptSvgX / this.width) * svgRect.width;
    const screenY = svgRect.top + (ptSvgY / this.height) * svgRect.height;

    const tooltipX = screenX - rootRect.left;
    const tooltipY = screenY - rootRect.top;

    this.hoveredPoint.set({
      x: ptSvgX,
      y: ptSvgY,
      tooltipX,
      tooltipY,
      dateFormatted: this.formatDateFull(closestPt.date),
      value: closestPt.value
    });
  }

  onPointerLeave(): void {
    this.hoveredPoint.set(null);
  }

  private formatCurrencyCompact(val: number): string {
    const absVal = Math.abs(val);
    const sign = val < 0 ? '-' : '';

    if (absVal >= 1_000_000) {
      return `${sign}$${(absVal / 1_000_000).toFixed(1)}M`;
    }
    if (absVal >= 1_000) {
      return `${sign}$${(absVal / 1_000).toFixed(0)}k`;
    }
    return `${sign}$${absVal.toFixed(0)}`;
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
