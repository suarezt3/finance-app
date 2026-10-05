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
  private cachedWorkspaceId: string | null = null;

  constructor() {
    this.supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        this.clearCache();
      }
    });
  }

  public clearCache(): void {
    this.cachedWorkspaceId = null;
  }

  /**
   * Resuelve el workspace_id de forma resiliente, usando caché en memoria
   * y reintentos exponenciales para tolerar la latencia de inicialización del token.
   */
  public async getWorkspaceId(maxAttempts = 4, delayMs = 200): Promise<string> {
    if (this.cachedWorkspaceId) {
      return this.cachedWorkspaceId;
    }

    let lastError: unknown = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
        if (sessionError || !session?.user) {
          throw new Error('No hay sesión activa');
        }

        const { data, error } = await this.supabase
          .from('profiles')
          .select('workspace_id')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error) {
          const isSkew = (error.message || '').toLowerCase().includes('jwt') ||
                         (error.message || '').toLowerCase().includes('future') ||
                         (error.message || '').toLowerCase().includes('clock');
          if (isSkew && attempt < maxAttempts - 1) {
            console.warn(`[Supabase Workspace Sync] Desfase temporal (${error.message}). Reintentando...`);
            await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
            continue;
          }
          throw new Error(error.message);
        }

        if (data?.workspace_id) {
          this.cachedWorkspaceId = data.workspace_id;
          return data.workspace_id;
        }

        throw new Error('El perfil de usuario aún no tiene workspace_id asignado');
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || '').toLowerCase();
        const isSkew = msg.includes('jwt') || msg.includes('future') || msg.includes('clock');
        const waitTime = isSkew ? 1500 * (attempt + 1) : delayMs * (attempt + 1);
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error('Fallo al resolver workspace_id tras múltiples reintentos:', lastError);
    throw new Error('No se pudo resolver tu espacio personal');
  }

  /**
   * Ejecuta una consulta a Supabase manejando posibles desfases de reloj (clock skew).
   */
  private async executeWithClockSkewRetry<T>(
    queryFn: () => PromiseLike<{ data: any; error: any }>,
    maxAttempts = 4
  ): Promise<T> {
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { data, error } = await queryFn();
        if (!error) {
          return (data as T);
        }

        lastError = error;
        const msg = (error.message || '').toLowerCase();
        const isSkew = msg.includes('jwt') || msg.includes('future') || msg.includes('clock') || error.code === 'PGRST301';

        if (isSkew && attempt < maxAttempts) {
          const waitMs = attempt === 1 ? 1500 : 2000 * attempt;
          console.warn(`[Supabase Catalogs Sync] Desfase temporal detectado (${error.message}). Sincronizando (intento ${attempt}/${maxAttempts})...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || '').toLowerCase();
        const isSkew = msg.includes('jwt') || msg.includes('future') || msg.includes('clock');
        if (isSkew && attempt < maxAttempts) {
          const waitMs = attempt === 1 ? 1500 : 2000 * attempt;
          console.warn(`[Supabase Catalogs Sync] Desfase en excepción (${err?.message}). Sincronizando...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      }

      break;
    }

    console.error('Error en catálogo Supabase:', lastError?.message || lastError);
    throw new Error(lastError?.message || 'Error en consulta de catálogos');
  }

  // ==========================================
  // OPERACIONES DE LECTURA (READ)
  // ==========================================

  async getCategories(): Promise<Category[]> {
    const workspaceId = await this.getWorkspaceId();
    const data = await this.executeWithClockSkewRetry<Category[]>(() =>
      this.supabase
        .from('categories')
        .select('id, name, type, icon, color')
        .eq('workspace_id', workspaceId)
        .order('name')
    );

    if (data && data.length === 0) {
      return this.seedDefaultCategories(workspaceId);
    }

    return data || [];
  }

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const workspaceId = await this.getWorkspaceId();
    const data = await this.executeWithClockSkewRetry<PaymentMethod[]>(() =>
      this.supabase
        .from('payment_methods')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name')
    );

    if (data && data.length === 0) {
      return this.seedDefaultPaymentMethods(workspaceId);
    }

    return data || [];
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

  async updateCategory(id: string, categoryData: { name: string, type: string }): Promise<void> {
    const { error } = await this.supabase
      .from('categories')
      .update(categoryData)
      .eq('id', id);

    if (error) {
      console.error('Error actualizando categoría:', error.message);
      throw new Error(error.message);
    }
  }

  async deleteCategory(id: string): Promise<void> {
    // 1. PRE-CHECK: Verificamos si existe al menos una transacción usando esta categoría
    const { data: usageData, error: usageError } = await this.supabase
      .from('transactions')
      .select('id')
      .eq('category_id', id)
      .limit(1);

    if (usageError) {
      console.error('Error verificando uso de la categoría:', usageError.message);
      throw new Error('Error al validar la integridad de la categoría.');
    }

    if (usageData && usageData.length > 0) {
      throw new Error('CATEGORY_IN_USE');
    }

    // 2. ELIMINACIÓN: Si pasó la validación, procedemos a borrar de forma segura.
    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando categoría:', error.message);
      if (error.code === '23503' || error.message?.toLowerCase().includes('foreign key') || error.message?.toLowerCase().includes('violates')) {
        throw new Error('CATEGORY_IN_USE');
      }
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

  async updatePaymentMethod(id: string, methodData: { name: string }): Promise<void> {
    const { error } = await this.supabase
      .from('payment_methods')
      .update(methodData)
      .eq('id', id);

    if (error) {
      console.error('Error actualizando método de pago:', error.message);
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
