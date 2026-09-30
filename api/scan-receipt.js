const { GoogleGenAI } = require('@google/genai');

module.exports = async function handler(req, res) {
  // CORS support for Vercel
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-gemini-api-key'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { imageBase64, mimeType = 'image/jpeg' } = body;

    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen de comprobante.' });
    }

    // Obtener la clave de Gemini: primero del header personalizado, o de las variables de entorno de Vercel
    const customApiKey = req.headers['x-gemini-api-key'];
    let apiKey = (customApiKey && typeof customApiKey === 'string' && customApiKey.trim().length > 10)
      ? customApiKey.trim()
      : (process.env.GEMINI_API_KEY || '');

    if (!apiKey || apiKey.startsWith('MY_GEMINI_') || apiKey.length < 20) {
      return res.status(500).json({
        success: false,
        error: 'La variable de entorno GEMINI_API_KEY no está configurada o es inválida en Vercel.'
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build-vercel' } },
    });

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

    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];
    let response;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
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
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[Vercel Serverless] Intento con modelo ${modelName} falló:`, err?.message || err);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('No se pudo obtener respuesta del modelo de Gemini.');
    }

    let parsedResult;
    try {
      const cleanedText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedResult = JSON.parse(cleanedText);
    } catch {
      throw new Error('La respuesta de Gemini no tuvo el formato JSON esperado.');
    }

    return res.status(200).json({
      success: true,
      data: parsedResult,
    });
  } catch (error) {
    console.error('[Vercel Serverless] Error en /api/scan-receipt:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Error al procesar la factura con Gemini AI.',
    });
  }
};
