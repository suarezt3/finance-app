// src/app/core/services/transaction.service.ts
import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { CatalogService } from './catalog.service';
import { Transaction, TransactionWithDetails } from '../models/transaction.model';

@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly catalogService = inject(CatalogService);

  // Bus de eventos reactivo para notificar cambios a la app
  public readonly transactionsChanged$ = new Subject<void>();

  constructor() {
    this.setupRealtimeSubscription(); // Iniciamos la escucha al arrancar el servicio
  }

  /**
   * Asegura que exista una sesión activa antes de consultar tablas protegidas por RLS.
   */
  private async ensureSession(maxAttempts = 4, delayMs = 150): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) {
        return true;
      }
      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
    return false;
  }

  /**
   * Configuración del canal en tiempo real de Supabase
   * Escucha eventos de Inserción, Actualización o Borrado directamente en la base de datos.
   */
  private setupRealtimeSubscription(): void {
    this.supabase
      .channel('public:transactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        (payload) => {
          console.log('Cambio en BD detectado vía WebSocket:', payload);
          // Cuando hay un cambio, notificamos a todos los componentes suscritos
          this.transactionsChanged$.next();
        }
      )
      .subscribe();
  }

  /**
  /**
   * Ejecuta una consulta a Supabase manejando posibles desfases de reloj (clock skew).
   * Si PostgREST responde "JWT issued at future", realiza una breve pausa de sincronización
   * y reintenta la consulta automáticamente.
   */
  private async executeWithClockSkewRetry<T>(
    queryFn: () => PromiseLike<{ data: any; error: any }>,
    maxAttempts = 4
  ): Promise<T> {
    await this.ensureSession();
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
          console.warn(`[Supabase Transactions Sync] Desfase temporal detectado (${error.message}). Sincronizando reloj (intento ${attempt}/${maxAttempts})...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || '').toLowerCase();
        const isSkew = msg.includes('jwt') || msg.includes('future') || msg.includes('clock');
        if (isSkew && attempt < maxAttempts) {
          const waitMs = attempt === 1 ? 1500 : 2000 * attempt;
          console.warn(`[Supabase Transactions Sync] Desfase en excepción (${err?.message}). Sincronizando...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      }

      break;
    }

    console.error('Error en Supabase fetching data:', lastError?.message || lastError);
    throw new Error(lastError?.message || 'Error en consulta Supabase');
  }

  /**
   * Obtiene las transacciones del usuario logueado.
   * Utiliza la sintaxis select() de Supabase para hacer un JOIN automático
   * con las tablas 'categories' y 'payment_methods'.
   */
  async getTransactions(): Promise<TransactionWithDetails[]> {
    const data = await this.executeWithClockSkewRetry<TransactionWithDetails[]>(() =>
      this.supabase
        .from('transactions')
        .select(`
          *,
          categories (name, color, icon),
          payment_methods (name)
        `)
        .order('date', { ascending: false })
    );

    return data || [];
  }

  /**
   * Regla de Negocio - Obtener saldo estricto por método de pago.
   * Consulta directamente la BD para ignorar filtros locales y evitar sobregiros.
   */
  async getBalanceByPaymentMethod(methodId: string): Promise<number> {
    const data = await this.executeWithClockSkewRetry<{ type: string; amount: number }[]>(() =>
      this.supabase
        .from('transactions')
        .select('type, amount')
        .eq('payment_method_id', methodId)
    );

    // Calculamos el saldo neto: Ingresos - Gastos
    return (data || []).reduce((acc, tx) => {
      const amount = Number(tx.amount);
      return tx.type === 'INCOME' ? acc + amount : acc - amount;
    }, 0);
  }

  /**
   * Obtiene el saldo total disponible global (acumulado de todas las cuentas).
   */
  async getTotalBalance(): Promise<number> {
    try {
      const data = await this.executeWithClockSkewRetry<{ type: string; amount: number }[]>(() =>
        this.supabase
          .from('transactions')
          .select('type, amount')
      );

      return (data || []).reduce((acc, tx) => {
        const amount = Number(tx.amount);
        return tx.type === 'INCOME' ? acc + amount : acc - amount;
      }, 0);
    } catch (e: any) {
      console.warn('Error calculando saldo total:', e?.message);
      return 0;
    }
  }

  /**
   * Inserta una nueva transacción en la base de datos.
   */
  async createTransaction(transactionData: Partial<Transaction>): Promise<void> {
    const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
    if (sessionError || !session?.user) throw new Error('No hay sesión activa');

    const userId = session.user.id;
    const workspaceId = await this.catalogService.getWorkspaceId();

    const { error: insertError } = await this.supabase
      .from('transactions')
      .insert({
        ...transactionData,
        user_id: userId,
        workspace_id: workspaceId
      });

    if (insertError) {
      console.error('Error en Supabase insertando transacción:', insertError.message);
      throw new Error(insertError.message);
    }

    this.notifyTransactionsChanged();
  }

  /**
   * NUEVO: Regla de Negocio - Partida Doble (Transferencias)
   * Registra simultáneamente un GASTO en la cuenta origen y un INGRESO en la cuenta destino.
   */
  async createTransfer(transferData: {
    amount: number;
    date: string;
    description?: string;
    source_method_id: string;
    destination_method_id: string;
  }): Promise<void> {
    const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
    if (sessionError || !session?.user) throw new Error('No hay sesión activa');
    const userId = session.user.id;
    const workspaceId = await this.catalogService.getWorkspaceId();

    // 2. Construcción de la Partida Doble
    const expenseTx = {
      type: 'EXPENSE',
      amount: transferData.amount,
      date: transferData.date,
      description: transferData.description || 'Transferencia enviada',
      payment_method_id: transferData.source_method_id,
      user_id: userId,
      workspace_id: workspaceId,
      category_id: null
    };

    const incomeTx = {
      type: 'INCOME',
      amount: transferData.amount,
      date: transferData.date,
      description: transferData.description || 'Transferencia recibida',
      payment_method_id: transferData.destination_method_id,
      user_id: userId,
      workspace_id: workspaceId,
      category_id: null
    };

    // 3. Ejecución en un solo lote (Array Insert)
    const { error: insertError } = await this.supabase
      .from('transactions')
      .insert([expenseTx, incomeTx]);

    if (insertError) {
      console.error('Error al ejecutar la transferencia:', insertError.message);
      throw new Error(insertError.message);
    }

    this.notifyTransactionsChanged();
  }

  /**
   * Actualiza una transacción existente por su ID.
   */
  async updateTransaction(id: string, transactionData: {
    type: string;
    amount: number;
    date: string;
    description?: string;
    category_id?: string;
    payment_method_id?: string;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('transactions')
      .update(transactionData)
      .eq('id', id);

    if (error) {
      console.error('Error actualizando transacción:', error.message);
      throw new Error(error.message);
    }

    this.notifyTransactionsChanged();
  }

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    this.notifyTransactionsChanged();
  }

  public notifyTransactionsChanged(): void {
    this.transactionsChanged$.next();
  }
}
