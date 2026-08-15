// src/app/core/services/catalog.service.ts
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

// 1. Definimos las interfaces aquí mismo para mantener el contexto agrupado
export interface Category {
  id: string;
  name: string;
  type: string; // 'INCOME' | 'EXPENSE'
  icon?: string;
  color?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class CatalogService {
  private readonly supabase = inject(SupabaseService).client;

  /**
   * Método privado para reutilizar la lógica de obtención del Workspace ID.
   */
  private async getWorkspaceId(): Promise<string> {
    const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
    if (sessionError || !session) throw new Error('No hay sesión activa');

    const { data, error } = await this.supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', session.user.id)
      .single();

    if (error || !data?.workspace_id) throw new Error('No se pudo resolver el workspace');
    return data.workspace_id;
  }

  /**
   * Obtiene las categorías pertenecientes al espacio de trabajo actual.
   */
  async getCategories(): Promise<Category[]> {
    const workspaceId = await this.getWorkspaceId();

    const { data, error } = await this.supabase
      .from('categories')
      .select('id, name, type, icon, color')
      .eq('workspace_id', workspaceId)
      .order('name');

    if (error) {
      console.error('Error obteniendo categorías:', error.message);
      throw new Error(error.message);
    }

    return data as Category[];
  }

  /**
   * Obtiene los métodos de pago pertenecientes al espacio de trabajo actual.
   */
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const workspaceId = await this.getWorkspaceId();

    const { data, error } = await this.supabase
      .from('payment_methods')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .order('name');

    if (error) {
      console.error('Error obteniendo métodos de pago:', error.message);
      throw new Error(error.message);
    }

    return data as PaymentMethod[];
  }
}
