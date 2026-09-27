# Plan de Implementación: Corrección de Modo Oscuro en Filtros, Tarjetas KPI, Inputs y Modal de Perfil

## Diagnóstico y Causa Raíz

A partir de las capturas y análisis del código fuente:
1. **Tarjeta "Saldo (Filtro)" con número invisible**:
   - En `transactions.component.scss`, `.kpi-num` tiene hardcoded `color: #0f172a`.
   - En modo oscuro, la superficie de la tarjeta es `#0f172a`, haciendo que el valor numérico sea 100% invisible (negro sobre negro).
2. **Tarjeta "Saldo Global" permanece blanca**:
   - `.tx-kpi-card.highlight-card` tiene `background-color: #f8fafc !important`, que sobreescribe la regla de modo oscuro.
3. **Inputs de Formularios y Buscadores con recuadro blanco/oscuro**:
   - Ng-Zorro envuelve los inputs con prefijo/sufijo en `.ant-input-affix-wrapper` y `.ant-input-password`.
   - En `styles.scss`, solo se estilizaba `.ant-input`, dejando el wrapper con fondo blanco por defecto y borde gris claro, mientras el input interno era oscuro.
4. **Barra de Filtros en Libro de Transacciones**:
   - `.filters-card-wrapper` tiene `background-color: #f8fafc` fijo y el contenedor principal `.transactions-container` tiene `background-color: #ffffff`.
5. **Modal "Configuración de Perfil y Seguridad"**:
   - Las pestañas `.ant-tabs-tab-active .ant-tabs-tab-btn` y las etiquetas de formulario `.ant-form-item-label > label` tienen hardcoded `color: #0f172a` y `#1e293b`.
   - El botón `.btn-update-password` (con `nzDanger` y `nzType="primary"`) sufre conflicto de colores mostrando texto blanco sobre fondo blanco.

---

## Cambios Propuestos

### 1. Variables Globales y Estilos de Inputs (`src/styles.scss`)
- **Inputs & Wrappers globales**: Estilizar exhaustivamente en modo oscuro:
  - `.ant-input-affix-wrapper`, `.ant-input-affix-wrapper-focused`
  - `.ant-input-password` y sus iconos `.ant-input-password-icon`
  - `.ant-input`, `.ant-input-number`, `.ant-input-number-input`
  - Iconos de prefijo y sufijo `.ant-input-prefix`, `.ant-input-suffix` con color `#94a3b8`.
- **Modales y Formularios globales**:
  - Forzar que `.ant-form-item-label > label` respete `--color-slate-text` (`#f1f5f9` en modo oscuro).
  - Pestañas `.ant-tabs`: fondo transparente, tabs inactivos `#94a3b8`, tabs activos `#f8fafc` con barra de tinta Sky Blue (`#38bdf8`).
  - Botones de peligro primarios (`.ant-btn-dangerous.ant-btn-primary`): fondo rojo accesible `#dc2626` con texto `#ffffff` en hover y estado normal.

### 2. Libro de Transacciones (`transactions.component.scss` y HTML)
- **Tarjetas KPI**:
  - En modo oscuro, `.tx-kpi-card` y `.tx-kpi-card.highlight-card` adoptarán fondo `#0f172a` con borde `#1e293b`.
  - `.kpi-num`: utilizar `var(--color-navy)` (`#f8fafc` en modo oscuro) para que el saldo filtrado sea claramente visible con alto contraste.
  - La tarjeta "Saldo Global" tendrá un acento visual consistente en modo oscuro (borde o fondo Slate Navy elevado).
- **Contenedores y Filtros**:
  - `.transactions-container`: fondo `var(--color-surface)` y borde `var(--color-border)`.
  - `.filters-card-wrapper`: fondo `#111a33` en modo oscuro con borde `#1e293b`, iconos de búsqueda visibles (`#94a3b8`) y textos nítidos.
  - Tabla de transacciones: adaptación completa de celdas, descripciones y badges.

### 3. Modal de Perfil y Seguridad (`profile-modal.component.scss`)
- Actualizar pestañas para usar variables de tema `--color-navy` y `--color-blue-primary`.
- Corregir el color de las etiquetas (`label`) y textos descriptivos en modo oscuro.
- Ajustar botones de acción ("Cancelar" y "Actualizar Contraseña") para garantizar contraste AAA.

### 4. Consistencia en Otros Módulos (`config.component.scss` y `transaction-modal.component.scss`)
- Aplicar tokens en el modal de transacciones (monto, selector de tipo Segmented Control y etiquetas).
- Asegurar que la pantalla de Configuración (catálogos) también se renderice en Slate Navy Enterprise sin fondos blancos residuales.

---

## Plan de Verificación

1. **Compilación**: Ejecutar `compile_applet` para asegurar ausencia de errores de tipado o estilos.
2. **Revisión de Contraste**: Comprobar visual y programáticamente que:
   - El número de "Saldo (Filtro)" se renderice con color claro sobre la tarjeta oscura.
   - Las 4 tarjetas KPI tengan aspecto armónico y ninguna quede blanca en modo oscuro.
   - La barra de filtros tenga fondo Slate Navy elevado sin wrappers blancos en los inputs.
   - El modal de perfil tenga pestañas legibles, etiquetas visibles y botón con texto legible.
