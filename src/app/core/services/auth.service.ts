// src/app/core/services/auth.service.ts
import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { AuthResponse, Session, User, UserResponse } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

  // 1. Encapsulación estricta del estado: Privado para escritura, Público para lectura
  private readonly _currentUser = signal<User | null>(null);
  public readonly currentUser = this._currentUser.asReadonly();

  constructor() {
    // 2. Prevención de fugas de memoria en Server-Side Rendering (SSR)
    if (isPlatformBrowser(this.platformId)) {
      this.initializeAuthState();
    }
  }

  private async initializeAuthState(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this._currentUser.set(data.session?.user ?? null);

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._currentUser.set(session?.user ?? null);
    });
  }

  async signUp(email: string, password: string, fullName: string): Promise<AuthResponse> {
    return this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName // Se guarda en la columna JSONB raw_user_meta_data
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
    // Uso de this.document en lugar de window directo para soporte nativo SSR
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

  // ==========================================
  // GESTIÓN DE PERFIL (FASE 1)
  // ==========================================

  /**
   * Actualiza el nombre del usuario en los metadatos JSONB de Supabase.
   */
  async updateProfileName(fullName: string): Promise<UserResponse> {
    return this.supabase.auth.updateUser({
      data: { full_name: fullName }
    });
  }

  /**
   * Actualiza la contraseña del usuario autenticado.
   */
  async updatePassword(newPassword: string): Promise<UserResponse> {
    return this.supabase.auth.updateUser({
      password: newPassword
    });
  }
}
