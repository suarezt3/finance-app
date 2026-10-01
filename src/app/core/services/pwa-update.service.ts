// src/app/core/services/pwa-update.service.ts
import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { NzModalService } from 'ng-zorro-antd/modal';

@Injectable({
  providedIn: 'root'
})
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly modalService = inject(NzModalService);
  private readonly platformId = inject(PLATFORM_ID);

  public readonly isChecking = signal<boolean>(false);
  public readonly updateAvailable = signal<boolean>(false);
  public readonly lastChecked = signal<Date | null>(null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initUpdateWatcher();
    }
  }

  /**
   * Inicializa la vigilancia reactiva y proactiva del Service Worker.
   */
  private initUpdateWatcher(): void {
    if (!this.swUpdate.isEnabled) return;

    // 1. Escuchar cuando una nueva versión ya se descargó en segundo plano
    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateAvailable.set(true);
        this.promptUserToUpdate();
      });

    // 2. Manejo de estados no recuperables (si el caché local queda inconsistente)
    this.swUpdate.unrecoverable.subscribe(event => {
      console.warn('Service Worker en estado no recuperable:', event.reason);
      document.location.reload();
    });

    // 3. Verificación inmediata al iniciar (espera 2 segundos para no bloquear la carga inicial)
    setTimeout(() => {
      this.checkForUpdate();
    }, 2000);

    // 4. Verificación proactiva cuando el usuario desbloquea el móvil o vuelve a la pestaña
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkForUpdate();
        }
      });
      window.addEventListener('focus', () => {
        this.checkForUpdate();
      });
    }

    // 5. Sondeo periódico cada 15 minutos en segundo plano
    setInterval(() => {
      this.checkForUpdate();
    }, 15 * 60 * 1000);
  }

  /**
   * Comprueba si el servidor tiene una versión nueva de la aplicación.
   */
  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) return false;

    this.isChecking.set(true);
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();
      this.lastChecked.set(new Date());
      if (hasUpdate) {
        this.updateAvailable.set(true);
      }
      return hasUpdate;
    } catch (err) {
      console.warn('No se pudo verificar actualización en el Service Worker:', err);
      return false;
    } finally {
      this.isChecking.set(false);
    }
  }

  /**
   * Método público para invocación manual desde la pantalla de Configuración.
   */
  async checkForUpdateManual(): Promise<{ hasUpdate: boolean; message: string }> {
    if (!this.swUpdate.isEnabled) {
      return {
        hasUpdate: false,
        message: 'El Service Worker no está activo en este entorno (modo desarrollo o navegador sin soporte).'
      };
    }

    this.isChecking.set(true);
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();
      this.lastChecked.set(new Date());

      if (hasUpdate) {
        this.updateAvailable.set(true);
        this.promptUserToUpdate();
        return {
          hasUpdate: true,
          message: '¡Se encontró una nueva versión! Actualizando...'
        };
      } else {
        return {
          hasUpdate: false,
          message: '¡Ya tienes instalada la versión más reciente!'
        };
      }
    } catch (err: any) {
      return {
        hasUpdate: false,
        message: 'No fue posible conectar con el servidor para comprobar versiones.'
      };
    } finally {
      this.isChecking.set(false);
    }
  }

  /**
   * Fuerza la activación inmediata de la nueva versión y recarga la página.
   */
  async activateUpdateNow(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      document.location.reload();
      return;
    }

    try {
      await this.swUpdate.activateUpdate();
      document.location.reload();
    } catch (error) {
      console.error('Error al forzar la activación del Service Worker:', error);
      document.location.reload();
    }
  }

  /**
   * Bloquea la UI solicitando la actualización obligatoria.
   */
  private promptUserToUpdate(): void {
    this.modalService.info({
      nzTitle: 'Nueva Versión Disponible',
      nzContent: 'Hemos publicado una nueva versión con mejoras y nuevas funciones. La aplicación se actualizará para aplicar los cambios.',
      nzClosable: false,
      nzMaskClosable: false,
      nzOkText: 'Actualizar ahora',
      nzOnOk: async () => {
        await this.activateUpdateNow();
      }
    });
  }
}
