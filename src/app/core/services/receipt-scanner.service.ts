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

        // Si el endpoint responde 404 y el usuario tiene configurada su clave en Configuración, ejecutar fallback directo
        if (response.status === 404 && customApiKey && customApiKey.length > 20) {
          try {
            return await this.scanReceiptDirectWithApiKey(imageBase64, mimeType, customApiKey);
          } catch (directErr: any) {
            console.warn('Fallback directo con Gemini SDK falló:', directErr);
            throw new Error(directErr?.message || errMessage);
          }
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

  /**
   * Fallback de emergencia en el cliente usando el SDK de Gemini cuando el servidor responde 404
   */
  private async scanReceiptDirectWithApiKey(
    imageBase64: string,
    mimeType: string,
    apiKey: string
  ): Promise<ScannedReceiptData> {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const prompt = `Analiza detenidamente esta imagen de factura, recibo o comprobante de pago.
Extrae los datos en formato JSON estructurado:
- merchant: Nombre comercial limpio (ej: Tiendas Ara, Dollarcity, D1, Éxito, etc.).
- amount: Monto total pagado como número puro (ej: 5150).
- date: Fecha ISO YYYY-MM-DD.
- type: 'EXPENSE' o 'INCOME'.
- category_hint: Categoría ("Supermercado", "Alimentación", "Hogar", "Compras", "Transporte", "Servicios", "Salud", "Entretenimiento", "Otros").
- payment_method_hint: Método detectado ("Efectivo", "Tarjeta de Débito", "Tarjeta de Crédito", "Transferencia", "Nequi", "Daviplata", "Desconocido").
- description: Breve descripción de la compra.
- tax_amount: Valor numérico del impuesto o IVA si está presente, o null.

Devuelve SOLO un JSON válido con:
{"merchant": string, "amount": number, "date": string, "type": "EXPENSE"|"INCOME", "category_hint": string, "payment_method_hint": string, "description": string, "tax_amount": number|null}`;

    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
    let lastErr: any = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType: mimeType || 'image/jpeg',
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
          },
        });

        if (response && response.text) {
          const cleanedText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
          const raw = JSON.parse(cleanedText);
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
        }
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error('No se pudo procesar la factura con Gemini.');
  }
}
