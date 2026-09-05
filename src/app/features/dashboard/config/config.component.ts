// src/app/features/dashboard/config/config.component.ts
import { Component, inject, signal, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [
    ReactiveFormsModule,
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

  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isLoading = signal<boolean>(true);

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

  async ngOnInit(): Promise<void> {
    await this.loadCatalogs();
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
}
