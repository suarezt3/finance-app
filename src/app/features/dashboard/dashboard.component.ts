// src/app/features/dashboard/dashboard.component.ts
import { Component, inject, signal, computed, viewChild, OnInit, AfterViewInit, DestroyRef } from '@angular/core';
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
import { NzDrawerModule } from 'ng-zorro-antd/drawer';

// Importamos la librería de Onboarding
import { driver } from 'driver.js';

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
    NzDrawerModule,
    ProfileModalComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);

  readonly profileModal = viewChild(ProfileModalComponent);
  readonly user = this.authService.currentUser;

  // Estados
  readonly isDesktopCollapsed = signal<boolean>(false);
  readonly isMobileMenuOpen = signal<boolean>(false);
  readonly isMobileView = signal<boolean>(false);

  // Computados
  readonly userName = computed(() => {
    const currentUser = this.user();
    return currentUser?.user_metadata?.['full_name']
        || currentUser?.email?.split('@')[0]
        || 'Usuario';
  });

  readonly userInitial = computed(() => {
    return this.userName().charAt(0).toUpperCase();
  });

  ngOnInit(): void {
    this.breakpointObserver.observe(['(max-width: 767px)'])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        const isMobile = result.matches;
        this.isMobileView.set(isMobile);

        if (!isMobile) {
          this.isMobileMenuOpen.set(false);
        }
      });
  }

  ngAfterViewInit(): void {
    this.checkAndStartTour();
  }

  toggleMenu(): void {
    if (this.isMobileView()) {
      this.isMobileMenuOpen.update(val => !val);
    } else {
      this.isDesktopCollapsed.update(val => !val);
    }
  }

  closeMobileMenu(): void {
    if (this.isMobileView()) {
      this.isMobileMenuOpen.set(false);
    }
  }

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

  // ==========================================
  // LÓGICA DE ONBOARDING (DRIVER.JS)
  // ==========================================

  private checkAndStartTour(): void {
    const currentUser = this.user();

    // Programación defensiva: evitamos ejecutar lógica si no hay sesión activa
    if (!currentUser?.id) return;

    // Clave de almacenamiento dinámica anclada al ID del usuario
    const storageKey = `tour_completed_${currentUser.id}`;
    const tourCompleted = localStorage.getItem(storageKey);

    if (!tourCompleted && !this.isMobileView()) {

      setTimeout(() => {
        const driverObj = driver({
          showProgress: true,
          doneBtnText: 'Finalizar',
          nextBtnText: 'Siguiente',
          prevBtnText: 'Anterior',
          allowClose: true,
          onDestroyStarted: () => {
            // Guardamos el estado usando la clave específica del usuario
            localStorage.setItem(storageKey, 'true');
            driverObj.destroy();
          },
          steps: [
            {
              element: '#desktop-resumen', // Apuntamos estrictamente al elemento del Sider
              popover: {
                title: '¡Bienvenido a FinanceApp!',
                description: 'Este es el resumen de tus finanzas. Aquí verás gráficos, balance total y el comportamiento de tu dinero.',
                side: 'right',
                align: 'start'
              }
            },
            {
              element: '#desktop-transacciones', // Apuntamos estrictamente al elemento del Sider
              popover: {
                title: 'Gestiona tu Dinero',
                description: 'En esta sección podrás registrar todos tus ingresos, gastos y hacer transferencias de doble partida entre tus cuentas.',
                side: 'right',
                align: 'start'
              }
            },
            {
              element: '#desktop-config', // Apuntamos estrictamente al elemento del Sider
              popover: {
                title: 'Configura tus Catálogos',
                description: 'Antes de iniciar, puedes agregar o eliminar Categorías y Métodos de Pago a tu gusto aquí.',
                side: 'right',
                align: 'start'
              }
            },
            {
              element: '#tour-user-menu', // Este se mantiene igual (no estaba en el template duplicado)
              popover: {
                title: 'Tu Perfil y Ajustes',
                description: 'Aquí puedes actualizar tu nombre de usuario, cambiar tu contraseña o cerrar sesión en cualquier momento.',
                side: 'bottom',
                align: 'end'
              }
            }
          ]
        });

        driverObj.drive();
      }, 600);
    }
  }
}
