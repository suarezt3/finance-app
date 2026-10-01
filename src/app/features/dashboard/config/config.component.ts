// src/app/features/dashboard/config/config.component.ts
import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CatalogService, Category, PaymentMethod } from '../../../core/services/catalog.service';
import { BiometricAuthService } from '../../../core/services/biometric-auth.service';
import { AuthService } from '../../../core/services/auth.service';
import { PwaUpdateService } from '../../../core/services/pwa-update.service';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    NzTabsModule, NzTableModule, NzButtonModule, NzIconModule,
    NzTagModule, NzModalModule, NzFormModule, NzInputModule, NzSelectModule
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

  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isLoading = signal<boolean>(true);
  readonly isRegisteringBiometrics = signal<boolean>(false);
  readonly isTestingBiometrics = signal<boolean>(false);
  readonly isCheckingUpdates = signal<boolean>(false);

  readonly isCategoryModalVisible = signal<boolean>(false);
  readonly isMethodModalVisible = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);

  readonly categoryForm: FormGroup = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    type: ['EXPENSE', [Validators.required]]
  });

  readonly methodForm: FormGroup = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]]
  });

  readonly customApiKey = signal<string>('');
  readonly showAdvancedSettings = signal<boolean>(false);

  toggleAdvancedSettings(): void {
    this.showAdvancedSettings.update(v => !v);
  }

  async ngOnInit(): Promise<void> {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('custom_gemini_api_key') || '';
      this.customApiKey.set(savedKey);
    }
    await this.loadCatalogs();
  }

  saveCustomApiKey(apiKey: string): void {
    if (typeof window !== 'undefined') {
      const trimmed = apiKey.trim();
      if (trimmed) {
        localStorage.setItem('custom_gemini_api_key', trimmed);
        this.customApiKey.set(trimmed);
        this.message.success('Clave de Gemini API guardada correctamente.');
      } else {
        this.clearCustomApiKey();
      }
    }
  }

  clearCustomApiKey(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('custom_gemini_api_key');
      this.customApiKey.set('');
      this.message.info('Se restauró la clave y cuota predeterminada del sistema.');
    }
  }

  private async loadCatalogs(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [cats, methods] = await Promise.all([
        this.catalogService.getCategories(),
        this.catalogService.getPaymentMethods()
      ]);
      this.categories.set(cats);
      this.paymentMethods.set(methods);
    } catch (error) {
      console.error('Error cargando catálogos:', error);
      this.message.error('Error al cargar los datos desde el servidor');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ==========================================
  // LÓGICA DE CATEGORÍAS
  // ==========================================

  openCategoryModal(): void {
    this.categoryForm.reset({ type: 'EXPENSE', name: '' });
    this.isCategoryModalVisible.set(true);
  }

  closeCategoryModal(): void {
    this.isCategoryModalVisible.set(false);
  }

  async onSubmitCategory(): Promise<void> {
    if (this.categoryForm.valid) {
      this.isSubmitting.set(true);
      try {
        await this.catalogService.createCategory(this.categoryForm.getRawValue());
        this.message.success('Categoría creada exitosamente');
        this.closeCategoryModal();
        await this.loadCatalogs();
      } catch (error) {
        this.message.error('No se pudo crear la categoría');
      } finally {
        this.isSubmitting.set(false);
      }
    } else {
      Object.values(this.categoryForm.controls).forEach(c => c.markAsDirty());
    }
  }

  onDeleteCategory(id: string): void {
    this.modalService.confirm({
      nzTitle: '¿Estás seguro de eliminar esta categoría?',
      nzContent: 'Si esta categoría ya tiene transacciones asociadas, no se podrá borrar.',
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: async () => {
        try {
          this.isLoading.set(true);
          await this.catalogService.deleteCategory(id);
          this.message.success('Categoría eliminada');
          await this.loadCatalogs();
        } catch (error) {
          this.message.error('No se puede eliminar: La categoría está en uso');
        } finally {
          this.isLoading.set(false);
        }
      },
      nzCancelText: 'Cancelar'
    });
  }

  // ==========================================
  // LÓGICA DE MÉTODOS DE PAGO
  // ==========================================

  openMethodModal(): void {
    this.methodForm.reset({ name: '' });
    this.isMethodModalVisible.set(true);
  }

  closeMethodModal(): void {
    this.isMethodModalVisible.set(false);
  }

  async onSubmitMethod(): Promise<void> {
    if (this.methodForm.valid) {
      this.isSubmitting.set(true);
      try {
        await this.catalogService.createPaymentMethod(this.methodForm.getRawValue());
        this.message.success('Método de pago creado exitosamente');
        this.closeMethodModal();
        await this.loadCatalogs();
      } catch (error) {
        this.message.error('No se pudo crear el método de pago');
      } finally {
        this.isSubmitting.set(false);
      }
    } else {
      Object.values(this.methodForm.controls).forEach(c => c.markAsDirty());
    }
  }

  onDeleteMethod(id: string): void {
    this.modalService.confirm({
      nzTitle: '¿Estás seguro de eliminar este método de pago?',
      // FIX: Homologamos la advertencia del modal para coincidir con la regla de negocio
      nzContent: 'Si este método de pago ya tiene transacciones asociadas, no se podrá borrar.',
      nzOkText: 'Sí, eliminar',
      nzOkType: 'primary',
      nzOkDanger: true,
      nzOnOk: async () => {
        try {
          this.isLoading.set(true);
          await this.catalogService.deletePaymentMethod(id);
          this.message.success('Método de pago eliminado');
          await this.loadCatalogs();
        } catch (error) {
          this.message.error('No se puede eliminar: El método está en uso');
        } finally {
          this.isLoading.set(false);
        }
      },
      nzCancelText: 'Cancelar'
    });
  }

  // ==========================================
  // SEGURIDAD Y ACCESO BIOMÉTRICO (HUELLA)
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
        this.message.success(result.message);
      } else {
        this.message.warning(result.message, { nzDuration: 6000 });
      }
    } catch (err: any) {
      console.error('Error registrando biometría:', err);
      this.message.error('No se pudo completar el registro de la huella.');
    } finally {
      this.isRegisteringBiometrics.set(false);
    }
  }

  async onTestBiometrics(): Promise<void> {
    this.isTestingBiometrics.set(true);
    try {
      const result = await this.biometricAuth.testBiometrics();
      if (result.success) {
        this.message.success(result.message);
      } else {
        this.message.warning(result.message, { nzDuration: 5000 });
      }
    } catch (err: any) {
      console.error('Error en prueba biométrica:', err);
      this.message.error('Error al probar el sensor biométrico.');
    } finally {
      this.isTestingBiometrics.set(false);
    }
  }

  onDisableBiometrics(): void {
    this.modalService.confirm({
      nzTitle: '¿Desvincular huella dactilar de este equipo?',
      nzContent: 'Ya no podrás ingresar a FinanceApp tocando el sensor biométrico en este navegador hasta que vuelvas a vincularlo.',
      nzOkText: 'Desvincular',
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
      const result = await this.pwaUpdate.checkForUpdateManual();
      if (result.hasUpdate) {
        this.message.success(result.message);
      } else {
        this.message.info(result.message);
      }
    } catch {
      this.message.error('No se pudo comprobar la versión en este momento.');
    } finally {
      this.isCheckingUpdates.set(false);
    }
  }
}
