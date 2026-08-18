// src/app/core/services/export.service.ts
import { Injectable } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TransactionWithDetails } from '../models/transaction.model';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  constructor(private datePipe: DatePipe) {}

  /**
   * Genera y descarga un archivo CSV basado en las transacciones proporcionadas.
   */
  exportTransactionsToCSV(transactions: TransactionWithDetails[], filename: string = 'transacciones'): void {
    if (!transactions || transactions.length === 0) return;

    // 1. Definir las cabeceras del CSV
    const headers = ['Fecha', 'Descripción', 'Categoría', 'Método de Pago', 'Naturaleza', 'Monto'];

    // 2. Mapear los datos respetando las cabeceras
    const rows = transactions.map(tx => {
      const date = this.datePipe.transform(tx.date, 'dd/MM/yyyy') || '';
      // Envolvemos en comillas dobles para evitar que las comas en la descripción rompan el CSV
      const description = `"${(tx.description || '').replace(/"/g, '""')}"`;
      const category = `"${tx.categories?.name || 'N/A'}"`;
      const method = `"${tx.payment_methods?.name || 'N/A'}"`;
      const type = tx.type === 'INCOME' ? 'Ingreso' : 'Gasto';
      // Formato numérico crudo sin separadores de miles para que Excel lo lea como número
      const amount = tx.amount.toString();

      return [date, description, category, method, type, amount].join(',');
    });

    // 3. Unir cabeceras y filas con saltos de línea (\n)
    // Añadimos el BOM (\uFEFF) al inicio para que Excel reconozca correctamente los acentos (UTF-8)
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');

    // 4. Crear el Blob y forzar la descarga en el navegador
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Generar nombre de archivo dinámico con la fecha actual
    const today = this.datePipe.transform(new Date(), 'yyyyMMdd_HHmm');
    link.href = url;
    link.download = `${filename}_${today}.csv`;
    link.click();

    window.URL.revokeObjectURL(url);
  }
}
