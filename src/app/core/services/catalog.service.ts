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

    if (data && data.length === 0) {
      return this.seedDefaultCategories(workspaceId);
    }

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

    if (data && data.length === 0) {
      return this.seedDefaultPaymentMethods(workspaceId);
    }

    return data as PaymentMethod[];
  }

  // ==========================================
  // OPERACIONES DE MUTACIÓN (CREATE & DELETE)
  // ==========================================

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
   * Elimina un método de pago incluyendo una validación proactiva (Pre-check)
   * para proteger la integridad histórica de las transacciones.
   */
  async deletePaymentMethod(id: string): Promise<void> {
    // 1. PRE-CHECK: Verificamos si existe al menos una transacción usando este método
    // Usamos limit(1) y solo pedimos el 'id' para que la consulta sea extremadamente rápida (microsegundos).
    const { data: usageData, error: usageError } = await this.supabase
      .from('transactions')
      .select('id')
      .eq('payment_method_id', id)
      .limit(1);

    if (usageError) {
      console.error('Error verificando uso del método de pago:', usageError.message);
      throw new Error('Error al validar la integridad del método de pago.');
    }

    // Si el arreglo tiene elementos, significa que está en uso. Abortamos.
    if (usageData && usageData.length > 0) {
      throw new Error('METHOD_IN_USE');
    }

    // 2. ELIMINACIÓN: Si pasó la validación, procedemos a borrar de forma segura.
    const { error } = await this.supabase
      .from('payment_methods')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando método de pago:', error.message);
      throw new Error(error.message);
    }
  }

  // ==========================================
  // LÓGICA PRIVADA DE INICIALIZACIÓN (LAZY SEEDING)
  // ==========================================

  private async seedDefaultCategories(workspaceId: string): Promise<Category[]> {
    const defaultCategories = [
      { workspace_id: workspaceId, name: 'Salario', type: 'INCOME' },
      { workspace_id: workspaceId, name: 'Negocio / Ventas', type: 'INCOME' },
      { workspace_id: workspaceId, name: 'Alimentación', type: 'EXPENSE' },
      { workspace_id: workspaceId, name: 'Transporte', type: 'EXPENSE' },
      { workspace_id: workspaceId, name: 'Vivienda', type: 'EXPENSE' },
      { workspace_id: workspaceId, name: 'Servicios Públicos', type: 'EXPENSE' },
      { workspace_id: workspaceId, name: 'Salud', type: 'EXPENSE' },
      { workspace_id: workspaceId, name: 'Entretenimiento', type: 'EXPENSE' }
    ];

    const { data, error } = await this.supabase
      .from('categories')
      .insert(defaultCategories)
      .select('id, name, type, icon, color');

    if (error) throw new Error(error.message);
    return (data as Category[]) || [];
  }

  private async seedDefaultPaymentMethods(workspaceId: string): Promise<PaymentMethod[]> {
    const defaultMethods = [
      { workspace_id: workspaceId, name: 'Efectivo' },
      { workspace_id: workspaceId, name: 'Cuenta Bancaria' },
      { workspace_id: workspaceId, name: 'Tarjeta de Crédito' }
    ];

    const { data, error } = await this.supabase
      .from('payment_methods')
      .insert(defaultMethods)
      .select('id, name');

    if (error) throw new Error(error.message);
    return (data as PaymentMethod[]) || [];
  }
}
