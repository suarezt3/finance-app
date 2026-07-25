// src/app/features/auth/auth.component.ts
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

// Importaciones Estratégicas de NG-Zorro (Tree-Shaking)
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';


@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [ReactiveFormsModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss'
})
export class AuthComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Estados reactivos locales
  readonly isLoginMode = signal<boolean>(true);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Formulario estrictamente tipado con RegEx de Alta Seguridad
  readonly authForm = this.fb.group({
    fullName: ['', [Validators.minLength(4)]], // Mínimo 4 caracteres (solo activo en registro)
    email: ['', [
      Validators.required,
      Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    ]],
    password: ['', [
      Validators.required,
      // Mínimo 8 caracteres, 1 mayúscula, 1 minúscula, 1 carácter especial
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
    ]]
  });

  /**
   * Helper (basado en tu lógica legacy) para limpiar el HTML.
   * Verifica si un control específico es inválido y fue tocado por el usuario.
   */
  invalidField(field: string): boolean {
    const control = this.authForm.get(field);
    // Retorna true solo si el control existe, es inválido y el usuario interactuó con él
    return !!control && control.invalid && (control.dirty || control.touched);
  }


  toggleMode(): void {
    this.isLoginMode.update(mode => !mode);
    this.errorMessage.set(null);
    this.successMessage.set(null); // Limpiamos alertas de éxito al cambiar de modo
    this.authForm.reset();

    const fullNameControl = this.authForm.controls.fullName;

    if (this.isLoginMode()) {
      fullNameControl.removeValidators(Validators.required);
    } else {
      fullNameControl.addValidators(Validators.required);
    }

    fullNameControl.updateValueAndValidity();
  }

  async onSubmit(): Promise<void> {
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null); // Limpiamos antes de procesar

    const { email, password, fullName } = this.authForm.getRawValue();

    try {
      if (this.isLoginMode()) {
        // FLUJO 1: Iniciar Sesión
        const { error } = await this.authService.signIn(email, password);
        if (error) throw error;
        await this.router.navigate(['/dashboard']);

      } else {
        // FLUJO 2: Registro (Mejora de UX)
        const { error } = await this.authService.signUp(email, password, fullName);
        if (error) throw error;

        // Limpiamos el formulario y pasamos a modo Login automáticamente
        this.toggleMode();

        // Disparamos la alerta de éxito
        this.successMessage.set('¡Registro exitoso! Por favor, verifica tu bandeja de entrada o spam para confirmar tu cuenta.');
      }

    } catch (err: unknown) {
      if (err instanceof Error) {
        this.errorMessage.set(err.message);
      } else {
        this.errorMessage.set('Ocurrió un error inesperado al procesar la solicitud.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onGoogleSignIn(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null); // Limpiamos alertas aquí también

    try {
      await this.authService.signInWithGoogle();
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.errorMessage.set(err.message);
      } else {
        this.errorMessage.set('Error inesperado al iniciar flujo con Google.');
      }
      this.isLoading.set(false);
    }
  }
}
