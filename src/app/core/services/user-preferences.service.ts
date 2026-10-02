// src/app/core/services/user-preferences.service.ts
import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from './auth.service';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'COP', name: 'Peso Colombiano', symbol: '$', flag: '🇨🇴' },
  { code: 'USD', name: 'Dólar Estadounidense', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'MXN', name: 'Peso Mexicano', symbol: '$', flag: '🇲🇽' },
  { code: 'PEN', name: 'Sol Peruano', symbol: 'S/', flag: '🇵🇪' },
  { code: 'CLP', name: 'Peso Chileno', symbol: '$', flag: '🇨🇱' },
  { code: 'ARS', name: 'Peso Argentino', symbol: '$', flag: '🇦🇷' },
];

export interface AvatarOption {
  id: string;
  name: string;
  emoji: string;
  bgGradient: string;
  textColor: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'avatar-wallet', name: 'Billetera', emoji: '💳', bgGradient: 'linear-gradient(135deg, #2563eb, #38bdf8)', textColor: '#ffffff' },
  { id: 'avatar-piggy', name: 'Alcancía', emoji: '🐷', bgGradient: 'linear-gradient(135deg, #ec4899, #f43f5e)', textColor: '#ffffff' },
  { id: 'avatar-rocket', name: 'Metas', emoji: '🚀', bgGradient: 'linear-gradient(135deg, #8b5cf6, #d946ef)', textColor: '#ffffff' },
  { id: 'avatar-chart', name: 'Inversión', emoji: '📈', bgGradient: 'linear-gradient(135deg, #10b981, #059669)', textColor: '#ffffff' },
  { id: 'avatar-gem', name: 'Diamante', emoji: '💎', bgGradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)', textColor: '#ffffff' },
  { id: 'avatar-crown', name: 'Financiero', emoji: '👑', bgGradient: 'linear-gradient(135deg, #f59e0b, #d97706)', textColor: '#ffffff' },
  { id: 'avatar-fire', name: 'Fuego', emoji: '🔥', bgGradient: 'linear-gradient(135deg, #f97316, #ef4444)', textColor: '#ffffff' },
  { id: 'avatar-star', name: 'Estrella', emoji: '⭐', bgGradient: 'linear-gradient(135deg, #eab308, #ca8a04)', textColor: '#ffffff' },
];

export interface UserFinancialPreferences {
  preferredCurrency: string;
  cutoffDay: number;
  avatarId: string;
  savingsGoal: number;
  savingsGoalName: string;
  expenseAlertThreshold: number;
  budgetAlertPercentage: number;
  alertsEnabled: boolean;
}

const DEFAULT_PREFERENCES: UserFinancialPreferences = {
  preferredCurrency: 'COP',
  cutoffDay: 1,
  avatarId: 'avatar-wallet',
  savingsGoal: 500000,
  savingsGoalName: 'Meta de Ahorro Mensual',
  expenseAlertThreshold: 200000,
  budgetAlertPercentage: 80,
  alertsEnabled: true
};

const STORAGE_KEY = 'finance_user_preferences_v2';

@Injectable({
  providedIn: 'root'
})
export class UserPreferencesService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);

  private readonly _preferences = signal<UserFinancialPreferences>(DEFAULT_PREFERENCES);

  // Señales públicas reactivas
  readonly preferences = this._preferences.asReadonly();
  readonly preferredCurrency = computed(() => this._preferences().preferredCurrency);
  readonly cutoffDay = computed(() => this._preferences().cutoffDay);
  readonly avatarId = computed(() => this._preferences().avatarId);
  readonly savingsGoal = computed(() => this._preferences().savingsGoal);
  readonly savingsGoalName = computed(() => this._preferences().savingsGoalName);
  readonly expenseAlertThreshold = computed(() => this._preferences().expenseAlertThreshold);
  readonly budgetAlertPercentage = computed(() => this._preferences().budgetAlertPercentage);
  readonly alertsEnabled = computed(() => this._preferences().alertsEnabled);

  readonly currentCurrencyMeta = computed(() => {
    const code = this.preferredCurrency();
    return SUPPORTED_CURRENCIES.find(c => c.code === code) || SUPPORTED_CURRENCIES[0];
  });

  readonly currencySymbol = computed(() => this.currentCurrencyMeta().symbol);

  readonly currentAvatarMeta = computed(() => {
    const id = this.avatarId();
    return AVATAR_OPTIONS.find(a => a.id === id) || AVATAR_OPTIONS[0];
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadSavedPreferences();
    }
  }

  private loadSavedPreferences(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._preferences.set({ ...DEFAULT_PREFERENCES, ...parsed });
      }

      // Sincronizar también con metadata de usuario si existe
      const user = this.authService.currentUser();
      const meta = user?.user_metadata;
      if (meta) {
        this._preferences.update(curr => ({
          ...curr,
          preferredCurrency: meta['preferred_currency'] || curr.preferredCurrency,
          cutoffDay: meta['cutoff_day'] ? Number(meta['cutoff_day']) : curr.cutoffDay,
          avatarId: meta['avatar_id'] || curr.avatarId,
          savingsGoal: meta['savings_goal'] ? Number(meta['savings_goal']) : curr.savingsGoal,
          expenseAlertThreshold: meta['expense_alert_threshold'] ? Number(meta['expense_alert_threshold']) : curr.expenseAlertThreshold,
          budgetAlertPercentage: meta['budget_alert_percentage'] ? Number(meta['budget_alert_percentage']) : curr.budgetAlertPercentage,
        }));
      }
    } catch (err) {
      console.warn('Error cargando preferencias de usuario:', err);
    }
  }

  updatePreferences(updates: Partial<UserFinancialPreferences>): void {
    this._preferences.update(curr => {
      const next = { ...curr, ...updates };
      if (isPlatformBrowser(this.platformId)) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.warn('Error guardando en localStorage:', e);
        }
      }
      return next;
    });

    // Guardar asíncronamente en user_metadata de Supabase si hay sesión activa
    const user = this.authService.currentUser();
    if (user && isPlatformBrowser(this.platformId)) {
      this.authService.updateProfile({
        preferredCurrency: updates.preferredCurrency,
        cutoffDay: updates.cutoffDay,
        avatarUrl: updates.avatarId,
      }).catch(err => console.warn('Sync de preferencias en Supabase:', err));
    }
  }

  setSavingsGoal(amount: number, name?: string): void {
    this.updatePreferences({
      savingsGoal: Math.max(0, amount),
      ...(name ? { savingsGoalName: name } : {})
    });
  }

  setExpenseAlertThreshold(amount: number): void {
    this.updatePreferences({
      expenseAlertThreshold: Math.max(0, amount)
    });
  }

  setBudgetAlertPercentage(percentage: number): void {
    this.updatePreferences({
      budgetAlertPercentage: Math.min(100, Math.max(10, percentage))
    });
  }

  toggleAlerts(enabled: boolean): void {
    this.updatePreferences({ alertsEnabled: enabled });
  }
}
