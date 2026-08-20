// src/app/features/dashboard/dashboard.component.ts
import { Component, inject, signal, computed, viewChild, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Router, RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

import { AuthService } from '../../core/services/auth.service';
import { ProfileModalComponent } from '../../shared/components/profile-modal/profile-modal.component';

// Módulos de NG-Zorro
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzDrawerModule } from 'ng-zorro-antd/drawer'; // <-- NUEVO: Para el panel móvil

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
    NzDrawerModule, // <-- Inyectado
    ProfileModalComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef); // <-- Para evitar memory leaks en el listener

  readonly profileModal = viewChild(ProfileModalComponent);
  readonly user = this.authService.currentUser;

  // ==========================================
  // ESTADOS REACTIVOS DE LAYOUT
  // ==========================================

  readonly isDesktopCollapsed = signal<boolean>(false);
  readonly isMobileMenuOpen = signal<boolean>(false);
  readonly isMobileView = signal<boolean>(false); // Bandera para saber si estamos en celular

  // ==========================================
  // COMPUTADOS DE USUARIO
  // ==========================================

  readonly userName = computed(() => {
    const currentUser = this.user();
    return currentUser?.user_metadata?.['full_name']
        || currentUser?.email?.split('@')[0]
        || 'Usuario';
  });

  readonly userInitial = computed(() => {
    return this.userName().charAt(0).toUpperCase();
  });

  // ==========================================
  // CICLO DE VIDA Y LISTENERS
  // ==========================================

  ngOnInit(): void {
    // Escuchamos activamente si la pantalla es menor a 768px (Mobile breakpoint común)
    this.breakpointObserver.observe(['(max-width: 767px)'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        const isMobile = result.matches;
        this.isMobileView.set(isMobile);

        // Si redimensionamos a escritorio, nos aseguramos de cerrar el drawer móvil
        if (!isMobile) {
          this.isMobileMenuOpen.set(false);
        }
      });
  }

  // ==========================================
  // LÓGICA DE NAVEGACIÓN Y MENÚS
  // ==========================================

  /**
   * Controlador inteligente del botón hamburguesa/colapsar.
   * Actúa sobre el Drawer en móvil, y sobre el Sider en escritorio.
   */
  toggleMenu(): void {
    if (this.isMobileView()) {
      this.isMobileMenuOpen.update(val => !val);
    } else {
      this.isDesktopCollapsed.update(val => !val);
    }
  }

  /**
   * Cierra el Drawer. Se llama al hacer clic en un enlace en versión móvil.
   */
  closeMobileMenu(): void {
    if (this.isMobileView()) {
      this.isMobileMenuOpen.set(false);
    }
  }

  /**
   * Retorna el icono correcto basándose en el estado actual de la vista activa.
   */
  getMenuIcon(): string {
    if (this.isMobileView()) {
      return this.isMobileMenuOpen() ? 'menu-unfold' : 'menu-fold';
    }
    return this.isDesktopCollapsed() ? 'menu-unfold' : 'menu-fold';
  }

  openProfile(): void {
    this.profileModal()?.openModal();
  }

  async onLogout(): Promise<void> {
    try {
      const { error } = await this.authService.signOut();
      if (error) throw error;

      await this.router.navigate(['/auth']);
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error('Error al cerrar sesión:', err.message);
        this.message.error('Hubo un problema al cerrar tu sesión. Intenta de nuevo.');
      }
    }
  }
}
