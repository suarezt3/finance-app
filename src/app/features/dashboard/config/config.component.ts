// src/app/features/dashboard/config/config.component.ts
import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzMessageService } from 'ng-zorro-antd/message';

import { CatalogService, Category, PaymentMethod } from '../../../core/services/catalog.service';
import { BiometricAuthService } from '../../../core/services/biometric-auth.service';
import { AuthService } from '../../../core/services/auth.service';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { DecimalInputDirective } from '../../../shared/directives/decimal-input.directive';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DatePipe,
    NzTabsModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    NzSwitchModule,
    NzProgressModule,
    DecimalInputDirective
  ],
  templateUrl: './config.component.html',
  styleUrl: './config.component.scss'
})
export class ConfigComponent implements OnInit {
  private readonly catalogService = inject(CatalogService);
  private readonly fb = inject(FormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly modalService = inject(NzModalService);
  readonly biometricAuth = inject(BiometricAuthService);
  private readonly authService = inject(AuthService);
  readonly pwaUpdate = inject(PwaUpdateService);
  readonly userPreferences = inject(UserPreferencesService);
  private readonly transactionService = inject(TransactionService);

  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly isRegisteringBiometrics = signal<boolean>(false);
  readonly isTestingBiometrics = signal<boolean>(false);
  readonly isCheckingUpdates = signal<boolean>(false);
  readonly isSavingPreferences = signal<boolean>(false);

  // Estadísticas del mes actual para explicación y cálculo del ahorro
  readonly currentMonthIncome = signal<number>(0);
  readonly currentMonthExpense = signal<number>(0);
  readonly currentMonthSavings = signal<number>(0);

  // Navegación adaptable
  readonly activeTab = signal<'categories' | 'methods' | 'goals' | 'security'>('categories');
  readonly categoryFilter = signal<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  readonly categorySearch = signal<string>('');
  readonly methodSearch = signal<string>('');

  readonly incomeCount = computed(() => this.categories().filter(c => c.type === 'INCOME').length);
  readonly expenseCount = computed(() => this.categories().filter(c => c.type === 'EXPENSE').length);

  readonly filteredCategories = computed(() => {
    const list = this.categories();
    const filter = this.categoryFilter();
    const search = this.categorySearch().trim().toLowerCase();

    return list.filter(item => {
      const matchesType = filter === 'ALL' || item.type === filter;
      const matchesSearch = !search || item.name.toLowerCase().includes(search);
      return matchesType && matchesSearch;
    });
  });

  readonly filteredMethods = computed(() => {
    const list = this.paymentMethods();
    const search = this.methodSearch().trim().toLowerCase();
    if (!search) return list;
    return list.filter(m => m.name.toLowerCase().includes(search));
  });

  // Modales y Edición
  readonly isCategoryModalVisible = signal<boolean>(false);
  readonly editingCategory = signal<Category | null>(null);

  readonly isMethodModalVisible = signal<boolean>(false);
  readonly editingMethod = signal<PaymentMethod | null>(null);

  readonly isBiometricModalVisible = signal<boolean>(false);
  readonly passwordVisible = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);

  // Formulario de Contraseña para Bóveda Biométrica
  readonly biometricPasswordForm: FormGroup = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  // Formulario de Categoría
  readonly categoryForm: FormGroup = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    type: ['EXPENSE', [Validators.required]]
  });

  // Formulario de Billetera / Medio de Pago
  readonly methodForm: FormGroup = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]]
  });

  // Formulario de Metas y Alertas
  readonly goalsForm: FormGroup = this.fb.nonNullable.group({
    savingsGoal: [500000, [Validators.required, Validators.min(0)]],
    savingsGoalName: ['Meta de Ahorro Mensual', [Validators.required]],
    expenseAlertThreshold: [200000, [Validators.required, Validators.min(0)]],
    budgetAlertPercentage: [80, [Validators.required, Validators.min(10), Validators.max(100)]],
    alertsEnabled: [true]
  });

  // Formateadores con puntos de miles para campos numéricos
  readonly formatterCurrency = (value: number | string): string => {
    if (value == null || value === '') return '';
    const parts = value.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts.join(',');
  };

  readonly parserCurrency = (value: string): number => {
    const cleanString = value.replace(/\./g, '').replace(',', '.');
    const parsedNumber = parseFloat(cleanString);
    return isNaN(parsedNumber) ? 0 : parsedNumber;
  };

  // Cálculos reactivos de metas
  readonly savingsGoal = this.userPreferences.savingsGoal;
  readonly savingsGoalName = this.userPreferences.savingsGoalName;
  readonly currencySymbol = this.userPreferences.currencySymbol;
  readonly preferredCurrency = this.userPreferences.preferredCurrency;

  readonly savingsProgressPercentage = computed(() => {
    const goal = this.savingsGoal();
    if (goal <= 0) return 0;
    const current = Math.max(0, this.currentMonthSavings());
    const pct = Math.round((current / goal) * 100);
    return Math.min(100, pct);
  });

  readonly remainingSavings = computed(() => {
    const goal = this.savingsGoal();
    const current = this.currentMonthSavings();
    return Math.max(0, goal - current);
  });

  constructor() {
    // Sincronizar reactivamente formulario cuando las preferencias de la nube se carguen
    effect(() => {
      const p = this.userPreferences.preferences();
      this.goalsForm.patchValue({
        savingsGoal: p.savingsGoal,
        savingsGoalName: p.savingsGoalName,
        expenseAlertThreshold: p.expenseAlertThreshold,
        budgetAlertPercentage: p.budgetAlertPercentage,
        alertsEnabled: p.alertsEnabled
      }, { emitEvent: false });
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadCatalogs(),
      this.loadTransactionsBalance()
    ]);
  }

  async loadCatalogs(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [cats, methods] = await Promise.all([
        this.catalogService.getCategories(),
        this.catalogService.getPaymentMethods()
      ]);
      this.categories.set(cats);
      this.paymentMethods.set(methods);
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.message.error(`Error al cargar datos: ${err.message}`);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadTransactionsBalance(): Promise<void> {
    try {
      const txs = await this.transactionService.getTransactions();
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();

      let income = 0;
      let expense = 0;

      txs.forEach(t => {
        const txDate = new Date(t.date);
        if (txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
          if (t.type === 'INCOME') income += Number(t.amount);
          if (t.type === 'EXPENSE') expense += Number(t.amount);
        }
      });

      this.currentMonthIncome.set(income);
      this.currentMonthExpense.set(expense);
      const savings = Math.max(0, income - expense);
      this.currentMonthSavings.set(savings);
    } catch (err) {
      console.warn('Error calculando balance para metas:', err);
    }
  }

  // ==========================================
  // CATEGORÍAS (CREAR / EDITAR / ELIMINAR)
  // ==========================================

  openCategoryModal(category?: Category): void {
    if (category) {
      this.editingCategory.set(category);
      this.categoryForm.patchValue({
        name: category.name,
        type: category.type
      });
    } else {
      this.editingCategory.set(null);
      this.categoryForm.reset({ type: 'EXPENSE', name: '' });
    }
    this.isCategoryModalVisible.set(true);
  }

  closeCategoryModal(): void {
    this.isCategoryModalVisible.set(false);
    this.editingCategory.set(null);
    this.categoryForm.reset({ type: 'EXPENSE' });
  }

  async onSaveCategory(): Promise<void> {
    if (this.categoryForm.invalid) {
      Object.values(this.categoryForm.controls).forEach(c => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }

    this.isSubmitting.set(true);
    try {
      const formValue = this.categoryForm.getRawValue();
      const editing = this.editingCategory();

      if (editing) {
        await this.catalogService.updateCategory(editing.id, formValue);
        this.message.success('Categoría actualizada exitosamente.');
      } else {
        await this.catalogService.createCategory(formValue);
        this.message.success('Categoría creada exitosamente.');
      }

      this.closeCategoryModal();
      await this.loadCatalogs();
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.message.error(err.message || 'Error al guardar la categoría.');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onDeleteCategory(id: string): void {
    this.modalService.confirm({
      nzTitle: '¿Eliminar esta categoría?',
      nzContent: 'Esta acción no se puede deshacer. Las transacciones existentes podrían verse afectadas.',
      nzOkText: 'Sí, eliminar',
      nzOkDanger: true,
      nzCancelText: 'Cancelar',
      nzOnOk: async () => {
        try {
          await this.catalogService.deleteCategory(id);
          this.message.success('Categoría eliminada.');
          await this.loadCatalogs();
        } catch (err: unknown) {
          if (err instanceof Error) {
            this.message.error(err.message || 'No se pudo eliminar la categoría.');
          }
        }
      }
    });
  }

  // ==========================================
  // BILLETERAS / MEDIOS DE PAGO
  // ==========================================

  openMethodModal(method?: PaymentMethod): void {
    if (method) {
      this.editingMethod.set(method);
      this.methodForm.patchValue({
        name: method.name
      });
    } else {
      this.editingMethod.set(null);
      this.methodForm.reset({ name: '' });
    }
    this.isMethodModalVisible.set(true);
  }

  closeMethodModal(): void {
    this.isMethodModalVisible.set(false);
    this.editingMethod.set(null);
    this.methodForm.reset();
  }

  async onSaveMethod(): Promise<void> {
    if (this.methodForm.invalid) {
      Object.values(this.methodForm.controls).forEach(c => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }

    this.isSubmitting.set(true);
    try {
      const formValue = this.methodForm.getRawValue();
      const editing = this.editingMethod();

      if (editing) {
        await this.catalogService.updatePaymentMethod(editing.id, formValue);
        this.message.success('Cuenta o billetera actualizada.');
      } else {
        await this.catalogService.createPaymentMethod(formValue);
        this.message.success('Billetera o cuenta agregada.');
      }

      this.closeMethodModal();
      await this.loadCatalogs();
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.message.error(err.message || 'Error al guardar el medio de pago.');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onDeleteMethod(id: string): void {
    this.modalService.confirm({
      nzTitle: '¿Eliminar esta cuenta o billetera?',
      nzContent: 'Solo podrás eliminarla si no tiene transacciones registradas vinculadas.',
      nzOkText: 'Sí, eliminar',
      nzOkDanger: true,
      nzCancelText: 'Cancelar',
      nzOnOk: async () => {
        try {
          await this.catalogService.deletePaymentMethod(id);
          this.message.success('Cuenta eliminada exitosamente.');
          await this.loadCatalogs();
        } catch (err: unknown) {
          if (err instanceof Error) {
            if (err.message === 'METHOD_IN_USE') {
              this.message.warning('No puedes eliminar esta cuenta porque tiene transacciones registradas.');
            } else {
              this.message.error(err.message || 'Error al eliminar.');
            }
          }
        }
      }
    });
  }

  // ==========================================
  // METAS DE AHORRO Y ALERTAS
  // ==========================================

  onSaveGoals(): void {
    if (this.goalsForm.invalid) {
      Object.values(this.goalsForm.controls).forEach(c => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }

    this.isSavingPreferences.set(true);
    try {
      const val = this.goalsForm.getRawValue();
      this.userPreferences.updatePreferences({
        savingsGoal: Number(val.savingsGoal),
        savingsGoalName: val.savingsGoalName,
        expenseAlertThreshold: Number(val.expenseAlertThreshold),
        budgetAlertPercentage: Number(val.budgetAlertPercentage),
        alertsEnabled: val.alertsEnabled
      });

      this.message.success('Metas de ahorro y alertas guardadas y sincronizadas en la nube.');
    } catch (err) {
      this.message.error('Error al guardar las metas de ahorro.');
    } finally {
      this.isSavingPreferences.set(false);
    }
  }

  // ==========================================
  // SEGURIDAD & BIOMETRÍA
  // ==========================================

  async onRegisterBiometrics(): Promise<void> {
    const user = this.authService.currentUser();
    const email = user?.email;
    if (!email) {
      this.message.error('No se pudo identificar la cuenta activa.');
      return;
    }

    this.isRegisteringBiometrics.set(true);
    try {
      const result = await this.biometricAuth.registerBiometrics(email);
      if (result.success) {
        this.message.success('¡Huella dactilar vinculada exitosamente con tu dispositivo!');
        this.isBiometricModalVisible.set(true);
      } else {
        this.message.warning(result.message || 'No se pudo completar el registro biométrico.', { nzDuration: 6000 });
      }
    } catch (err: unknown) {
      this.message.error('Ocurrió un error inesperado durante el registro.', { nzDuration: 6000 });
    } finally {
      this.isRegisteringBiometrics.set(false);
    }
  }

  async onSaveBiometricPassword(): Promise<void> {
    if (this.biometricPasswordForm.invalid) {
      this.biometricPasswordForm.markAllAsTouched();
      return;
    }

    const { password } = this.biometricPasswordForm.getRawValue();
    this.isSubmitting.set(true);

    try {
      await this.biometricAuth.syncPasswordToVault(password);
      this.message.success('Bóveda biométrica activada. Podrás iniciar sesión con tu huella.');
      this.isBiometricModalVisible.set(false);
      this.biometricPasswordForm.reset();
    } catch (err) {
      this.message.error('Error guardando en la bóveda.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async onTestBiometrics(): Promise<void> {
    this.isTestingBiometrics.set(true);
    try {
      const result = await this.biometricAuth.testBiometrics();
      if (result.success) {
        this.message.success('¡Autenticación biométrica exitosa! Sensor verificado.');
      } else {
        this.message.warning(result.message || 'No se completó la verificación.', { nzDuration: 6000 });
      }
    } catch (err) {
      this.message.error('Error durante la prueba biométrica.');
    } finally {
      this.isTestingBiometrics.set(false);
    }
  }

  onUnlinkBiometrics(): void {
    this.modalService.confirm({
      nzTitle: '¿Desvincular huella dactilar?',
      nzContent: 'Deberás ingresar con tu correo y contraseña en este dispositivo.',
      nzOkText: 'Sí, desvincular',
      nzOkDanger: true,
      nzCancelText: 'Cancelar',
      nzOnOk: () => {
        this.biometricAuth.disableBiometrics();
        this.message.info('Huella dactilar desvinculada exitosamente.');
      }
    });
  }

  // ==========================================
  // COMPROBACIÓN DE ACTUALIZACIONES (PWA)
  // ==========================================

  async onCheckForUpdates(): Promise<void> {
    this.isCheckingUpdates.set(true);
    try {
      const updateFound = await this.pwaUpdate.checkForUpdate();
      if (updateFound) {
        this.message.info('¡Se ha detectado una nueva versión! Preparando actualización...');
      } else {
        this.message.success('Tienes la versión más reciente del sistema.');
      }
    } catch (err) {
      this.message.warning('No se pudo verificar la actualización en este momento.');
    } finally {
      this.isCheckingUpdates.set(false);
    }
  }
}
