// src/app/core/services/auth.service.ts
import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { AuthResponse, Session, User, UserResponse } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<User | null>(null);
  public readonly currentUser = this._currentUser.asReadonly();

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeAuthState();
    }
  }

  private async initializeAuthState(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this._currentUser.set(data.session?.user ?? null);

    this.supabase.auth.onAuthStateChange((event, session) => {
      this._currentUser.set(session?.user ?? null);

      if (event === 'PASSWORD_RECOVERY') {
        this.router.navigate(['/auth/update-password']);
      }
    });
  }

  async signUp(email: string, password: string, fullName: string): Promise<AuthResponse> {
    return this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });
  }

  async signIn(email: string, password: string): Promise<AuthResponse> {
    const response = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (response.data?.user) {
      this._currentUser.set(response.data.user);
    }

    return response;
  }

  /**
   * Garantiza que la sesión y el token de acceso estén activos en el cliente
   * antes de realizar navegaciones a vistas protegidas.
   */
  async ensureAuthenticatedSession(maxAttempts = 5, delayMs = 150): Promise<Session | null> {
    for (let i = 0; i < maxAttempts; i++) {
      const session = await this.getSession();
      if (session?.user) {
        this._currentUser.set(session.user);
        return session;
      }
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    return null;
  }

  async signInWithGoogle(): Promise<void> {
    // BLINDAJE: Solo ejecutamos lógica de redirección si estamos en el navegador
    if (!isPlatformBrowser(this.platformId)) return;

    const redirectUrl = `${this.document.location.origin}/dashboard`;
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });

    if (error) throw error;
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      console.error('Error obteniendo la sesión:', error.message);
      return null;
    }
    return data.session;
  }

  async signOut(): Promise<{ error: Error | null }> {
    return this.supabase.auth.signOut({ scope: 'local' });
  }

  async updateProfileName(fullName: string): Promise<UserResponse> {
    return this.updateProfile({ fullName });
  }

  async updateProfile(profileData: {
    fullName?: string;
    avatarId?: string;
    avatarUrl?: string;
    preferredCurrency?: string;
    cutoffDay?: number;
    savingsGoal?: number;
    savingsGoalName?: string;
    expenseAlertThreshold?: number;
    budgetAlertPercentage?: number;
    alertsEnabled?: boolean;
  }): Promise<UserResponse> {
    const currentMeta = this._currentUser()?.user_metadata || {};
    const avatarKey = profileData.avatarId || profileData.avatarUrl;

    const updatedMeta = {
      ...currentMeta,
      ...(profileData.fullName !== undefined ? { full_name: profileData.fullName } : {}),
      ...(avatarKey !== undefined ? { avatar_id: avatarKey, avatar_url: avatarKey } : {}),
      ...(profileData.preferredCurrency !== undefined ? { preferred_currency: profileData.preferredCurrency } : {}),
      ...(profileData.cutoffDay !== undefined ? { cutoff_day: profileData.cutoffDay } : {}),
      ...(profileData.savingsGoal !== undefined ? { savings_goal: profileData.savingsGoal } : {}),
      ...(profileData.savingsGoalName !== undefined ? { savings_goal_name: profileData.savingsGoalName } : {}),
      ...(profileData.expenseAlertThreshold !== undefined ? { expense_alert_threshold: profileData.expenseAlertThreshold } : {}),
      ...(profileData.budgetAlertPercentage !== undefined ? { budget_alert_percentage: profileData.budgetAlertPercentage } : {}),
      ...(profileData.alertsEnabled !== undefined ? { alerts_enabled: profileData.alertsEnabled } : {})
    };

    const response = await this.supabase.auth.updateUser({
      data: updatedMeta
    });

    if (response.data?.user) {
      this._currentUser.set(response.data.user);
    }

    return response;
  }

  async updatePassword(newPassword: string): Promise<UserResponse> {
    return this.supabase.auth.updateUser({
      password: newPassword
    });
  }

  async resetPassword(email: string): Promise<{ error: Error | null }> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('La recuperación de contraseña solo puede ejecutarse en el navegador.');
    }

    const redirectUrl = `${this.document.location.origin}/auth/update-password`;

    return this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
  }
}
