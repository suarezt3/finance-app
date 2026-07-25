// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '', // Ruta raíz (localhost:4200/)
    // Carga perezosa del componente Standalone
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent),
    title: 'Autenticación | FinanceApp'
  },
  {
    path: 'dashboard',
    // Por ahora redirigimos al inicio hasta que creemos el componente del dashboard
    redirectTo: '',
    pathMatch: 'full'
  },
  {
    // Ruta comodín (Wildcard) para atrapar URLs que no existen (Error 404)
    path: '**',
    redirectTo: ''
  }
];
