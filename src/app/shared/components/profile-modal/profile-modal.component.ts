// src/app/shared/components/profile-modal/profile-modal.component.ts
import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';

import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';

import { AuthService } from '../../../core/services/auth.service';
import {
  UserPreferencesService,
  SUPPORTED_CURRENCIES,
  AVATAR_OPTIONS,
  AvatarOption,
  CurrencyOption
} from '../../../core/services/user-preferences.service';

@Component({
  selector: 'app-profile-modal',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    ReactiveFormsModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzTabsModule,
    NzIconModule,
    NzSelectModule,
    NzTagModule
  ],
  templateUrl: './profile-modal.component.html',
  styleUrl: './profile-modal.component.scss'
})
export class ProfileModalComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly userPreferences = inject(UserPreferencesService);
  private readonly fb = inject(FormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isVisible = signal<boolean>(false);
  readonly isSavingProfile = signal<boolean>(false);
  readonly isSavingPassword = signal<boolean>(false);

  // Visibilidad de contraseñas
  readonly passVisible = signal<boolean>(false);
  readonly confirmVisible = signal<boolean>(false);

  readonly currentUser = this.authService.currentUser;
  readonly currencies: CurrencyOption[] = SUPPORTED_CURRENCIES;
  readonly avatars: AvatarOption[] = AVATAR_OPTIONS;

  // Días del mes (1 al 31) para el día de corte
  readonly cutoffDays: number[] = Array.from({ length: 31 }, (_, i) => i + 1);

  profileForm!: FormGroup;
  securityForm!: FormGroup;

  ngOnInit(): void {
    this.initForms();
  }

  private initForms(): void {
    const prefs = this.userPreferences.preferences();

    this.profileForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      avatarId: [prefs.avatarId || 'avatar-wallet', [Validators.required]],
      preferredCurrency: [prefs.preferredCurrency || 'COP', [Validators.required]],
      cutoffDay: [prefs.cutoffDay || 1, [Validators.required, Validators.min(1), Validators.max(31)]]
    });

    this.securityForm = this.fb.group({
      newPassword: ['', [
        Validators.required,
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/)
      ]],
      confirmPassword: ['', [Validators.required, this.confirmPasswordValidator.bind(this)]]
    });

    this.securityForm.get('newPassword')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.securityForm.get('confirmPassword')?.updateValueAndValidity();
      });
  }

  private confirmPasswordValidator(control: AbstractControl): ValidationErrors | null {
    if (!this.securityForm) return null;
    const password = this.securityForm.get('newPassword')?.value;
    return control.value === password ? null : { passwordMismatch: true };
  }

  private translateProfileError(errorMsg: string): string {
    const errorTranslations: Record<string, string> = {
      'New password should be different from the old password.': 'La nueva contraseña debe ser diferente a la actual.',
      'Auth session missing!': 'Tu sesión ha expirado, vuelve a iniciar sesión.'
    };
    return errorTranslations[errorMsg] || 'Ocurrió un error. Por favor, intenta de nuevo.';
  }

  get selectedAvatarMeta(): AvatarOption {
    const currentId = this.profileForm?.get('avatarId')?.value;
    return this.avatars.find(a => a.id === currentId) || this.avatars[0];
  }

  selectAvatar(avatarId: string): void {
    this.profileForm.patchValue({ avatarId });
  }

  public openModal(): void {
    const user = this.currentUser();
    const meta = user?.user_metadata || {};
    const prefs = this.userPreferences.preferences();

    const currentName = meta['full_name'] || '';
    const currentCurrency = meta['preferred_currency'] || prefs.preferredCurrency || 'COP';
    const currentCutoff = meta['cutoff_day'] ? Number(meta['cutoff_day']) : (prefs.cutoffDay || 1);
    const currentAvatar = meta['avatar_id'] || prefs.avatarId || 'avatar-wallet';

    this.profileForm.patchValue({
      fullName: currentName,
      preferredCurrency: currentCurrency,
      cutoffDay: currentCutoff,
      avatarId: currentAvatar
    });

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
      const { fullName, avatarId, preferredCurrency, cutoffDay } = this.profileForm.value;

      // Actualizar preferencias locales y reactivas
      this.userPreferences.updatePreferences({
        avatarId,
        preferredCurrency,
        cutoffDay: Number(cutoffDay)
      });

      // Actualizar metadata en Supabase
      const { error } = await this.authService.updateProfile({
        fullName,
        avatarId,
        avatarUrl: avatarId,
        preferredCurrency,
        cutoffDay: Number(cutoffDay)
      });

      if (error) throw error;

      this.message.success('Perfil y preferencias actualizadas correctamente.');
      this.closeModal();
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
