// src/app/features/auth/auth.component.ts
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

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

  // Estados de la vista
  readonly isLoginMode = signal<boolean>(true);
  readonly isRecoveryMode = signal<boolean>(false); // NUEVO: Estado para recuperar contraseña
  readonly isLoading = signal<boolean>(false);

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

  // ==========================================
  // MANEJO DE ESTADOS Y VALIDACIONES
  // ==========================================

  toggleMode(): void {
    this.isLoginMode.update(mode => !mode);
    this.isRecoveryMode.set(false); // Si cambia entre login/registro, apaga la recuperación
    this.authForm.reset();
    this.updateValidators();
  }

  toggleRecoveryMode(): void {
    this.isRecoveryMode.update(mode => !mode);
    this.authForm.reset();
    this.updateValidators();
  }

  /**
   * Ajusta los validadores requeridos según el modo activo.
   * Evita errores de validación en campos ocultos.
   */
  private updateValidators(): void {
    const fullNameControl = this.authForm.controls.fullName;
    const passwordControl = this.authForm.controls.password;

    // 1. Limpiamos validadores condicionales
    fullNameControl.clearValidators();
    passwordControl.clearValidators();

    // 2. Base de validadores fijos
    fullNameControl.addValidators([Validators.minLength(4)]);
    const passwordValidators = [
      Validators.required,
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
    ];

    // 3. Aplicamos lógica según el estado actual
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

    // 4. Refrescamos el estado del formulario
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
      // NUEVOS: Manejo de errores para la recuperación
      'For security purposes, you can only request this once every 60 seconds': 'Por seguridad, debes esperar 60 segundos antes de solicitar otro correo.',
      'User not found': 'No existe un usuario registrado con este correo electrónico.'
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

        this.message.success('Te hemos enviado un enlace al correo para recuperar tu contraseña.', { nzDuration: 6000 });
        this.toggleRecoveryMode(); // Regresamos al login tras el éxito

      } else if (this.isLoginMode()) {
        // FLUJO DE LOGIN
        const { error } = await this.authService.signIn(email, password);
        if (error) throw error;

        this.message.success('¡Bienvenido de vuelta!');
        this.authForm.reset();
        await this.router.navigate(['/dashboard']);

      } else {
        // FLUJO DE REGISTRO
        const { error } = await this.authService.signUp(email, password, fullName);
        if (error) throw error;

        this.toggleMode();
        this.message.success('¡Registro exitoso! Por favor, verifica tu bandeja de entrada o spam para confirmar tu cuenta.', { nzDuration: 6000 });
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
        this.message.error('Error inesperado al iniciar flujo con Google.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
