
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
}
