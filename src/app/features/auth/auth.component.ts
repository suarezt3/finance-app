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

  readonly isLoginMode = signal<boolean>(true);
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

  toggleMode(): void {
    this.isLoginMode.update(mode => !mode);
    this.authForm.reset();

    const fullNameControl = this.authForm.controls.fullName;
    if (this.isLoginMode()) {
      fullNameControl.removeValidators(Validators.required);
    } else {
      fullNameControl.addValidators(Validators.required);
    }
    fullNameControl.updateValueAndValidity();
  }

  /**
   * DICCIONARIO DE ERRORES (Clean Code)
   * Mapea los mensajes técnicos en inglés de Supabase a respuestas amigables en español.
   */
  private translateAuthError(errorMsg: string): string {
    const errorTranslations: Record<string, string> = {
      'User already registered': 'Este correo ya se encuentra registrado en el sistema.',
      'Invalid login credentials': 'El correo electrónico o la contraseña son incorrectos.',
      'Email not confirmed': 'Debes confirmar tu correo electrónico antes de iniciar sesión.',
      // Puedes agregar más mapeos de Supabase aquí en el futuro
    };

    // Retorna la traducción si existe, o un mensaje genérico por defecto
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
      if (this.isLoginMode()) {
        const { error } = await this.authService.signIn(email, password);
        if (error) throw error;

        // SOLUCIÓN UX: Feedback visual y limpieza de estado
        this.message.success('¡Bienvenido de vuelta!');
        this.authForm.reset();

        // La navegación fallará silenciosamente si la ruta no existe, pero el usuario verá el éxito
        await this.router.navigate(['/dashboard']);

      } else {
        const { error } = await this.authService.signUp(email, password, fullName);
        if (error) throw error;

        this.toggleMode();
        this.message.success('¡Registro exitoso! Por favor, verifica tu bandeja de entrada o spam para confirmar tu cuenta.', { nzDuration: 5000 });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        // SOLUCIÓN ERRORES: Pasamos el error nativo por nuestro traductor
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
