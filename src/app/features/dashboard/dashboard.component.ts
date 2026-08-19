// src/app/features/dashboard/dashboard.component.ts
import { Component, inject, signal, computed, viewChild } from '@angular/core'; // <-- Añadido 'computed'
import { Router, RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common';

// Módulos de NG-Zorro para el Layout
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMessageService } from 'ng-zorro-antd/message'; // <-- NUEVO: Para feedback visual de errores

import { ProfileModalComponent } from '../../shared/components/profile-modal/profile-modal.component';

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
    NzDropdownModule,
    ProfileModalComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService); // <-- Inyectamos el servicio de mensajes
  readonly profileModal = viewChild(ProfileModalComponent);

  // Estado reactivo para el sidebar
  readonly isCollapsed = signal<boolean>(false);

  // Exponemos la señal del usuario activo (Directo desde nuestro Singleton AuthService)
  readonly user = this.authService.currentUser;

  // NUEVO: Computamos el nombre del usuario dinámicamente y con protecciones
  readonly userName = computed(() => {
    const currentUser = this.user();
    // Prioridad: 1. Nombre completo, 2. Prefijo del correo, 3. 'Usuario' por defecto
    return currentUser?.user_metadata?.['full_name']
        || currentUser?.email?.split('@')[0]
        || 'Usuario';
  });

  // NUEVO: Método para abrir el modal desde el HTML
  openProfile(): void {
    this.profileModal()?.openModal();
  }

  // NUEVO: Computamos la letra inicial para el Avatar en la cabecera
  readonly userInitial = computed(() => {
    return this.userName().charAt(0).toUpperCase();
  });

  toggleSidebar(): void {
    this.isCollapsed.update(val => !val);
  }

  async onLogout(): Promise<void> {
    try {
      const { error } = await this.authService.signOut();
      if (error) throw error;

      await this.router.navigate(['/auth']);
    } catch (error: any) {
      console.error('Error al cerrar sesión:', error.message);
      // UX Mejorada: Si falla, informamos al usuario en lugar de solo fallar en consola
      this.message.error('Hubo un problema al cerrar tu sesión. Intenta de nuevo.');
    }
  }
}
