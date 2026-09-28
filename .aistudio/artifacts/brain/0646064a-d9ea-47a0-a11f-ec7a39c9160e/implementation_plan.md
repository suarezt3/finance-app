# Plan de Implementación: Carga Inmediata y Resiliente de Datos en Primer Inicio de Sesión

## Diagnóstico del Problema

1. **Condición de Carrera en Autenticación Post-Login**:
   - Al ejecutar `authService.signIn(...)` en el login, la aplicación redirige inmediatamente a `/dashboard` mediante `router.navigate(['/dashboard'])` sin esperar a que el estado interno del usuario (`_currentUser`) y las cabeceras de sesión de Supabase se sincronicen en el cliente.
   
2. **Ciclo de Vida del Modal Desacoplado**:
   - `TransactionModalComponent` ejecuta `loadCatalogs()` **únicamente una vez** durante `ngOnInit()` (cuando el componente padre del dashboard se monta en segundo plano y el modal aún está oculto).
   - Si en ese milisegundo la sesión o la consulta a `profiles` (`workspace_id`) aún está en resolución, la llamada falla silenciosamente en el bloque `catch` dejando `categories = []` y `paymentMethods = []`.
   - Cuando el usuario hace clic en **"Nueva Transacción"**, el modal se abre pero nunca vuelve a intentar consultar los catálogos, mostrando "No hay datos" hasta que se recarga la página con F5 (cuando la sesión ya está persistida en `localStorage`).

3. **Resolución Frágil de Workspace sin Reintentos**:
   - En `CatalogService`, `getWorkspaceId()` realiza una consulta directa `.from('profiles').select('workspace_id').single()`. Si la base de datos o el token de sesión tarda 100-300ms en autenticarse ante RLS, la consulta arroja error y aborta la carga de categorías y billeteras.

4. **Falta de Reintentos y Estados de Carga en Tarjetas y Selectores**:
   - Las tarjetas de KPI en el resumen dependen de `loadRealTransactions()` y `loadCatalogs()`. Si fallan en el primer intento tras el login, no hay reintento automático ni estado de recarga visible.
   - Los selectores `<nz-select>` dentro del modal no muestran indicador de carga (`nzLoading`), por lo que muestran inmediatamente el estado vacío "No hay datos".

---

## Plan de Solución

### 1. `AuthService`: Sincronización Determinista del Estado de Sesión
- En `auth.service.ts`, actualizar de inmediato la señal `_currentUser` tras `signInWithPassword` y esperar la confirmación de la sesión antes de completar el método.
- Proveer un método `waitForSession()` para asegurar que cualquier servicio que requiera autenticación espere de forma segura a que Supabase tenga el token activo.
- Limpiar cachés de catálogos y workspace al cerrar sesión (`signOut`).

### 2. `CatalogService`: Caché Reactiva y Reintentos Resilientes de Workspace
- En `catalog.service.ts`:
  - Implementar un mecanismo de reintento progresivo (exponential backoff / 3 intentos breves: 150ms, 400ms, 800ms) en `getWorkspaceId()`.
  - Cachear en memoria el `workspaceId` una vez resuelto para evitar consultas repetitivas a la tabla `profiles` desde múltiples componentes simultáneos.
  - Implementar caché de catálogos con método de recarga explícita (`refreshCatalogs()`).

### 3. `TransactionModalComponent`: Recarga Automática al Abrir el Modal y Feedback Visual
- En `transaction-modal.component.ts`:
  - Añadir una señal `isLoadingCatalogs`.
  - Configurar un `effect()` o hook en la entrada `isVisible`: cada vez que el modal se abra (`isVisible() === true`), si `categories().length === 0` o `paymentMethods().length === 0`, disparar automáticamente la carga de catálogos.
  - En `transaction-modal.component.html`, vincular `[nzLoading]="isLoadingCatalogs()"` en los `<nz-select>` de categoría y método de pago para que el usuario visualice un spinner mientras los datos se sincronizan.

### 4. `SummaryComponent` y `TransactionsComponent`: Carga Robusta de Tarjetas y Filtros
- En `summary.component.ts` y `transactions.component.ts`:
  - Añadir reintentos automáticos si la primera consulta tras el inicio de sesión falla por sincronización de token.
  - Garantizar que las tarjetas de KPIs y el selector de billeteras se actualicen apenas los datos estén disponibles.

---

## Verificación

1. **Prueba de Inicio de Sesión en Limpio**:
   - Iniciar sesión desde `/auth` y verificar que al redirigir al `/dashboard` las tarjetas de KPIs carguen de inmediato los montos e historial.
2. **Prueba del Modal de Transacción**:
   - Abrir el modal "Nueva Transacción" inmediatamente tras iniciar sesión sin recargar la página.
   - Verificar que el selector de Categorías y Métodos de Pago muestren las opciones correctas (Gasto, Ingreso, Efectivo, Tarjeta, etc.) sin aparecer vacíos.
3. **Compilación y Dev Server**:
   - Ejecutar `compile_applet` para asegurar cero errores de tipos y `restart_dev_server`.
