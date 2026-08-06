// src/app/features/dashboard/dashboard.component.ts
import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common'; // Necesario para el pipe uppercase

// Módulos de NG-Zorro para el Layout
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAvatarModule } from 'ng-zorro-antd/avatar'; // <-- Nuevo: Para el avatar circular
import { NzDropdownModule } from 'ng-zorro-antd/dropdown'; // <-- Nuevo: Para el menú de usuario

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    NzLayoutModule,
    NzMenuModule,
    NzIconModule,
    NzButtonModule,
    NzAvatarModule,
    NzDropdownModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Estado reactivo para el sidebar
  readonly isCollapsed = signal<boolean>(false);

  // Exponemos la señal del usuario activo (Directo desde nuestro Singleton AuthService)
  readonly user = this.authService.currentUser;

  toggleSidebar(): void {
    this.isCollapsed.update(val => !val);
  }

  async onLogout(): Promise<void> {
    const { error } = await this.authService.signOut();
    if (!error) {
      await this.router.navigate(['/auth']);
    } else {
      console.error('Error al cerrar sesión:', error.message);
    }
  }
}
