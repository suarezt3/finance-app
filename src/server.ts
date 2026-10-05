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

import { readFileSync, existsSync } from 'node:fs';

process.env['NG_ALLOWED_HOSTS'] = '*';

const app = express();
const angularNodeAppEngine = new AngularNodeAppEngine({
  allowedHosts: ['*']
});

// Parse JSON request body with 15MB limit for receipt images
app.use(express.json({ limit: '15mb' }));

// Helper to get active API key
function getEffectiveApiKey(customApiKey?: string): string {
  if (customApiKey && customApiKey.trim().length > 10) {
    return customApiKey.trim();
  }
  let key = process.env['GEMINI_API_KEY'] || '';
  if (!key || key.startsWith('MY_GEMINI_') || key.length < 25) {
    try {
      if (existsSync('/tmp/.gemini_key')) {
        const tmpKey = readFileSync('/tmp/.gemini_key', 'utf-8').trim();
        if (tmpKey && tmpKey.length > 25) {
          key = tmpKey;
        }
      }
    } catch {
      // ignore
    }
  }
  return key;
}

// API endpoint to analyze receipt / invoice images
app.post('/api/scan-receipt', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen de comprobante.' });
    }

    // Optional custom API key provided by user in settings or system key
    const customApiKey = req.headers['x-gemini-api-key'] as string;
    const apiKey = getEffectiveApiKey(customApiKey);

    const activeAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    // Strip prefix if standard data URL was provided
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const prompt = `Analiza detenidamente esta imagen de factura, recibo o comprobante de pago.
Extrae los siguientes datos con máxima precisión en formato JSON estructurado:

Reglas de extracción y normalización:
- merchant: Nombre del negocio o establecimiento comercial (ej: "Tiendas Ara", "Dollarcity", "Tiendas D1", "Éxito", "Jumbo", "Farmatodo", "Uber", "Restaurante"). Si aparece la razón social como "JERONIMO MARTINS COLOMBIA", normalízalo a "Tiendas Ara". Si aparece "SURAMERICA COMERCIAL", normalízalo a "Dollarcity".
- amount: El monto TOTAL real pagado en formato numérico puro (ej: 5150, 19500).
  * En facturas colombianas (ej: Tiendas Ara): Si hay "Ajuste al peso (-)", el valor final a pagar es el "Total" con el ajuste aplicado (ej: si dice Total: 5.150, el valor es 5150). NO tomes el monto de "Efectivo" entregado ni el "Cambio".
  * En Dollarcity: Extrae el valor de "TOTAL COP" (ej: 19500.00 -> 19500). NO uses el monto entregado en efectivo ni el cambio devuelto.
  * Atención a separadores: En Colombia el punto (.) se usa para miles (ej: 5.190 = 5190, 19.500 = 19500, 20.000 = 20000). Devuelve un número entero o decimal limpio sin separadores de miles.
- date: La fecha de la transacción en formato ISO YYYY-MM-DD (ej: "2026-09-27"). Si no aparece el año, usa el año actual.
- type: 'EXPENSE' si es una compra o gasto, o 'INCOME' si es una venta o ingreso.
- category_hint: Categoría más adecuada entre: "Alimentación", "Supermercado", "Hogar", "Compras", "Transporte", "Servicios", "Salud", "Entretenimiento", "Educación", "Otros". (Para Ara/D1/Éxito usa "Supermercado"; para Dollarcity usa "Hogar" o "Compras").
- payment_method_hint: Método de pago detectado ("Efectivo", "Tarjeta de Débito", "Tarjeta de Crédito", "Transferencia", "Nequi", "Daviplata", "Desconocido").
- description: Breve descripción de los artículos comprados o el motivo del gasto (máximo 120 caracteres, ej: "Artículos de aseo y compras en Tiendas Ara").
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
    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        response = await activeAiClient.models.generateContent({
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
          break; // Exitoso
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Modelo ${modelName} falló:`, err?.message || err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('No se pudo procesar la imagen con los modelos disponibles.');
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
    const rawError = error?.message || String(error) || '';

    if (rawError.includes('resource_exhausted') || rawError.includes('quota') || rawError.includes('429')) {
      userMsg = 'Has alcanzado temporalmente el límite de cuota de Gemini AI. Espera unos segundos o ingresa los datos manualmente.';
    } else if (rawError.includes('API_KEY_INVALID') || rawError.includes('API key not valid')) {
      userMsg = 'La clave de Gemini API no es válida o no tiene permisos suficientes.';
    } else if (rawError.includes('503') || rawError.includes('high demand') || rawError.includes('UNAVAILABLE')) {
      userMsg = 'El modelo de IA está experimentando alta demanda. Intenta nuevamente en unos segundos.';
    } else if (rawError.includes('404') || rawError.includes('NOT_FOUND')) {
      userMsg = 'Servicio de reconocimiento óptico temporalmente no disponible. Puedes ingresar los datos manualmente.';
    }

    return res.json({
      success: false,
      error: userMsg,
    });
  }
});

// API endpoint to parse audio or voice transcript into structured transaction data
app.post('/api/parse-voice-expense', async (req, res) => {
  try {
    const { transcript, audioBase64, mimeType = 'audio/webm', categories = [], paymentMethods = [] } = req.body;

    if (!transcript && !audioBase64) {
      return res.status(400).json({ success: false, error: 'No se recibió transcripción ni audio.' });
    }

    const customApiKey = req.headers['x-gemini-api-key'] as string;
    const apiKey = getEffectiveApiKey(customApiKey);

    const activeAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const categoryList = Array.isArray(categories) && categories.length > 0 
      ? `Categorías disponibles en la app del usuario: ${categories.join(', ')}.` 
      : 'Categorías sugeridas: Alimentación, Supermercado, Transporte, Hogar, Servicios, Salud, Entretenimiento, Educación, Compras, Salario, Otros.';

    const methodsList = Array.isArray(paymentMethods) && paymentMethods.length > 0
      ? `Cuentas/Billeteras disponibles en la app del usuario: ${paymentMethods.join(', ')}.`
      : 'Cuentas sugeridas: Efectivo, Nequi, Daviplata, Tarjeta de Débito, Tarjeta de Crédito, Cuenta Corriente, Bancolombia.';

    const systemPrompt = `Eres un asistente financiero inteligente. Tu tarea es interpretar una instrucción dictada por voz de un usuario en español latinoamericano (principalmente Colombia) sobre un movimiento de dinero.

Fecha de referencia de hoy: ${todayStr}.
${categoryList}
${methodsList}

Instrucciones de interpretación:
1. amount: Monto numérico positivo limpio (ej: "cincuenta mil pesos" -> 50000; "un millón" -> 1000000; "quince mil quinientos" -> 15500; "veinte dólares" -> 20; "cien mil" -> 100000). Si no dice monto, pon 0.
2. type: 'EXPENSE' si es un gasto/pago/compra/salida; 'INCOME' si es un ingreso/salario/cobro/venta/recibí; 'TRANSFER' si es transferencia entre cuentas propias.
3. category_hint: Elige la categoría que MEJOR coincida de la lista del usuario (o una adecuada si no coincide).
4. payment_method_hint: Elige la cuenta o billetera origen que MEJOR coincida de la lista del usuario (ej: "Nequi", "Efectivo").
5. destination_method_hint: Si es transferencia, la cuenta receptora (o null).
6. description: Una descripción breve y natural de la transacción (máximo 80 caracteres, ej: "Almuerzo de trabajo", "Compras en supermercado").
7. date: Fecha ISO YYYY-MM-DD. Si dice "ayer", réstale 1 día a ${todayStr}. Si no dice fecha, usa ${todayStr}.

Devuelve EXCLUSIVAMENTE un JSON válido con este formato:
{
  "amount": number,
  "type": "EXPENSE" | "INCOME" | "TRANSFER",
  "category_hint": string,
  "payment_method_hint": string,
  "destination_method_hint": string | null,
  "description": string,
  "date": string
}`;

    const contents: any[] = [];
    if (audioBase64) {
      const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9+.-]+;base64,/, '');
      contents.push({
        role: 'user',
        parts: [
          { text: systemPrompt + '\n\nEscucha el siguiente audio y extrae la información:' },
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'audio/webm',
            }
          }
        ]
      });
    } else {
      contents.push({
        role: 'user',
        parts: [
          { text: systemPrompt + `\n\nMensaje dictado por el usuario:\n"${transcript}"` }
        ]
      });
    }

    let response;
    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        response = await activeAiClient.models.generateContent({
          model: modelName,
          contents,
          config: {
            responseMimeType: 'application/json',
          },
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Modelo ${modelName} para voz falló:`, err?.message || err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('No se pudo procesar la instrucción de voz.');
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
        throw new Error('Respuesta inválida del modelo.');
      }
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error al procesar audio/voz con Gemini:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Error interno al procesar el audio con IA.',
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
