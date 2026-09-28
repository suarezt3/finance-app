# Plan de Implementación Revisado: Integración Móvil Nativa (Capacitor), Biometría y Escaneo con Gemini AI

## 1. Respuestas y Garantías Clave

### ¿Se dañará la versión Web o los accesos directos ya instalados?
> **No, en absoluto.** 
> Capacitor no reemplaza la web; funciona como una capa envolvente opcional (*wrapper*).
> - La versión web y la PWA instalada en tu computador y celular seguirán funcionando **exactamente como hasta ahora**, sin ninguna interrupción.
> - Toda la lógica de hardware cuenta con **fallback web**: si estás en el navegador web, el escáner de facturas te permitirá tomar foto con la cámara del navegador o subir el archivo de la factura; si estás dentro de la app nativa instalada vía APK/IPA, utilizará la cámara nativa del sistema operativo.

### ¿Necesitas instalar programas en tu computadora para probar?
> - **Para probar inmediatamente la funcionalidad y la IA**: **NO necesitas instalar nada.** Podrás probar el botón de escaneo de facturas con Gemini directamente en el navegador y en tus accesos directos actuales.
> - **Para generar el instalador nativo (.apk / .ipa)**:
>   - **Android**: Solo cuando quieras generar el archivo APK instalable o publicarlo en Google Play, requerirás **Android Studio** (gratuito).
>   - **iOS**: Solo cuando quieras compilar para iPhone, requerirás una computadora **Mac con Xcode** (gratuito en la App Store de macOS).

---

## 2. Arquitectura de Compatibilidad Total (Web + Nativo)

```
                       ┌───────────────────────────────┐
                       │  Aplicación Angular (Única)   │
                       └──────────────┬────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
    Entorno Web / PWA                                Entorno Nativo Móvil
  (Navegador / Acceso Directo)                       (Instalador Capacitor)
  ────────────────────────────                       ─────────────────────
  • Cámara: Input file / WebCam                      • Cámara: @capacitor/camera
  • Auth: Login tradicional Supabase                 • Auth: Biometría / Huella
  • Cero descargas adicionales                       • Compilación en Android Studio/Xcode
              │                                               │
              └───────────────────────┬───────────────────────┘
                                      ▼
                      Servicio IA Gemini en Backend
                    (Análisis y extracción de facturas)
```

---

## 3. Fases del Proyecto

### Fase 1: Arquitectura Base de Capacitor (Sin alterar la Web)
- Instalación de librerías de Capacitor en modo no invasivo:
  - `@capacitor/core` y `@capacitor/cli`
  - `@capacitor/camera` y `@capacitor/haptics`
- Creación de `capacitor.config.ts` apuntando a la compilación estándar de Angular (`dist/finance/browser`).
- Adición de scripts auxiliares en `package.json` (`cap:sync`, `cap:android`, `cap:ios`) que solo se usan cuando tú decidas abrir Android Studio o Xcode.

### Fase 2: Servicios Híbridos (Nativo + Web Fallback)
- **`NativeCameraService`**:
  - Detecta automáticamente si está en móvil nativo o en navegador web.
  - En navegador: Abre el selector de archivos / cámara web estándar del dispositivo.
  - En móvil nativo: Utiliza la API de cámara del sistema operativo con control de flash y resolución optimizada.
- **`BiometricAuthService`**:
  - En navegador: Notifica amigablemente que la biometría requiere la app nativa y mantiene el login seguro de Supabase.
  - En móvil nativo: Permite registrar y desbloquear con huella / Face ID usando almacenamiento seguro.
- **CSS Seguro (Safe Area)**:
  - Variables de margen (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) para que no choque con la barra de navegación ni el notch de los celulares modernos, manteniendo la vista web impecable.

### Fase 3: Escaneo Inteligente de Facturas con Gemini (Backend Seguro)
- Endpoint seguro `/api/scan-receipt` en Node.js que:
  1. Recibe la imagen de la factura o recibo.
  2. Consulta a `gemini-2.5-flash` mediante el SDK oficial `@google/genai`.
  3. Devuelve los campos estructurados en formato JSON:
     - Monto total
     - Fecha del comprobante
     - Nombre del comercio / emisor
     - Categoría recomendada (mapeada a las categorías del usuario)
     - Método de pago sugerido (Efectivo, Tarjeta, etc.)
- La clave de API de Gemini se mantiene en el servidor, 100% oculta y protegida.

### Fase 4: Integración en la Interfaz de Transacciones
- Botón **"📸 Escanear Factura con IA"** en `TransactionModalComponent`.
- Flujo interactivo:
  1. El usuario pulsa el botón.
  2. Sube o captura la foto del recibo (funciona en web y en app nativa).
  3. Un indicador visual muestra *"Gemini analizando comprobante..."*.
  4. Los campos de monto, fecha, categoría y nota se rellenan automáticamente.
  5. El usuario puede revisar y pulsar "Guardar Transacción".

---

## 4. Pruebas y Validación
1. **Verificación en Navegador / PWA**: Comprobar que la web actual no sufre ningún cambio adverso, que el inicio de sesión sigue intacto y que el escaneo de facturas funciona cargando una imagen desde el computador o celular.
2. **Preparación de Proyectos Nativos**: Generar las carpetas de sincronización para que, cuando dispongas de Android Studio o Xcode, puedas generar tus instaladores con un solo comando.
