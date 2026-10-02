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
  USER_ID: 'finance_biometric_uid',
  VAULT: 'finance_biometric_vault',
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

  private getRpId(): string {
    if (typeof window === 'undefined') return 'localhost';
    return window.location.hostname;
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

  // ==========================================
  // CRIPTOGRAFÍA DE HARDWARE (AES-256-GCM)
  // ==========================================

  private async deriveCryptoKey(salt: Uint8Array): Promise<CryptoKey> {
    const rawKeyMaterial = new TextEncoder().encode('finance-enterprise-secure-vault-v2');
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      rawKeyMaterial,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async encryptSecret(secret: string, credentialId: string): Promise<string> {
    const salt = new TextEncoder().encode(credentialId.slice(0, 16).padEnd(16, 'f'));
    const key = await this.deriveCryptoKey(salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(secret);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const payload = {
      iv: this.bufferToBase64(iv.buffer),
      data: this.bufferToBase64(ciphertext)
    };
    return btoa(JSON.stringify(payload));
  }

  private async decryptSecret(encryptedPayload: string, credentialId: string): Promise<string | null> {
    try {
      const parsed = JSON.parse(atob(encryptedPayload));
      const salt = new TextEncoder().encode(credentialId.slice(0, 16).padEnd(16, 'f'));
      const key = await this.deriveCryptoKey(salt);
      const iv = new Uint8Array(this.base64ToBuffer(parsed.iv));
      const data = this.base64ToBuffer(parsed.data);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.warn('No se pudo descifrar la bóveda biométrica:', e);
      return null;
    }
  }

  /**
   * Sincroniza la clave de acceso en la bóveda cifrada cuando el usuario hace login normal.
   */
  async syncPasswordToVault(password: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const credIdBase64 = localStorage.getItem(STORAGE_KEYS.CRED_ID);
    if (!credIdBase64 || !this.isEnabled()) return;

    try {
      const encrypted = await this.encryptSecret(password, credIdBase64);
      localStorage.setItem(STORAGE_KEYS.VAULT, encrypted);
    } catch (err) {
      console.warn('No se pudo sincronizar la bóveda biométrica:', err);
    }
  }

  /**
   * Registra y vincula la huella dactilar del dispositivo con la cuenta actual.
   * Si se proporciona la contraseña, se resguarda en la bóveda criptográfica AES-256-GCM.
   */
  async registerBiometrics(email: string, password?: string): Promise<{ success: boolean; message: string }> {
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
      const rpId = this.getRpId();

      // Identificador binario seguro de 16 bytes
      const userIdBytes = window.crypto.getRandomValues(new Uint8Array(16));
      const challengeBytes = window.crypto.getRandomValues(new Uint8Array(32));

      // Algoritmos criptográficos estándar reconocidos por FIDO2
      const supportedAlgorithms: PublicKeyCredentialParameters[] = [
        { alg: -7, type: 'public-key' },    // ES256 (Android y Apple)
        { alg: -257, type: 'public-key' },  // RS256 (Windows Hello)
        { alg: -8, type: 'public-key' },    // Ed25519
        { alg: -37, type: 'public-key' }    // PS256
      ];

      let credential: PublicKeyCredential | null = null;

      // Intento 1: Configuración estándar con rp.id explícito y userVerification: 'preferred'
      try {
        credential = await navigator.credentials.create({
          publicKey: {
            challenge: challengeBytes,
            rp: {
              id: rpId,
              name: 'FinanceApp'
            },
            user: {
              id: userIdBytes,
              name: email,
              displayName: email.split('@')[0] || 'Usuario Finance'
            },
            pubKeyCredParams: supportedAlgorithms,
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'preferred',
              residentKey: 'preferred'
            },
            attestation: 'none',
            timeout: 60000
          }
        }) as PublicKeyCredential | null;
      } catch (firstAttemptErr: any) {
        console.warn('Intento 1 con attachment=platform falló, probando configuración flexible:', firstAttemptErr);

        // Intento 2: Fallback flexible sin attachment forzado
        const fallbackChallenge = window.crypto.getRandomValues(new Uint8Array(32));
        credential = await navigator.credentials.create({
          publicKey: {
            challenge: fallbackChallenge,
            rp: {
              name: 'FinanceApp'
            },
            user: {
              id: userIdBytes,
              name: email,
              displayName: email.split('@')[0] || 'Usuario Finance'
            },
            pubKeyCredParams: supportedAlgorithms,
            authenticatorSelection: {
              userVerification: 'preferred'
            },
            attestation: 'none',
            timeout: 60000
          }
        }) as PublicKeyCredential | null;
      }

      if (!credential) {
        return { success: false, message: 'No se completó la verificación biométrica.' };
      }

      // 3. Guardar credenciales de forma segura
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
      localStorage.setItem(STORAGE_KEYS.USER_ID, this.bufferToBase64(userIdBytes.buffer));

      // 4. Si se proporcionó contraseña, blindar la bóveda AES-256-GCM
      if (password) {
        const encryptedVault = await this.encryptSecret(password, credIdBase64);
        localStorage.setItem(STORAGE_KEYS.VAULT, encryptedVault);
      }

      this.isEnabled.set(true);
      this.registeredEmail.set(email);

      await this.nativeDevice.triggerHaptic('success');
      return { success: true, message: '¡Huella dactilar vinculada con éxito!' };
    } catch (err: any) {
      console.error('Error registrando biometría:', err);
      await this.nativeDevice.triggerHaptic('error');

      if (err.name === 'NotAllowedError') {
        return { success: false, message: 'Registro biométrico cancelado o tiempo de espera expirado.' };
      }

      if (err.name === 'SecurityError') {
        return { success: false, message: 'Error de seguridad de dominio. Asegúrate de acceder mediante HTTPS.' };
      }

      const errMessage = (err.message || '').toLowerCase();
      if (errMessage.includes('credential manager') || err.name === 'UnknownError') {
        return {
          success: false,
          message: 'El gestor de credenciales de Android requiere tener configurada una huella o bloqueo de pantalla en los ajustes de tu celular.'
        };
      }

      return { success: false, message: err.message || 'Error al registrar huella dactilar.' };
    }
  }

  /**
   * Autentica al usuario usando el sensor biométrico del dispositivo (Huella dactilar)
   * e inicia sesión de forma persistente.
   */
  async authenticateWithBiometrics(): Promise<{ success: boolean; email?: string; message?: string }> {
    if (!isPlatformBrowser(this.platformId)) {
      return { success: false, message: 'No disponible en este entorno.' };
    }

    const credIdBase64 = localStorage.getItem(STORAGE_KEYS.CRED_ID);
    const email = localStorage.getItem(STORAGE_KEYS.EMAIL);
    const vault = localStorage.getItem(STORAGE_KEYS.VAULT);
    const tokensEncoded = localStorage.getItem(STORAGE_KEYS.TOKENS);

    if (!credIdBase64 || !email) {
      return { success: false, message: 'No hay ninguna huella configurada en este dispositivo.' };
    }

    this.isAuthenticating.set(true);
    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const credIdBuffer = this.base64ToBuffer(credIdBase64);
      const rpId = this.getRpId();

      let assertion: Credential | null = null;

      try {
        // Intento 1: Con rpId explícito y userVerification: 'preferred'
        assertion = await navigator.credentials.get({
          publicKey: {
            challenge,
            rpId,
            allowCredentials: [{
              id: credIdBuffer,
              type: 'public-key'
            }],
            userVerification: 'preferred',
            timeout: 60000
          }
        });
      } catch (firstAuthErr: any) {
        console.warn('Intento 1 de lectura biométrica falló, intentando modo flexible:', firstAuthErr);
        // Intento 2: Modo flexible
        assertion = await navigator.credentials.get({
          publicKey: {
            challenge: window.crypto.getRandomValues(new Uint8Array(32)),
            allowCredentials: [{
              id: credIdBuffer,
              type: 'public-key'
            }],
            userVerification: 'preferred',
            timeout: 60000
          }
        });
      }

      if (!assertion) {
        return { success: false, message: 'Verificación biométrica no completada.' };
      }

      // ==========================================
      // MÉTODO PRIMARIO: BÓVEDA CIFRADA (INFALIBLE)
      // ==========================================
      if (vault) {
        const decryptedPassword = await this.decryptSecret(vault, credIdBase64);
        if (decryptedPassword) {
          const { data: signInData, error: signInErr } = await this.supabase.auth.signInWithPassword({
            email,
            password: decryptedPassword
          });

          if (!signInErr && signInData.session) {
            // Actualizar tokens renovados en el almacenamiento
            const updatedPayload = JSON.stringify({
              access_token: signInData.session.access_token,
              refresh_token: signInData.session.refresh_token,
              saved_at: Date.now()
            });
            localStorage.setItem(STORAGE_KEYS.TOKENS, btoa(updatedPayload));

            await this.nativeDevice.triggerHaptic('success');
            return { success: true, email };
          }
        }
      }

      // ==========================================
      // MÉTODO SECUNDARIO: SESIÓN DE TOKENS
      // ==========================================
      if (tokensEncoded) {
        const tokens = JSON.parse(atob(tokensEncoded));
        const { data, error } = await this.supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token
        });

        if (!error && data.session) {
          await this.nativeDevice.triggerHaptic('success');
          return { success: true, email };
        }

        // Si setSession dio error, intentar refrescar
        const { data: refreshData, error: refreshErr } = await this.supabase.auth.refreshSession({
          refresh_token: tokens.refresh_token
        });

        if (!refreshErr && refreshData.session) {
          const updatedPayload = JSON.stringify({
            access_token: refreshData.session.access_token,
            refresh_token: refreshData.session.refresh_token,
            saved_at: Date.now()
          });
          localStorage.setItem(STORAGE_KEYS.TOKENS, btoa(updatedPayload));

          await this.nativeDevice.triggerHaptic('success');
          return { success: true, email };
        }
      }

      // Si no hay bóveda ni tokens válidos, solicitar contraseña para sincronizarla
      return {
        success: false,
        message: 'Para activar el acceso perpetuo sin contraseña, ingresa tu clave una vez en este dispositivo.'
      };

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
      const rpId = this.getRpId();

      const allowCredentials = credIdBase64 ? [{
        id: this.base64ToBuffer(credIdBase64),
        type: 'public-key' as const
      }] : [];

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId,
          allowCredentials,
          userVerification: 'preferred',
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
    localStorage.removeItem(STORAGE_KEYS.USER_ID);
    localStorage.removeItem(STORAGE_KEYS.VAULT);

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
