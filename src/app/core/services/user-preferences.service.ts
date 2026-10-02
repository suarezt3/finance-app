// src/app/core/services/user-preferences.service.ts
import { Injectable, inject, signal, computed, effect, PLATFORM_ID } from '@angular/core';
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
      this.loadSavedLocalPreferences();

      // EFECTO REACTIVO: Cuando la sesión de Supabase carga o cambia en cualquier dispositivo, sincronizar inmediatamente
      effect(() => {
        const user = this.authService.currentUser();
        if (user && user.user_metadata) {
          this.syncFromCloudMetadata(user.user_metadata);
        }
      });
    }
  }

  private loadSavedLocalPreferences(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._preferences.set({ ...DEFAULT_PREFERENCES, ...parsed });
      }
    } catch (err) {
      console.warn('Error cargando preferencias de localStorage:', err);
    }
  }

  public syncFromCloudMetadata(meta: Record<string, any>): void {
    if (!meta) return;

    const cloudAvatar = meta['avatar_id'] || meta['avatar_url'];
    const cloudCurrency = meta['preferred_currency'];
    const cloudCutoff = meta['cutoff_day'] ? Number(meta['cutoff_day']) : undefined;
    const cloudGoal = meta['savings_goal'] !== undefined ? Number(meta['savings_goal']) : undefined;
    const cloudGoalName = meta['savings_goal_name'];
    const cloudThreshold = meta['expense_alert_threshold'] !== undefined ? Number(meta['expense_alert_threshold']) : undefined;
    const cloudBudget = meta['budget_alert_percentage'] !== undefined ? Number(meta['budget_alert_percentage']) : undefined;
    const cloudAlerts = meta['alerts_enabled'] !== undefined ? Boolean(meta['alerts_enabled']) : undefined;

    this._preferences.update(curr => {
      const next: UserFinancialPreferences = {
        ...curr,
        avatarId: cloudAvatar || curr.avatarId,
        preferredCurrency: cloudCurrency || curr.preferredCurrency,
        cutoffDay: cloudCutoff !== undefined && !isNaN(cloudCutoff) ? cloudCutoff : curr.cutoffDay,
        savingsGoal: cloudGoal !== undefined && !isNaN(cloudGoal) ? cloudGoal : curr.savingsGoal,
        savingsGoalName: cloudGoalName || curr.savingsGoalName,
        expenseAlertThreshold: cloudThreshold !== undefined && !isNaN(cloudThreshold) ? cloudThreshold : curr.expenseAlertThreshold,
        budgetAlertPercentage: cloudBudget !== undefined && !isNaN(cloudBudget) ? cloudBudget : curr.budgetAlertPercentage,
        alertsEnabled: cloudAlerts !== undefined ? cloudAlerts : curr.alertsEnabled,
      };

      if (isPlatformBrowser(this.platformId)) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          // ignore
        }
      }
      return next;
    });
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

    // Guardar asíncronamente en user_metadata de Supabase para que persista en todos los equipos
    const user = this.authService.currentUser();
    if (user && isPlatformBrowser(this.platformId)) {
      this.authService.updateProfile({
        avatarId: updates.avatarId,
        avatarUrl: updates.avatarId,
        preferredCurrency: updates.preferredCurrency,
        cutoffDay: updates.cutoffDay,
        savingsGoal: updates.savingsGoal,
        savingsGoalName: updates.savingsGoalName,
        expenseAlertThreshold: updates.expenseAlertThreshold,
        budgetAlertPercentage: updates.budgetAlertPercentage,
        alertsEnabled: updates.alertsEnabled
      }).catch(err => console.warn('Sync de preferencias en Supabase Cloud:', err));
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
