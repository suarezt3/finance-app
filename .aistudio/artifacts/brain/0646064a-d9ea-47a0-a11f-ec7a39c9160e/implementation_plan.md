# Plan de Implementación: Corrección de Escaneo de Facturas y Optimización de Gemini AI

## 1. Diagnóstico del Error 404 / Fallo en el Celular
- **Causa raíz:** Las fotos tomadas directamente con la cámara del celular tienen resoluciones de 12 MP a 50 MP (entre 10 MB y 25 MB). Al convertirse a Base64 sin comprimir en el navegador del teléfono, superan los 25 MB. Esto provoca que la petición HTTP sea rechazada por el servidor (error 413 o 404 por proxy) y que, al enviarse a Gemini, agote de golpe la cuota de tokens (*resource_exhausted*).
- **Formatos específicos analizados (Tiendas Ara y Dollarcity):**
  - **Tiendas Ara:** Formato colombiano con *Ajuste al peso* (ej: 5.190 - 40 = 5.150 total real; el efectivo de 7.000 y cambio de 1.850 no deben confundirse con el total).
  - **Dollarcity:** Formato con listado detallado de ítems, subtotal de 16.386,56 + IVA y `TOTAL COP 19.500,00` (efectivo 20.000, cambio 500). Los separadores de miles y puntos decimales en Colombia requieren normalización numérica precisa.

---

## 2. Cambios a Implementar

### A. Compresión y Redimensionamiento Automático en el Celular (`NativeDeviceService`)
- Implementar una tubería de preprocesamiento basada en Canvas HTML5:
  - Redimensiona automáticamente cualquier foto capturada por la cámara a un tamaño máximo de 1600 px en su lado mayor.
  - Comprime a formato JPEG con calidad 0.82.
  - Reduce el peso de ~15 MB a solo ~250–350 KB en milisegundos, manteniendo el texto, números y códigos de barras 100% nítidos.
  - Elimina los errores de límite de carga, tiempo de espera en red móvil y consumo excesivo de tokens.

### B. Prompt Especializado para Facturas Colombianas (`src/server.ts`)
- Ajustar las instrucciones para Gemini para que entienda específicamente la estructura de comprobantes de venta en Colombia:
  - Reconocimiento de comercios comunes: Tiendas Ara, Dollarcity, D1, Éxito, Carulla, etc.
  - Distinción estricta entre el **Total a pagar** vs el **Efectivo entregado** y el **Cambio**.
  - Interpretación correcta de puntos como separadores de miles (ej: `5.150` -> `5150`, `19.500,00` -> `19500`).
  - Categorización automática coherente (ej: Ara -> *Alimentación / Supermercado* o *Hogar*; Dollarcity -> *Hogar* o *Compras*).

### C. Soporte para Clave Personal de Gemini Pro / AI Studio
- **Aclaración sobre la suscripción Pro:**
  - La suscripción de consumo *Gemini Advanced/Pro* es para el chat web (gemini.google.com).
  - Para integrar la IA en aplicaciones y gozar de cuota profesional sin límites de nivel gratuito, se utiliza una **API Key de Google AI Studio** (aistudio.google.com).
- **Implementación en la App:**
  - En la vista de **Ajustes / Perfil**, agregar una sección opcional: *"Configuración de Gemini AI (Opcional)"*.
  - Permitir al usuario ingresar su propia clave de API de Google AI Studio si lo desea.
  - Si no ingresa una clave propia, la aplicación utiliza la clave y cuota optimizada del sistema de forma transparente.

---

## 3. Verificación
1. Validar que la compresión del cliente genere archivos livianos (< 400 KB) sin importar la cámara del teléfono.
2. Comprobar que el endpoint `/api/scan-receipt` extraiga con exactitud los valores de las facturas de Tiendas Ara ($5.150) y Dollarcity ($19.500).
3. Compilar con `compile_applet` y verificar el despliegue.
