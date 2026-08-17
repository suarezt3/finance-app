// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
// NOTA: Eliminamos el 'import { AuthComponent }...' estático de aquí arriba

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'auth',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    // Optimización: Carga perezosa (Lazy Loading) aplicada al Login
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard], // El candado está perfecto
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    // Definición de Rutas Hijas (Se renderizan en el <router-outlet> del layout principal)
    children: [
      {
        path: '',
        redirectTo: 'resumen',
        pathMatch: 'full'
      },
      {
        path: 'resumen',
        loadComponent: () => import('./features/dashboard/summary/summary.component').then(m => m.SummaryComponent)
      },
      {
        path: 'configuracion',
        loadComponent: () => import('./features/dashboard/config/config.component').then(m => m.ConfigComponent)
      },
      {
        path: 'transacciones',
        loadComponent: () => import('./features/dashboard/transactions/transactions.component').then(m => m.TransactionsComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'auth'
  }
];
