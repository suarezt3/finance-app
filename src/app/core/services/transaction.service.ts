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
   * Obtiene las transacciones del usuario logueado.
   * Utiliza la sintaxis select() de Supabase para hacer un JOIN automático
   * con las tablas 'categories' y 'payment_methods'.
   */
  async getTransactions(): Promise<TransactionWithDetails[]> {
    await this.ensureSession();

    const { data, error } = await this.supabase
      .from('transactions')
      .select(`
        *,
        categories (name, color, icon),
        payment_methods (name)
      `)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error en Supabase fetching transactions:', error.message);
      throw new Error(error.message);
    }

    return (data as TransactionWithDetails[]) || [];
  }

  /**
   * Regla de Negocio - Obtener saldo estricto por método de pago.
   * Consulta directamente la BD para ignorar filtros locales y evitar sobregiros.
   */
  async getBalanceByPaymentMethod(methodId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('type, amount')
      .eq('payment_method_id', methodId);

    if (error) {
      console.error('Error calculando saldo por método de pago:', error.message);
      throw new Error(error.message);
    }

    // Calculamos el saldo neto: Ingresos - Gastos
    return data.reduce((acc, tx) => {
      const amount = Number(tx.amount);
      return tx.type === 'INCOME' ? acc + amount : acc - amount;
    }, 0);
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
      category_id: null // Las transferencias por lo general no afectan el presupuesto por categorías
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
      .insert([expenseTx, incomeTx]); // <-- Enviamos ambas en una sola petición HTTP

    if (insertError) {
      console.error('Error al ejecutar la transferencia:', insertError.message);
      throw new Error(insertError.message);
    }
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
  }

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}
