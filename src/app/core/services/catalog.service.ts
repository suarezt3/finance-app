// src/app/core/services/catalog.service.ts
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

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

  // ==========================================
  // OPERACIONES DE LECTURA (READ)
  // ==========================================

  async getCategories(): Promise<Category[]> {
    const workspaceId = await this.getWorkspaceId();
    const { data, error } = await this.supabase
      .from('categories')
      .select('id, name, type, icon, color')
      .eq('workspace_id', workspaceId)
      .order('name');

    if (error) throw new Error(error.message);
    return data as Category[];
  }

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const workspaceId = await this.getWorkspaceId();
    const { data, error } = await this.supabase
      .from('payment_methods')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .order('name');

    if (error) throw new Error(error.message);
    return data as PaymentMethod[];
  }

  // ==========================================
  // OPERACIONES DE MUTACIÓN (CREATE & DELETE)
  // ==========================================

  /**
   * Crea una nueva categoría asegurando la integridad del Workspace.
   */
  async createCategory(categoryData: { name: string, type: string }): Promise<void> {
    const workspaceId = await this.getWorkspaceId();
    const { error } = await this.supabase
      .from('categories')
      .insert({ ...categoryData, workspace_id: workspaceId });

    if (error) {
      console.error('Error creando categoría:', error.message);
      throw new Error(error.message);
    }
  }

  /**
   * Elimina una categoría por su ID.
   * Nota: Si una categoría está en uso por una transacción,
   * Supabase bloqueará el borrado por integridad referencial (Restrict).
   */
  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando categoría:', error.message);
      throw new Error(error.message);
    }
  }

  /**
   * Crea un nuevo método de pago asegurando la integridad del Workspace.
   */
  async createPaymentMethod(methodData: { name: string }): Promise<void> {
    const workspaceId = await this.getWorkspaceId();
    const { error } = await this.supabase
      .from('payment_methods')
      .insert({ ...methodData, workspace_id: workspaceId });

    if (error) {
      console.error('Error creando método de pago:', error.message);
      throw new Error(error.message);
    }
  }

  /**
   * Elimina un método de pago por su ID.
   */
  async deletePaymentMethod(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('payment_methods')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando método de pago:', error.message);
      throw new Error(error.message);
    }
  }
}
