// src/app/features/dashboard/dashboard.component.ts
import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

// Módulos de NG-Zorro para el Layout
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterOutlet, // Crucial para renderizar futuras sub-rutas hijas
    NzLayoutModule,
    NzMenuModule,
    NzIconModule,
    NzButtonModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Estado reactivo para el sidebar (colapsado o expandido)
  readonly isCollapsed = signal<boolean>(false);

  /**
   * Alterna el estado del menú lateral
   */
  toggleSidebar(): void {
    this.isCollapsed.update(val => !val);
  }

  /**
   * Destruye la sesión en Supabase y redirige al login
   */
  async onLogout(): Promise<void> {
    const { error } = await this.authService.signOut();
    if (!error) {
      await this.router.navigate(['/auth']);
    } else {
      console.error('Error al cerrar sesión:', error.message);
    }
  }
}
