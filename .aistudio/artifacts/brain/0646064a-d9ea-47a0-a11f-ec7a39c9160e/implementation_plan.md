# Plan de Implementación: Corrección de Estabilidad y Desborde en Móviles

## Diagnóstico del Problema

1. **Efecto de Rebote Constante / Parpadeo (Jitter de Scroll en Móvil)**:
   - **Causa Raíz**: En `.enterprise-viewport` y en los contenedores de las tablas (`nz-table` con `[nzScroll]`), al no contar con un gutter de scrollbar estable (`scrollbar-gutter: stable`), la aparición de la barra de scroll vertical reduce el ancho disponible en la pantalla en unos píxeles. Esto provoca que la tabla recalcule su ancho, reduciendo la altura total, lo que a su vez hace desaparecer la barra de scroll. Al desaparecer, el ancho vuelve a expandirse, aumentando la altura y reapareciendo la barra de scroll. Este bucle de retroalimentación se repite continuamente a 60 FPS, causando la sensación de que la tabla "salta arriba y abajo" rápidamente.
   - Adicionalmente, los contenedores flex sin `min-width: 0` y `max-width: 100%` permiten que el scroll horizontal de la tabla interfiera con el scroll vertical del viewport.

2. **Desborde de Botones de Acción en Móviles**:
   - En la cabecera del **Libro de Transacciones** (`transactions.component.scss`), los botones `Exportar CSV` y `Nueva Transacción` utilizan flexbox horizontal con texto completo sin ajuste de rejilla en pantallas menores a 768px, desbordando el ancho de la pantalla.
   - En el **Resumen Ejecutivo** (`summary.component.scss`), los selectores y el botón de nueva transacción requieren una distribución vertical u horizontal adaptada al 100% del ancho del viewport móvil.

---

## Cambios Propuestos

### 1. Estabilización del Viewport y Eliminación del Jitter (`dashboard.component.scss` y `styles.scss`)
- Implementar `scrollbar-gutter: stable;` y `overflow-x: hidden;` en `.enterprise-viewport` y en el layout raíz.
- Establecer `width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;` en `.inner-workspace` para aislar el ancho de renderizado e impedir que las tablas expandan el contenedor padre.
- Aplicar `overscroll-behavior-y: contain;` y `contain: paint;` controlado en las vistas principales para suprimir rebotes elásticos no deseados.

### 2. Contención y Scroll Fluido en Tablas (`transactions.component.scss` y `summary.component.scss`)
- **Libro de Transacciones (`.table-container`)**:
  - Envolver la tabla en un contenedor con `width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;`.
  - Asegurar que `.ant-table-wrapper` y `.ant-table-container` respeten `max-width: 100%` sin forzar saltos de altura.
- **Últimos Movimientos en Resumen (`.dashboard-table-card` y `.enterprise-data-table`)**:
  - Configurar `overflow-x: auto` en el contenedor de tarjeta para que el scroll horizontal sea suave y completamente contenido dentro del card sin afectar el scroll vertical de la página.

### 3. Distribución Equilibrada de Botones en Móvil (Mobile Actions)
- **Cabecera de Transacciones**:
  - En pantallas `< 768px`, organizar `.header-actions` en una cuadrícula equilibrada `grid-template-columns: 1fr 1fr; gap: 8px; width: 100%;`.
  - Ambos botones ocuparán exactamente el 50% del ancho disponible, con padding compacto y sin desbordamiento horizontal.
- **Cabecera de Resumen**:
  - En pantallas `< 768px`, apilar los controles ordenadamente:
    1. Selector de periodo (Segmented control) con scroll horizontal suave.
    2. Fila con los selectores de año y billetera al 50% cada uno.
    3. Botón `+ Nueva Transacción` al 100% del ancho con altura táctil ergonómica (40px).

---

## Plan de Verificación

1. **Compilación**: Ejecutar `compile_applet` para confirmar que los cambios de SCSS y HTML compilan sin errores.
2. **Prueba de Comportamiento Móvil**:
   - Verificar en resoluciones móviles (360px a 768px) que la tabla de *Últimos Movimientos* y la del *Libro de Transacciones* no sufran parpadeo, temblor ni salto cíclico de scroll.
   - Confirmar que los botones de acción se ajusten con precisión al 100% del ancho de la pantalla sin desbordarse.
