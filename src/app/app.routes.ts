// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { AuthComponent } from './features/auth/auth.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    // 1. Ruta raíz: Redirige al login por defecto
    path: '',
    redirectTo: 'auth',
    pathMatch: 'full'
  },
  {
    // 2. Ruta pública: Nuestro componente de Login/Registro
    path: 'auth',
    component: AuthComponent
  },
  {
    // 3. Ruta privada: Protegida por el Guard y cargada de forma diferida (Lazy Loading)
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    // 4. Ruta comodín (Wildcard): Atrapa cualquier URL inválida
    path: '**',
    redirectTo: 'auth'
  }
];
