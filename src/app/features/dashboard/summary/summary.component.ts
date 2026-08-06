import { Component } from '@angular/core';

@Component({
  selector: 'app-summary',
  standalone: true,
  template: `
    <div style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
      <h2 style="margin-top: 0; color: #262626;">Resumen Financiero</h2>
      <p style="color: #595959;">Aquí integraremos las métricas y los gráficos de balance.</p>
    </div>
  `
})
export class SummaryComponent {
  // Próximamente: Inyección de servicios financieros y gestión de estado
}
