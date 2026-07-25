// src/app/core/services/supabase.service.ts
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private readonly supabaseClient: SupabaseClient;

  constructor() {
    // Validación temprana para evitar errores silenciosos en runtime
    if (!environment.supabaseUrl || !environment.supabaseKey) {
      throw new Error('Faltan las credenciales de Supabase en environment.ts');
    }

    // Se inicializa el cliente de Supabase una sola vez durante el ciclo de vida de la app
    this.supabaseClient = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  /**
   * Expone el cliente de Supabase como solo lectura.
   * Otros servicios deben consumir esto en lugar de instanciar uno nuevo.
   */
  get client(): SupabaseClient {
    return this.supabaseClient;
  }
}
