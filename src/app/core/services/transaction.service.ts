// src/app/core/services/transaction.service.ts
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Transaction } from '../models/transaction.model';

@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private readonly supabase = inject(SupabaseService).client;

  /**
   * Obtiene todas las transacciones del usuario autenticado actual.
   * Supabase aplica las políticas RLS (Row Level Security) automáticamente
   * usando el token JWT de la sesión activa.
   */
  async getTransactions(): Promise<Transaction[]> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error obteniendo transacciones desde Supabase:', error.message);
      throw new Error(error.message);
    }

    return data as Transaction[];
  }
}
