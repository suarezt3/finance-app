// src/app/core/services/transaction.service.ts
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Transaction, TransactionWithDetails } from '../models/transaction.model';

@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private readonly supabase = inject(SupabaseService).client;

  /**
   * Obtiene las transacciones del usuario logueado.
   * Utiliza la sintaxis select() de Supabase para hacer un JOIN automático
   * con las tablas 'categories' y 'payment_methods'.
   */
  async getTransactions(): Promise<TransactionWithDetails[]> {
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

    return data as TransactionWithDetails[];
  }

/**
   * Inserta una nueva transacción en la base de datos.
   * Resuelve automáticamente el user_id y el workspace_id del usuario autenticado.
   */
  async createTransaction(transactionData: Partial<Transaction>): Promise<void> {
    // 1. Obtener la sesión activa para extraer el user_id de forma segura
    const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
    if (sessionError || !session) throw new Error('No hay sesión activa');

    const userId = session.user.id;

    // 2. Consultar el perfil del usuario para obtener su workspace_id
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.workspace_id) {
      throw new Error('No se pudo determinar el espacio de trabajo del usuario');
    }

    // 3. Ejecutar el INSERT con la integridad referencial completa
    const { error: insertError } = await this.supabase
      .from('transactions')
      .insert({
        ...transactionData,
        user_id: userId,
        workspace_id: profile.workspace_id
      });

    if (insertError) {
      console.error('Error en Supabase insertando transacción:', insertError.message);
      throw new Error(insertError.message);
    }
  }

}
