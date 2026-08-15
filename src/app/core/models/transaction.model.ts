
// Mantenemos el tipo estricto que hace match con tu 'transaction_type' en BD
export type TransactionType = 'INCOME' | 'EXPENSE';

/**
 * Interfaz que representa exactamente la tabla 'transactions' de Supabase.
 * Los campos opcionales (?) corresponden a los rombos vacíos en el diagrama ER.
 */
export interface Transaction {
  id: string;                  // uuid
  workspace_id: string;        // uuid (Foránea a workspaces)
  user_id: string;             // uuid (Foránea a profiles/auth.users)
  type: TransactionType;       // transaction_type
  amount: number;              // numeric
  description?: string;        // text (Opcional)
  date: string;                // date (Formato YYYY-MM-DD)
  created_at: string;          // timestamptz
  tags?: string[];             // _text (Arreglo de strings, Opcional)
  category_id?: string;        // uuid (Foránea a categories, Opcional)
  payment_method_id?: string;  // uuid (Foránea a payment_methods, Opcional)
}

/**
 * Interfaz extendida que representa una transacción con sus datos relacionados resueltos.
 * Ideal para renderizar en la vista de UI.
 */
export interface TransactionWithDetails extends Transaction {
  categories?: {
    name: string;
    color: string;
    icon: string;
  } | null;
  payment_methods?: {
    name: string;
  } | null;
}
