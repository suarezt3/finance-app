// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { AuthComponent } from './features/auth/auth.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'auth',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    component: AuthComponent
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
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
        // Carga perezosa del componente de KPIs y Gráficos
        loadComponent: () => import('./features/dashboard/summary/summary.component').then(m => m.SummaryComponent)
      },
      // NUEVA RUTA: Módulo de Configuración de Catálogos
      {
        path: 'configuracion',
        loadComponent: () => import('./features/dashboard/config/config.component').then(m => m.ConfigComponent)
      },
      // NUEVA RUTA: Módulo de Transacciones
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
