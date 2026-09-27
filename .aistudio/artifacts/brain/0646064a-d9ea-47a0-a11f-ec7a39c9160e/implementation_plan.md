# Plan de Corrección Integral de Modo Oscuro: Filtros, Perfil, Modales e Inputs Globales

Resolución completa de los problemas de contraste, fondos desalineados y legibilidad detectados en las capturas de pantalla, aplicando la paleta oficial **Slate Navy** (`#0B1329` / `#0F172A`) y **Financial Blue** (`#2563EB` / `#38BDF8`).

---

## Diagnóstico de los Problemas Reportados en las Capturas

1. **Barra de Filtros y Tarjetas KPI (Libro de Transacciones)**:
   - **Contenedor de Filtros**: Presenta fondo blanco residual (`#FFFFFF`) rompiendo con el fondo oscuro general.
   - **Buscador (`nz-input-affix-wrapper`)**: El contenedor exterior es blanco mientras que el `<input>` interno tiene fondo azul oscuro, produciendo un antiestético efecto de "caja doble".
   - **Tarjeta "SALDO GLOBAL"**: Fondo blanco residual que no se adapta al modo oscuro.
   - **Tarjeta "SALDO (FILTRO)"**: Valor numérico invisible o en negro sobre azul oscuro.
   - **Selects y Calendario Rango**: Desincronización de colores en el picker y selectores.

2. **Modal de Configuración de Perfil y Seguridad**:
   - **Pestañas (`nz-tabs`)**: Pestañas inactivas con tipografía oscura invisible sobre fondo azul marino; pestaña activa cortada o desalineada.
   - **Campos de Contraseña (`nz-input-affix-wrapper`)**: Envoltorio blanco con input oscuro en el centro e iconos de candado y visibilidad desfasados.
   - **Etiquetas de Formulario (`label`)**: Texto en gris oscuro (`#475569`) casi ilegible sobre fondo oscuro.
   - **Botón "Actualizar Contraseña"**: Botón deshabilitado o primario con texto blanco sobre fondo blanco (completamente invisible).
   - **Botón "Cancelar"**: Fondo blanco brillante fuera de armonía con el modal oscuro.

---

## 1. Solución Global para Componentes Ng-Zorro (`src/styles.scss`)

Configuraremos selectores globales bajo `html.dark` y `[data-theme="dark"]` para garantizar consistencia en toda la plataforma:

### A. Inputs y Envoltorios (`.ant-input`, `.ant-input-affix-wrapper`)
- Fondo del envoltorio: `#1E293B` (Slate 800) sin fondo blanco residual.
- Input interior: `background: transparent !important; color: #F8FAFC !important;`.
- Borde: `#334155` (Slate 700) con focus en Financial Blue `#38BDF8` y resplandor suave.
- Iconos de prefijo y sufijo (candado, lupa, ojo de contraseña): `#94A3B8`, con hover activo en `#38BDF8`.
- Placeholder: `#64748B`.

### B. Selectores y Calendarios Rango (`.ant-select`, `.ant-picker`)
- Contenedores: `#1E293B` con bordes `#334155` y texto `#F8FAFC`.
- Dropdowns flotantes (`.ant-select-dropdown`, `.ant-picker-dropdown`): Fondo `#0F172A`, bordes `#1E293B`, opciones en hover `#1E293B` y seleccionadas en `#2563EB`.

### C. Modales (`.ant-modal-content`)
- Fondo del modal: `#0F172A` (Slate Navy elevado).
- Cabecera (`.ant-modal-header`): Fondo `#0F172A`, borde inferior `#1E293B`, título `#F8FAFC`, botón de cierre `#94A3B8`.
- Pie de modal (`.ant-modal-footer`): Borde superior `#1E293B`.
- Etiquetas (`.ant-form-item-label > label`): `#E2E8F0` con asterisco rojo de obligatoriedad nítido `#F87171`.

### D. Pestañas (`.ant-tabs`)
- Barra de navegación (`.ant-tabs-nav`): Borde inferior `#1E293B`.
- Pestañas inactivas: Texto `#94A3B8` con hover en `#F8FAFC`.
- Pestaña activa: Texto en Financial Sky `#38BDF8` y barra indicadora (`.ant-tabs-ink-bar`) en `#38BDF8`.

### E. Botones en Modo Oscuro (`.ant-btn`)
- Primario (`.ant-btn-primary`): Fondo `#2563EB`, texto blanco `#FFFFFF`, hover `#1D4ED8`.
- Primario Deshabilitado: Fondo `#1E293B`, borde `#334155`, texto `#64748B` (legible y contrastado, nunca blanco sobre blanco).
- Secundario / Cancelar (`.ant-btn-default`): Fondo `#1E293B`, borde `#334155`, texto `#F8FAFC`, hover `#334155`.

---

## 2. Ajustes Específicos en Transacciones (`src/app/features/transactions/`)

- **Barra de Filtros**:
  - Contenedor con fondo Slate Navy `#0F172A`, borde `#1E293B`, sombra suave.
  - Botón "Limpiar": Estilo dark outline con hover luminoso.
- **Tarjetas KPI de Saldo**:
  - Tarjeta "SALDO GLOBAL": Fondo `#0F172A` con borde `#1E293B`, valor numérico `#F8FAFC`.
  - Tarjeta "SALDO (FILTRO)": Valor numérico legible en verde esmeralda o `#38BDF8`.

---

## 3. Ajustes Específicos en Modal de Perfil y Contraseña (`src/app/features/dashboard/components/`)

- Armonización de `config.component.scss` y `update-password.component.scss` para que adopten transparentemente las variables del tema sin estilos inline blancos forzados.
- Validación de contraste tipográfico WCAG AA en todos los estados (reposo, foco, error de validación y deshabilitado).

---

## 4. Fases de Ejecución

1. **Fase 1**: Refactorizar y ampliar los overrides de Ng-Zorro en `src/styles.scss` (inputs, affix-wrappers, selects, pickers, tabs, modales, botones y labels).
2. **Fase 2**: Actualizar la barra de filtros y las tarjetas KPI en `transactions.component.scss`.
3. **Fase 3**: Revisar y asegurar estilos de `config.component` y `update-password.component`.
4. **Fase 4**: Ejecutar `compile_applet` y verificar la visualización general en modo oscuro.
