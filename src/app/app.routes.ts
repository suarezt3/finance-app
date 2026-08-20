// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'auth',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    // Transformamos 'auth' en una agrupación lógica de rutas hijas
    children: [
      {
        path: '', // Coincide exactamente con '/auth'
        loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent)
      },
      {
        path: 'update-password', // Coincide con '/auth/update-password'
        loadComponent: () => import('./features/auth/update-password/update-password.component').then(m => m.UpdatePasswordComponent)
      }
    ]
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
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
