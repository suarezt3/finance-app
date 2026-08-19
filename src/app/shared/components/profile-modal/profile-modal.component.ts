// src/app/shared/components/profile-modal/profile-modal.component.ts
import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzIconModule } from 'ng-zorro-antd/icon'; // <-- IMPORTANTE: Para los íconos de ojito

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-profile-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzTabsModule,
    NzIconModule // <-- Inyectado en el componente
  ],
  templateUrl: './profile-modal.component.html',
  styleUrl: './profile-modal.component.scss'
})
export class ProfileModalComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly destroyRef = inject(DestroyRef); // <-- Para limpieza de suscripciones

  readonly isVisible = signal<boolean>(false);
  readonly isSavingProfile = signal<boolean>(false);
  readonly isSavingPassword = signal<boolean>(false);

  // NUEVO: Signals para la visibilidad de las contraseñas
  readonly passVisible = signal<boolean>(false);
  readonly confirmVisible = signal<boolean>(false);

  readonly currentUser = this.authService.currentUser;

  profileForm!: FormGroup;
  securityForm!: FormGroup;

  ngOnInit(): void {
    this.initForms();
  }

  private initForms(): void {
    this.profileForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]]
    });

    this.securityForm = this.fb.group({
      newPassword: ['', [
        Validators.required,
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
      ]],
      // El validador ahora va directamente en el control individual
      confirmPassword: ['', [Validators.required, this.confirmPasswordValidator.bind(this)]]
    });

    // Re-evaluar confirmPassword si newPassword cambia mientras el usuario escribe
    this.securityForm.get('newPassword')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.securityForm.get('confirmPassword')?.updateValueAndValidity();
      });
  }

  /**
   * Validador asociado directamente a confirmPassword para feedback visual inmediato
   */
  private confirmPasswordValidator(control: AbstractControl): ValidationErrors | null {
    if (!this.securityForm) return null; // Evita error en la inicialización
    const password = this.securityForm.get('newPassword')?.value;
    return control.value === password ? null : { passwordMismatch: true };
  }

  /**
   * DICCIONARIO DE ERRORES: Intercepta y traduce mensajes de Supabase
   */
  private translateProfileError(errorMsg: string): string {
    const errorTranslations: Record<string, string> = {
      'New password should be different from the old password.': 'La nueva contraseña debe ser diferente a la actual.',
      'Auth session missing!': 'Tu sesión ha expirado, vuelve a iniciar sesión.'
    };
    return errorTranslations[errorMsg] || 'Ocurrió un error. Por favor, intenta de nuevo.';
  }

  public openModal(): void {
    const currentName = this.currentUser()?.user_metadata?.['full_name'] || '';
    this.profileForm.patchValue({ fullName: currentName });

    this.securityForm.reset();
    this.passVisible.set(false);
    this.confirmVisible.set(false);

    this.isVisible.set(true);
  }

  public closeModal(): void {
    this.isVisible.set(false);
  }

  async updateProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      Object.values(this.profileForm.controls).forEach(control => {
        control.markAsDirty();
        control.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }

    this.isSavingProfile.set(true);
    try {
      const { fullName } = this.profileForm.value;
      const { error } = await this.authService.updateProfileName(fullName);

      if (error) throw error;

      this.message.success('Perfil actualizado correctamente.');
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.message.error(this.translateProfileError(err.message));
      }
    } finally {
      this.isSavingProfile.set(false);
    }
  }

  async updatePassword(): Promise<void> {
    if (this.securityForm.invalid) {
      Object.values(this.securityForm.controls).forEach(control => {
        control.markAsDirty();
        control.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }

    this.isSavingPassword.set(true);
    try {
      const { newPassword } = this.securityForm.value;
      const { error } = await this.authService.updatePassword(newPassword);

      if (error) throw error;

      this.message.success('Contraseña actualizada con éxito.');
      this.securityForm.reset();
      this.closeModal();
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.message.error(this.translateProfileError(err.message));
      }
    } finally {
      this.isSavingPassword.set(false);
    }
  }
}
