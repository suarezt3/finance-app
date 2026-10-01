// src/app/core/services/biometric-auth.service.ts
import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';
import { NativeDeviceService } from './native-device.service';

const STORAGE_KEYS = {
  ENABLED: 'finance_biometric_enabled',
  CRED_ID: 'finance_biometric_cred_id',
  EMAIL: 'finance_biometric_email',
  TOKENS: 'finance_biometric_tokens',
};

@Injectable({
  providedIn: 'root'
})
export class BiometricAuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly nativeDevice = inject(NativeDeviceService);
  private readonly platformId = inject(PLATFORM_ID);

  public readonly isSupported = signal<boolean>(false);
  public readonly isEnabled = signal<boolean>(false);
  public readonly registeredEmail = signal<string | null>(null);
  public readonly isAuthenticating = signal<boolean>(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initBiometrics();
    }
  }

  private async initBiometrics(): Promise<void> {
    try {
      const hasWebAuthn = typeof window !== 'undefined' &&
        !!window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

      if (hasWebAuthn) {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        this.isSupported.set(available);
      } else {
        this.isSupported.set(false);
      }

      // Cargar configuración guardada
      const enabled = localStorage.getItem(STORAGE_KEYS.ENABLED) === 'true';
      const email = localStorage.getItem(STORAGE_KEYS.EMAIL);
      const credId = localStorage.getItem(STORAGE_KEYS.CRED_ID);

      if (enabled && email && credId) {
        this.isEnabled.set(true);
        this.registeredEmail.set(email);
      } else {
        this.isEnabled.set(false);
        this.registeredEmail.set(null);
      }
    } catch (err) {
      console.warn('Error al verificar soporte biométrico:', err);
      this.isSupported.set(false);
    }
  }

  /**
   * Registra y vincula la huella dactilar del dispositivo con la cuenta actual.
   */
  async registerBiometrics(email: string): Promise<{ success: boolean; message: string }> {
    if (!isPlatformBrowser(this.platformId)) {
      return { success: false, message: 'Operación no soportada en este entorno.' };
    }

    try {
      // 1. Obtener la sesión activa de Supabase
      const { data: sessionData, error: sessionErr } = await this.supabase.auth.getSession();
      if (sessionErr || !sessionData.session) {
        return { success: false, message: 'Debes tener una sesión activa para habilitar la biometría.' };
      }

      const session = sessionData.session;
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(email);

      // 2. Invocar diálogo nativo del sistema operativo (Huella / Touch ID / Face ID)
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'FinanceApp Enterprise'
          },
          user: {
            id: userId,
            name: email,
            displayName: email.split('@')[0]
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },   // ES256 (estándar Android y iOS)
            { alg: -257, type: 'public-key' }  // RS256 (Windows Hello / Mac)
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000
        }
      }) as PublicKeyCredential | null;

      if (!credential) {
        return { success: false, message: 'No se completó la verificación biométrica.' };
      }

      // 3. Guardar credenciales de forma segura para re-autenticación
      const credIdBase64 = this.bufferToBase64(credential.rawId);
      const tokenPayload = JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        saved_at: Date.now()
      });

      localStorage.setItem(STORAGE_KEYS.ENABLED, 'true');
      localStorage.setItem(STORAGE_KEYS.CRED_ID, credIdBase64);
      localStorage.setItem(STORAGE_KEYS.EMAIL, email);
      localStorage.setItem(STORAGE_KEYS.TOKENS, btoa(tokenPayload));

      this.isEnabled.set(true);
      this.registeredEmail.set(email);

      await this.nativeDevice.triggerHaptic('success');
      return { success: true, message: '¡Huella dactilar vinculada con éxito!' };
    } catch (err: any) {
      console.error('Error registrando biometría:', err);
      await this.nativeDevice.triggerHaptic('error');

      if (err.name === 'NotAllowedError') {
        return { success: false, message: 'Registro biométrico cancelado o tiempo expirado.' };
      }
      return { success: false, message: err.message || 'Error al registrar huella dactilar.' };
    }
  }

  /**
   * Autentica al usuario usando el sensor biométrico del dispositivo (Huella dactilar)
   * y restaura la sesión de Supabase.
   */
  async authenticateWithBiometrics(): Promise<{ success: boolean; email?: string; message?: string }> {
    if (!isPlatformBrowser(this.platformId)) {
      return { success: false, message: 'No disponible en este entorno.' };
    }

    const credIdBase64 = localStorage.getItem(STORAGE_KEYS.CRED_ID);
    const email = localStorage.getItem(STORAGE_KEYS.EMAIL);
    const tokensEncoded = localStorage.getItem(STORAGE_KEYS.TOKENS);

    if (!credIdBase64 || !email || !tokensEncoded) {
      return { success: false, message: 'No hay ninguna huella configurada en este dispositivo.' };
    }

    this.isAuthenticating.set(true);
    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const credIdBuffer = this.base64ToBuffer(credIdBase64);

      // Invocar diálogo nativo del celular o laptop para escanear huella
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{
            id: credIdBuffer,
            type: 'public-key'
          }],
          userVerification: 'required',
          timeout: 60000
        }
      });

      if (!assertion) {
        return { success: false, message: 'Verificación biométrica no completada.' };
      }

      // Restaurar sesión de Supabase
      const tokens = JSON.parse(atob(tokensEncoded));
      const { data, error } = await this.supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token
      });

      if (error) {
        // Intentar refrescar la sesión si el access token expiró
        const { data: refreshData, error: refreshErr } = await this.supabase.auth.refreshSession({
          refresh_token: tokens.refresh_token
        });

        if (refreshErr || !refreshData.session) {
          // Token expirado o revocado, solicitar login tradicional
          return {
            success: false,
            message: 'Tu sesión biométrica ha expirado por seguridad. Por favor ingresa tu contraseña.'
          };
        }

        // Actualizar tokens renovados en storage
        const updatedPayload = JSON.stringify({
          access_token: refreshData.session.access_token,
          refresh_token: refreshData.session.refresh_token,
          saved_at: Date.now()
        });
        localStorage.setItem(STORAGE_KEYS.TOKENS, btoa(updatedPayload));
      } else if (data.session) {
        // Actualizar tokens renovados en storage si hubo cambio
        const updatedPayload = JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          saved_at: Date.now()
        });
        localStorage.setItem(STORAGE_KEYS.TOKENS, btoa(updatedPayload));
      }

      await this.nativeDevice.triggerHaptic('success');
      return { success: true, email };
    } catch (err: any) {
      console.warn('Fallo en autenticación biométrica:', err);
      await this.nativeDevice.triggerHaptic('error');

      if (err.name === 'NotAllowedError') {
        return { success: false, message: 'Verificación de huella cancelada.' };
      }
      return { success: false, message: 'No se pudo verificar la huella dactilar.' };
    } finally {
      this.isAuthenticating.set(false);
    }
  }

  /**
   * Prueba el sensor biométrico del dispositivo sin alterar credenciales.
   */
  async testBiometrics(): Promise<{ success: boolean; message: string }> {
    if (!isPlatformBrowser(this.platformId)) {
      return { success: false, message: 'No disponible en este entorno.' };
    }

    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const credIdBase64 = localStorage.getItem(STORAGE_KEYS.CRED_ID);

      const allowCredentials = credIdBase64 ? [{
        id: this.base64ToBuffer(credIdBase64),
        type: 'public-key' as const
      }] : [];

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials,
          userVerification: 'required',
          timeout: 45000
        }
      });

      if (assertion) {
        await this.nativeDevice.triggerHaptic('success');
        return { success: true, message: '¡Sensor biométrico validado con éxito!' };
      }
      return { success: false, message: 'No se detectó confirmación biométrica.' };
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        return { success: false, message: 'Prueba cancelada por el usuario.' };
      }
      return { success: false, message: err?.message || 'Error al probar el sensor.' };
    }
  }

  /**
   * Desvincula y elimina las credenciales biométricas de este equipo.
   */
  disableBiometrics(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    localStorage.removeItem(STORAGE_KEYS.ENABLED);
    localStorage.removeItem(STORAGE_KEYS.CRED_ID);
    localStorage.removeItem(STORAGE_KEYS.EMAIL);
    localStorage.removeItem(STORAGE_KEYS.TOKENS);

    this.isEnabled.set(false);
    this.registeredEmail.set(null);
  }

  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
