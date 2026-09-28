import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

process.env['NG_ALLOWED_HOSTS'] = '*';

const app = express();
const angularNodeAppEngine = new AngularNodeAppEngine({
  allowedHosts: ['*']
});

// Parse JSON request body with 15MB limit for receipt images
app.use(express.json({ limit: '15mb' }));

// Initialize Google Gen AI client with telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env['GEMINI_API_KEY'] || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// API endpoint to analyze receipt / invoice images
app.post('/api/scan-receipt', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen de comprobante.' });
    }

    // Strip prefix if standard data URL was provided
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const prompt = `Analiza detenidamente esta imagen de factura, recibo o comprobante de pago.
Extrae los siguientes datos con máxima precisión en formato JSON estructurado:
- merchant: Nombre del negocio, tienda, comercio o persona que emitió la factura (ej: "Supermercado Éxito", "Uber", "Restaurante", "Farmacia"). Si no se distingue con claridad, coloca "Comercio no especificado".
- amount: El monto total final a pagar en formato numérico (número positivo, sin símbolos de moneda ni comas de miles). Si no se detecta, usa 0.
- date: La fecha de la transacción en formato ISO YYYY-MM-DD (ej: "2026-03-15"). Si no aparece el año, asume el año actual. Si no hay fecha legible, usa la fecha de hoy.
- type: 'EXPENSE' si es un gasto o pago, o 'INCOME' si es una factura emitida para cobro o ingreso.
- category_hint: Sugerencia de categoría entre: "Alimentación", "Supermercado", "Transporte", "Servicios", "Salud", "Entretenimiento", "Compras", "Educación", "Hogar", "Otros".
- payment_method_hint: Método de pago detectado (ej: "Tarjeta de Crédito", "Tarjeta de Débito", "Efectivo", "Transferencia", "Nequi", "Daviplata", "Desconocido").
- description: Breve descripción de los artículos comprados o el motivo del gasto (máximo 120 caracteres).
- tax_amount: Valor numérico del impuesto o IVA si está desglosado (número o null).

Devuelve EXCLUSIVAMENTE un objeto JSON válido con los campos exactos:
{
  "merchant": string,
  "amount": number,
  "date": string,
  "type": "EXPENSE" | "INCOME",
  "category_hint": string,
  "payment_method_hint": string,
  "description": string,
  "tax_amount": number | null
}`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
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
    } catch (modelErr: any) {
      console.warn('Fallback a gemini-3.1-flash-lite debido a:', modelErr?.message);
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
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
    }

    const text = response.text?.trim() || '{}';
    let parsedData: any = {};
    try {
      parsedData = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsedData = JSON.parse(match[0]);
      } else {
        throw new Error('Formato de respuesta no decodificable de Gemini');
      }
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error al procesar comprobante con Gemini:', error);
    let userMsg = 'Error al procesar el comprobante con Gemini AI';
    const rawError = error?.message || '';

    if (rawError.includes('resource_exhausted') || rawError.includes('quota') || rawError.includes('429')) {
      userMsg = 'Has alcanzado temporalmente el límite de cuota de Gemini AI. Espera unos segundos o ingresa los datos manualmente.';
    } else if (rawError.includes('API_KEY_INVALID') || rawError.includes('API key not valid')) {
      userMsg = 'La clave de Gemini API no es válida o no tiene permisos suficientes.';
    } else if (rawError.includes('503') || rawError.includes('high demand') || rawError.includes('UNAVAILABLE')) {
      userMsg = 'El modelo de IA está experimentando alta demanda. Intenta nuevamente en unos segundos.';
    }

    return res.status(500).json({
      success: false,
      error: userMsg,
    });
  }
});

// Serve static files from /browser
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

// All regular routes use the Angular engine
app.use((req, res, next) => {
  angularNodeAppEngine
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

// Start the server if this module is the main entry point
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 3000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
export { AngularAppEngine } from '@angular/ssr';
export default app;
