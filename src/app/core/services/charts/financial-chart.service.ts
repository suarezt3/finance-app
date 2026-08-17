
import { Injectable } from '@angular/core';
import { EChartsOption } from 'echarts';

@Injectable({
  providedIn: 'root'
})
export class FinancialChartService {

  /**
   * Genera la configuración (EChartsOption) para el gráfico de balance histórico.
   * Centralizamos aquí los colores, ejes y comportamiento visual.
   */
  getBalanceHistoryOptions(dates: string[], values: number[]): EChartsOption {
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      grid: {
        left: '3%', right: '4%', bottom: '3%', containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { lineStyle: { color: '#d9d9d9' } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: '${value}' },
        splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } }
      },
      series: [
        {
          name: 'Saldo',
          type: 'line',
          smooth: true, // Hace que la línea sea curva en lugar de recta
          areaStyle: {
            opacity: 0.2,
            color: '#1890ff' // Azul corporativo de NG-Zorro
          },
          itemStyle: { color: '#1890ff' },
          data: values
        }
      ]
    };
  }
/**
   * Configuración para el gráfico de barras horizontales (Top Gastos)
   * Aislamos esta lógica del componente para mantenerlo enfocado en la vista.
   */
  getExpensesByCategoryOptions(categories: string[], values: number[]): EChartsOption {
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const val = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(params[0].value);
          return `${params[0].name}<br/><strong>${val}</strong>`;
        }
      },
      grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => `$${value / 1000}k` // Formato compacto para evitar superposición
        }
      },
      yAxis: {
        type: 'category',
        data: categories,
        inverse: true, // Invierte el eje para que el valor mayor quede en la parte superior
        axisLabel: { width: 100, overflow: 'truncate' }
      },
      series: [
        {
          name: 'Gastos',
          type: 'bar',
          data: values,
          itemStyle: {
            color: '#cf1322',
            borderRadius: [0, 4, 4, 0] // Bordes redondeados para un look moderno
          },
          label: {
            show: true,
            position: 'right',
            formatter: (params: any) => `$${new Intl.NumberFormat('es-CO').format(params.value)}`
          }
        }
      ]
    };
  }


}
