// src/app/core/services/auth.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { AuthResponse, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Inyectamos el cliente estricto de Supabase
  private readonly supabase = inject(SupabaseService).client;

  // Estado reactivo y protegido: encapsulamos el usuario actual
  readonly currentUser = signal<User | null>(null);

  constructor() {
    this.initializeAuthState();
  }

  /**
   * Inicializa el estado leyendo la sesión actual en caché y
   * suscribiéndose a los eventos futuros (ej: cuando el token expira o el usuario sale).
   */
  private async initializeAuthState(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this.currentUser.set(data.session?.user ?? null);

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.currentUser.set(session?.user ?? null);
    });
  }

  /**
   * Registra un nuevo usuario guardando metadatos adicionales (nombre).
   */
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

  /**
   * Inicia sesión con correo y contraseña.
   */
  async signIn(email: string, password: string): Promise<AuthResponse> {
    return this.supabase.auth.signInWithPassword({
      email,
      password
    });
  }


/**
 * Inicia el flujo de autenticación con Google (OAuth).
 * Esto redirigirá la página actual hacia el proveedor.
 */
async signInWithGoogle(): Promise<void> {
  const { error } = await this.supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Redirige dinámicamente al entorno actual
      redirectTo: `${window.location.origin}/dashboard`
    }
  });

  if (error) throw error;
}


  /**
   * Destruye la sesión actual en el cliente y en el servidor.
   */
  async signOut(): Promise<{ error: Error | null }> {
    return this.supabase.auth.signOut();
  }
}
