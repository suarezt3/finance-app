// src/app/features/auth/auth.component.ts
import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BiometricAuthService } from '../../core/services/biometric-auth.service';

// Importaciones de NG-Zorro
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule
  ],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss'
})
export class AuthComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  readonly biometricAuth = inject(BiometricAuthService);

  // Estados de la vista
  readonly isLoginMode = signal<boolean>(true);
  readonly isRecoveryMode = signal<boolean>(false);
  readonly isLoading = signal<boolean>(false);
  readonly rememberDevice = signal<boolean>(true);
  readonly passwordVisible = signal<boolean>(false);

  // Señal reactiva para inspección de seguridad de contraseña
  readonly passwordInputValue = signal<string>('');

  readonly passwordHasMinLength = computed(() => this.passwordInputValue().length >= 8);
  readonly passwordHasUpper = computed(() => /[A-Z]/.test(this.passwordInputValue()));
  readonly passwordHasLower = computed(() => /[a-z]/.test(this.passwordInputValue()));
  readonly passwordHasSpecial = computed(() => /[^a-zA-Z0-9]/.test(this.passwordInputValue()));

  readonly authForm = this.fb.group({
    fullName: ['', [Validators.minLength(4)]],
    email: ['', [
      Validators.required,
      Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    ]],
    password: ['', [
      Validators.required,
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
    ]]
  });

  invalidField(field: string): boolean {
    const control = this.authForm.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  onPasswordInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.passwordInputValue.set(target ? target.value : '');
  }

  // ==========================================
  // MANEJO DE ESTADOS Y VALIDACIONES
  // ==========================================

  setMode(login: boolean): void {
    if (this.isLoginMode() === login && !this.isRecoveryMode()) {
      return;
    }
    this.isLoginMode.set(login);
    this.isRecoveryMode.set(false);
    this.authForm.reset();
    this.passwordInputValue.set('');
    this.updateValidators();
  }

  toggleMode(): void {
    this.setMode(!this.isLoginMode());
  }

  toggleRecoveryMode(): void {
    this.isRecoveryMode.update(mode => !mode);
    this.authForm.reset();
    this.passwordInputValue.set('');
    this.updateValidators();
  }

  /**
   * Ajusta los validadores requeridos según el modo activo.
   * Evita errores de validación en campos ocultos.
   */
  private updateValidators(): void {
    const fullNameControl = this.authForm.controls.fullName;
    const passwordControl = this.authForm.controls.password;

    fullNameControl.clearValidators();
    passwordControl.clearValidators();

    fullNameControl.addValidators([Validators.minLength(4)]);
    const passwordValidators = [
      Validators.required,
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
    ];

    if (this.isRecoveryMode()) {
      // Recuperación: Ningún validador extra requerido (solo el email importa)
    } else if (this.isLoginMode()) {
      // Login: Contraseña requerida
      passwordControl.addValidators(passwordValidators);
    } else {
      // Registro: Todo requerido
      fullNameControl.addValidators([Validators.required, Validators.minLength(4)]);
      passwordControl.addValidators(passwordValidators);
    }

    fullNameControl.updateValueAndValidity();
    passwordControl.updateValueAndValidity();
  }

  // ==========================================
  // INTEGRACIÓN CON API
  // ==========================================

  private translateAuthError(errorMsg: string): string {
    const errorTranslations: Record<string, string> = {
      'User already registered': 'Este correo ya se encuentra registrado en el sistema.',
      'Invalid login credentials': 'El correo electrónico o la contraseña son incorrectos.',
      'Email not confirmed': 'Debes confirmar tu correo electrónico antes de iniciar sesión.',
      'For security purposes, you can only request this once every 60 seconds': 'Por razones de seguridad, debes esperar 60 segundos antes de solicitar otro enlace.',
      'User not found': 'No existe ningún usuario registrado con este correo corporativo.'
    };

    return errorTranslations[errorMsg] || 'Ocurrió un error en la autenticación. Por favor, intenta de nuevo.';
  }

  async onSubmit(): Promise<void> {
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const { email, password, fullName } = this.authForm.getRawValue();

    try {
      if (this.isRecoveryMode()) {
        // FLUJO DE RECUPERACIÓN
        const { error } = await this.authService.resetPassword(email);
        if (error) throw error;

        this.message.success('Enlace de recuperación enviado exitosamente a tu correo.', { nzDuration: 6000 });
        this.toggleRecoveryMode();

      } else if (this.isLoginMode()) {
        // FLUJO DE LOGIN
        const { error } = await this.authService.signIn(email, password);
        if (error) throw error;

        // Asegurar que la sesión y tokens estén listos antes de navegar al dashboard
        await this.authService.ensureAuthenticatedSession();

        // Si la huella está vinculada a esta cuenta, sincronizar la bóveda cifrada
        if (this.biometricAuth.isEnabled() && this.biometricAuth.registeredEmail() === email) {
          await this.biometricAuth.syncPasswordToVault(password);
        }

        this.message.success('Sesión corporativa iniciada con éxito.');
        this.authForm.reset();
        await this.router.navigate(['/dashboard']);

      } else {
        // FLUJO DE REGISTRO
        const { error } = await this.authService.signUp(email, password, fullName);
        if (error) throw error;

        this.setMode(true);
        this.message.success('Registro completado. Por favor, revisa tu correo electrónico institucional para validar tu acceso.', { nzDuration: 6000 });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        const localizedMessage = this.translateAuthError(err.message);
        this.message.error(localizedMessage);
      } else {
        this.message.error('Ocurrió un error inesperado al procesar la solicitud.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onGoogleSignIn(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.authService.signInWithGoogle();
    } catch (err: unknown) {
      if (err instanceof Error) {
        const localizedMessage = this.translateAuthError(err.message);
        this.message.error(localizedMessage);
      } else {
        this.message.error('Error al conectar con el proveedor de identidad institucional.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onBiometricLogin(): Promise<void> {
    if (this.isLoading() || this.biometricAuth.isAuthenticating()) return;

    this.isLoading.set(true);
    try {
      const result = await this.biometricAuth.authenticateWithBiometrics();
      if (result.success) {
        this.message.success('Huella dactilar verificada con éxito.');
        await this.authService.ensureAuthenticatedSession();
        await this.router.navigate(['/dashboard']);
      } else if (result.message) {
        this.message.warning(result.message);
      }
    } catch (err: any) {
      console.error('Error en autenticación biométrica:', err);
      this.message.error('No se pudo verificar la huella dactilar.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
