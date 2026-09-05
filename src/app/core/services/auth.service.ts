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
    return this.supabase.auth.signInWithPassword({
      email,
      password
    });
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
    return this.supabase.auth.signOut();
  }

  async updateProfileName(fullName: string): Promise<UserResponse> {
    return this.supabase.auth.updateUser({
      data: { full_name: fullName }
    });
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
