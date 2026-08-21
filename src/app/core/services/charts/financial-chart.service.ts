// src/app/core/services/charts/financial-chart.service.ts
import { Injectable } from '@angular/core';
import { EChartsOption } from 'echarts';

interface ChartFormatterParams {
  name: string;
  value: number;
  dataIndex: number;
  seriesName?: string;
  [key: string]: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class FinancialChartService {

  getBalanceHistoryOptions(dates: string[], values: number[], isMobile: boolean): EChartsOption {
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      grid: {
        left: isMobile ? '2%' : '3%',
        right: isMobile ? '5%' : '4%',
        bottom: isMobile ? '8%' : '3%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: '#d9d9d9' } },
        axisLabel: {
          hideOverlap: true,
          rotate: isMobile ? 45 : 0,
          fontSize: isMobile ? 10 : 12,
          color: '#8c8c8c'
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: '${value}',
          fontSize: isMobile ? 10 : 12
        },
        splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } }
      },
      series: [
        {
          name: 'Saldo',
          type: 'line',
          smooth: true,
          areaStyle: {
            opacity: 0.2,
            color: '#1890ff'
          },
          itemStyle: { color: '#1890ff' },
          data: values
        }
      ]
    };
  }

  getExpensesByCategoryOptions(categories: string[], values: number[], isMobile: boolean): EChartsOption {
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const paramObj = (params as ChartFormatterParams[])[0];
          const val = new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
          }).format(paramObj.value);

          return `${paramObj.name}<br/><strong>${val}</strong>`;
        }
      },
      grid: {
        left: isMobile ? '0%' : '3%',
        right: isMobile ? '12%' : '8%',
        top: isMobile ? '12%' : '5%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => `$${value / 1000}k`,
          fontSize: isMobile ? 10 : 12
        },
        splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } }
      },
      yAxis: {
        type: 'category',
        data: categories,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: !isMobile },
        z: 10,
        axisLabel: {
          inside: isMobile,
          verticalAlign: isMobile ? 'bottom' : 'middle',

          // FIX UX 1: Reducimos de 28 a 16 para anclar el texto a su barra correspondiente
          padding: isMobile ? [0, 0, 16, 0] : 0,

          width: isMobile ? 250 : 100,
          overflow: 'truncate',
          color: '#262626',
          fontWeight: isMobile ? 600 : 400,
          textShadowColor: '#ffffff',
          textShadowBlur: 4,
          textShadowOffsetX: 1,
          textShadowOffsetY: 1
        }
      },
      series: [
        {
          name: 'Gastos',
          type: 'bar',
          data: values,
          itemStyle: {
            color: '#cf1322',
            borderRadius: [0, 4, 4, 0]
          },
          barWidth: isMobile ? '35%' : '60%',

          // FIX UX 2: Aumentamos la separación entre barras en móvil para dar respiro al texto
          barCategoryGap: isMobile ? '45%' : '20%',

          label: {
            show: true,
            position: 'right',
            fontSize: isMobile ? 10 : 12,
            fontWeight: 600,
            formatter: (params: unknown) => {
              const val = (params as ChartFormatterParams).value;
              return `$${new Intl.NumberFormat('es-CO', { notation: 'compact' }).format(val)}`;
            }
          }
        }
      ]
    };
  }
}
