import { Injectable } from '@angular/core';

export interface ScannedReceiptData {
  merchant: string;
  amount: number;
  date: string;
  type: 'EXPENSE' | 'INCOME';
  category_hint: string;
  payment_method_hint: string;
  description: string;
  tax_amount: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class ReceiptScannerService {
  /**
   * Envía la imagen capturada al backend para su análisis multimodal con Gemini
   */
  async scanReceipt(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<ScannedReceiptData> {
    const endpoint = '/api/scan-receipt';

    try {
      let customApiKey = '';
      if (typeof window !== 'undefined') {
        customApiKey = localStorage.getItem('custom_gemini_api_key') || '';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (customApiKey && customApiKey.trim().length > 10) {
        headers['x-gemini-api-key'] = customApiKey.trim();
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageBase64,
          mimeType,
        }),
      });

      if (!response.ok) {
        let errMessage = `Error ${response.status}: no se pudo procesar la factura`;
        try {
          const errData = await response.json();
          if (errData?.error) errMessage = errData.error;
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      const res = await response.json();
      if (!res.success || !res.data) {
        throw new Error(res.error || 'No se obtuvieron datos de la factura.');
      }

      const raw = res.data;
      return {
        merchant: raw.merchant || 'Comercio',
        amount: typeof raw.amount === 'number' ? Math.abs(raw.amount) : parseFloat(raw.amount) || 0,
        date: raw.date || new Date().toISOString().split('T')[0],
        type: raw.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
        category_hint: raw.category_hint || 'General',
        payment_method_hint: raw.payment_method_hint || 'Desconocido',
        description: raw.description || (raw.merchant ? `Compra en ${raw.merchant}` : 'Comprobante'),
        tax_amount: typeof raw.tax_amount === 'number' ? raw.tax_amount : null,
      };
    } catch (error: any) {
      console.error('Error al escanear factura en ReceiptScannerService:', error);
      throw error;
    }
  }

  /**
   * Encuentra la categoría del catálogo del usuario que mejor coincida con la sugerencia de Gemini
   */
  findBestMatchingCategory(hint: string, categories: Array<{ id: string; name: string }>): string | null {
    if (!categories.length) return null;
    const cleanHint = hint.toLowerCase().trim();

    // 1. Coincidencia exacta
    const exact = categories.find(c => c.name.toLowerCase().trim() === cleanHint);
    if (exact) return exact.id;

    // 2. Coincidencia parcial o por palabras clave
    const partial = categories.find(c => {
      const name = c.name.toLowerCase().trim();
      return name.includes(cleanHint) || cleanHint.includes(name);
    });
    if (partial) return partial.id;

    // 3. Mapeo semántico de términos comunes
    const semanticMap: Record<string, string[]> = {
      alimentacion: ['comida', 'restaurante', 'alimentos', 'supermercado', 'mercado', 'cafeteria', 'panaderia'],
      supermercado: ['mercado', 'alimentos', 'tienda', 'abarrotes'],
      transporte: ['gasolina', 'combustible', 'uber', 'taxi', 'peaje', 'bus', 'pasaje', 'metro', 'movilidad'],
      servicios: ['luz', 'agua', 'gas', 'internet', 'telefono', 'factura', 'energia'],
      salud: ['farmacia', 'medicina', 'doctor', 'hospital', 'drogueria', 'optica'],
      entretenimiento: ['cine', 'ocio', 'juegos', 'streaming', 'netflix', 'diversion'],
      hogar: ['vivienda', 'muebles', 'arriendo', 'alquiler', 'limpieza', 'reparacion'],
      compras: ['ropa', 'calzado', 'tienda', 'tecnologia', 'electronica'],
    };

    for (const [key, synonyms] of Object.entries(semanticMap)) {
      if (cleanHint.includes(key) || synonyms.some(s => cleanHint.includes(s))) {
        const found = categories.find(c => {
          const cName = c.name.toLowerCase();
          return cName.includes(key) || synonyms.some(s => cName.includes(s));
        });
        if (found) return found.id;
      }
    }

    // Si no hay match, retornar la primera categoría por defecto si existe
    return categories[0]?.id || null;
  }
}
