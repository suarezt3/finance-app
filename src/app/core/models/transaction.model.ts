export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  user_id: string; // Relación con el usuario de Supabase Auth
  amount: number;
  type: TransactionType;
  category: string;
  description?: string;
  date: string; // Fecha en formato ISO (ej. '2026-08-14')
  created_at?: string;
}
