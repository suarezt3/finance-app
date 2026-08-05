// src/app/features/dashboard/dashboard.component.ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div style="padding: 50px; text-align: center; font-family: sans-serif;">
      <h1 style="color: #16a34a;">¡Acceso Autorizado!</h1>
      <p>Bienvenido al Dashboard Privado.</p>
    </div>
  `
})
export class DashboardComponent {}
