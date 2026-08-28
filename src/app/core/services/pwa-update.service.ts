// src/app/core/services/pwa-update.service.ts
import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { NzModalService } from 'ng-zorro-antd/modal';

@Injectable({
  providedIn: 'root'
})
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly modalService = inject(NzModalService);

  constructor() {
    this.initUpdateWatcher();
  }

  /**
   * Inicializa la vigilancia reactiva del Service Worker.
   * Se silencia automáticamente si la app corre en modo desarrollo.
   */
  private initUpdateWatcher(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(
        // Filtramos estrictamente solo los eventos donde la nueva versión ya se descargó en segundo plano
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      )
      .subscribe(() => {
        this.promptUserToUpdate();
      });
  }

  /**
   * Bloquea la UI solicitando la actualización obligatoria.
   * Garantiza la integridad del código en aplicaciones financieras.
   */
  private promptUserToUpdate(): void {
    this.modalService.info({
      nzTitle: 'Actualización Crítica Disponible',
      nzContent: 'Hemos lanzado una nueva versión de FinanceApp con mejoras de seguridad y rendimiento. La aplicación se reiniciará automáticamente para aplicar los cambios.',
      nzClosable: false,
      nzMaskClosable: false,
      nzOkText: 'Actualizar ahora',
      nzOnOk: async () => {
        try {
          await this.swUpdate.activateUpdate();
          document.location.reload();
        } catch (error) {
          console.error('Error al forzar la activación del Service Worker:', error);
          document.location.reload(); // Recarga de contingencia
        }
      }
    });
  }
}
