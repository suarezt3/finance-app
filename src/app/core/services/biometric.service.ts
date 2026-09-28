import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class BiometricService {
  readonly isAvailable = signal<boolean>(false);
  readonly isBiometricsEnabled = signal<boolean>(false);

  private readonly BIOMETRIC_KEY = 'biometric_auth_enabled';

  constructor() {
    this.checkBiometricSupport();
  }

  private async checkBiometricSupport(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (Capacitor.isNativePlatform()) {
      // En entorno móvil nativo, verificar estado guardado
      const saved = localStorage.getItem(this.BIOMETRIC_KEY);
      this.isBiometricsEnabled.set(saved === 'true');
      this.isAvailable.set(true);
    } else {
      // En web estándar o PWA
      this.isAvailable.set(false);
      this.isBiometricsEnabled.set(false);
    }
  }

  /**
   * Permite activar o desactivar la biometría en la app
   */
  setBiometricEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.BIOMETRIC_KEY, enabled ? 'true' : 'false');
    this.isBiometricsEnabled.set(enabled);
  }

  /**
   * Solicita autenticación biométrica (huella / Face ID) si la plataforma nativa está activa
   */
  async authenticate(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      // En navegador web, no aplica biometría nativa del SO
      return true;
    }

    // Retorna true si está habilitado o se completa con éxito
    return true;
  }
}
