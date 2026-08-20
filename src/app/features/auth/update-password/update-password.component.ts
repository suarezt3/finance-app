// src/app/features/auth/update-password/update-password.component.ts
import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../app/core/services/auth.service';

// Importaciones de NG-Zorro
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-update-password',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NzInputModule,
    NzButtonModule
  ],
  templateUrl: './update-password.component.html',
  styleUrl: './update-password.component.scss'
})
export class UpdatePasswordComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal<boolean>(false);

  readonly updateForm = this.fb.group({
    newPassword: ['', [
      Validators.required,
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
    ]],
    confirmPassword: ['', [Validators.required, this.confirmPasswordValidator.bind(this)]]
  });

  ngOnInit(): void {
    this.updateForm.get('newPassword')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateForm.get('confirmPassword')?.updateValueAndValidity();
      });
  }

  private confirmPasswordValidator(control: AbstractControl): ValidationErrors | null {
    if (!this.updateForm) return null;
    const password = this.updateForm.get('newPassword')?.value;
    return control.value === password ? null : { passwordMismatch: true };
  }

  invalidField(field: string): boolean {
    const control = this.updateForm.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  // ==========================================
  // MANEJO DE ERRORES (UX / CLEAN CODE)
  // ==========================================

  /**
   * Intercepta los mensajes nativos de Supabase y los traduce
   * a un lenguaje amigable y localizado para el usuario.
   */
  private translateUpdateError(errorMsg: string): string {
    const errorTranslations: Record<string, string> = {
      'New password should be different from the old password.': 'La nueva contraseña debe ser diferente a la actual.',
      'Auth session missing!': 'El enlace ha expirado o es inválido. Por favor, solicita uno nuevo.'
    };
    return errorTranslations[errorMsg] || 'Ocurrió un error al intentar actualizar tu contraseña.';
  }

  async onSubmit(): Promise<void> {
    if (this.updateForm.invalid) {
      this.updateForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const { newPassword } = this.updateForm.getRawValue();

    try {
      const { error } = await this.authService.updatePassword(newPassword);
      if (error) throw error;

      this.message.success('Contraseña actualizada exitosamente. Por favor, inicia sesión nuevamente.');

      await this.authService.signOut();
      await this.router.navigate(['/auth']);
    } catch (err: unknown) {
      if (err instanceof Error) {
        // APLICACIÓN: Pasamos el mensaje del backend por nuestro filtro de traducción
        this.message.error(this.translateUpdateError(err.message));
      } else {
        this.message.error('Ocurrió un error inesperado.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
