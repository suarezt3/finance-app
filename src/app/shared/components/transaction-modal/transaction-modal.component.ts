import { Component, inject, input, output, signal, computed, OnInit, DestroyRef, effect } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzIconModule } from 'ng-zorro-antd/icon';

// NUEVOS IMPORTS REQUERIDOS PARA LA NUEVA UI
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';

import { CatalogService, Category, PaymentMethod } from '../../../core/services/catalog.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { TransactionWithDetails } from '../../../core/models/transaction.model';
import { NativeDeviceService } from '../../../core/services/native-device.service';
import { ReceiptScannerService, ScannedReceiptData } from '../../../core/services/receipt-scanner.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';

// NUEVO: Importamos la directiva que acabamos de crear
import { DecimalInputDirective } from '../../directives/decimal-input.directive';

import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Wallet01Icon,
  FlashIcon,
  Camera01Icon,
  Image01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowLeftRightIcon,
  AlertCircleIcon,
  InformationCircleIcon,
  Edit02Icon,
  Mic01Icon
} from '@hugeicons/core-free-icons';

@Component({
  selector: 'app-transaction-modal',
  standalone: true,
  imports: [
    NzRadioModule,
    NzGridModule,
    NzSpinModule,
    NzTagModule,
    ReactiveFormsModule, DecimalPipe, NzIconModule,
    NzModalModule, NzFormModule, NzInputModule, NzInputNumberModule,
    NzSelectModule, NzDatePickerModule, NzButtonModule,
    HugeiconsIconComponent
  ],
  templateUrl: './transaction-modal.component.html',
  styleUrl: './transaction-modal.component.scss'
})
export class TransactionModalComponent implements OnInit {
  // Hugeicons para el modal de movimientos
  readonly WalletIcon = Wallet01Icon;
  readonly AiIcon = FlashIcon;
  readonly CameraIcon = Camera01Icon;
  readonly ImageIcon = Image01Icon;
  readonly MicIcon = Mic01Icon;
  readonly CheckCircleIcon = CheckmarkCircle01Icon;
  readonly CloseIcon = Cancel01Icon;
  readonly ExpenseIcon = ArrowDown01Icon;
  readonly IncomeIcon = ArrowUp01Icon;
  readonly TransferIcon = ArrowLeftRightIcon;
  readonly AlertIcon = AlertCircleIcon;
  readonly InfoIcon = InformationCircleIcon;
  readonly EditIcon = Edit02Icon;

  private readonly fb = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly transactionService = inject(TransactionService);
  private readonly message = inject(NzMessageService);
  private readonly destroyRef = inject(DestroyRef);
  readonly nativeDeviceService = inject(NativeDeviceService);
  readonly userPreferences = inject(UserPreferencesService);
  private readonly receiptScannerService = inject(ReceiptScannerService);

  readonly isVisible = input.required<boolean>();
  readonly transactionToEdit = input<TransactionWithDetails | null>(null);
  readonly closeModal = output<void>();
  readonly transactionSaved = output<void>();

  readonly categories = signal<Category[]>([]);
  readonly paymentMethods = signal<PaymentMethod[]>([]);
  readonly isSubmitting = signal<boolean>(false);
  readonly isLoadingCatalogs = signal<boolean>(false);

  // Estados de escaneo directo de comprobantes con Gemini AI
  readonly isCapturingImage = signal<boolean>(false);
  readonly isScanningReceipt = signal<boolean>(false);
  readonly scannedReceiptInfo = signal<ScannedReceiptData | null>(null);
  readonly scannedReceiptThumbnail = signal<string | null>(null);

  // Estados de dictado por voz inteligente con Gemini AI
  readonly isRecordingVoice = signal<boolean>(false);
  readonly isProcessingVoice = signal<boolean>(false);
  readonly voiceLiveTranscript = signal<string>('');
  private speechRecognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private voiceSilenceTimer: any = null;

  // Formato y máscara en vivo de monto a registrar
  readonly displayAmount = signal<string>('');
  readonly currentAmount = signal<number>(0);

  // Mapa reactivo de saldos por cada billetera (payment_method_id -> saldo)
  readonly walletBalances = signal<Record<string, number>>({});
  readonly availableBalance = signal<number | null>(null);
  readonly isCheckingBalance = signal<boolean>(false);

  // Saldo total disponible acumulado (todas las cuentas)
  readonly totalAvailableBalance = signal<number | null>(null);
  readonly isLoadingTotalBalance = signal<boolean>(false);

  // Estado de validación visual del campo monto cuando se intenta guardar sin monto
  readonly amountSubmittedInvalid = signal<boolean>(false);

  constructor() {
    this.setupFormListeners();

    effect(() => {
      const visible = this.isVisible();
      if (visible) {
        this.amountSubmittedInvalid.set(false);
        this.loadTotalBalance();
        const editTx = this.transactionToEdit();
        if (editTx) {
          this.openForEdit(editTx);
        }
        // Al abrir el modal, si los catálogos aún no están en memoria, refrescar de inmediato
        if (this.categories().length === 0 || this.paymentMethods().length === 0) {
          this.loadCatalogs();
        }
        // Sincronizar validación de saldo si ya hay una billetera seleccionada
        const currentMethodId = this.transactionForm.controls['payment_method_id'].value;
        const currentType = this.transactionForm.controls['type'].value;
        if (currentMethodId) {
          this.refreshSelectedWalletBalance(currentType, currentMethodId);
        }
      }
    });
  }

  async loadTotalBalance(): Promise<void> {
    this.isLoadingTotalBalance.set(true);
    try {
      const { total, byMethod } = await this.transactionService.getBalancesByAllPaymentMethods();
      this.totalAvailableBalance.set(total);
      this.walletBalances.set(byMethod);

      // Si ya hay una billetera seleccionada en el formulario, actualizar su saldo disponible de inmediato
      const selectedMethodId = this.transactionForm.controls['payment_method_id']?.value;
      const currentType = this.transactionForm.controls['type']?.value;
      if (selectedMethodId) {
        const effectiveBalance = this.getEffectiveWalletBalance(selectedMethodId, byMethod[selectedMethodId] ?? 0);
        this.availableBalance.set(effectiveBalance);
        this.applyAmountValidators(currentType, effectiveBalance);
      }
    } catch (e) {
      console.warn('Error cargando saldos disponibles:', e);
    } finally {
      this.isLoadingTotalBalance.set(false);
    }
  }

  /**
   * Calcula el saldo efectivo de una billetera, sumando el monto original si se está editando
   * un gasto previamente descontado de esa misma billetera.
   */
  public getEffectiveWalletBalance(methodId: string | null | undefined, baseBalance?: number): number {
    if (!methodId) return 0;
    const raw = baseBalance !== undefined ? baseBalance : (this.walletBalances()[methodId] ?? 0);
    const editTarget = this.transactionToEdit();
    if (editTarget && editTarget.type === 'EXPENSE' && editTarget.payment_method_id === methodId) {
      return raw + Number(editTarget.amount);
    }
    return raw;
  }

  /**
   * Etiqueta enriquecida para el selector de billetera con su saldo actual.
   */
  public getMethodOptionLabel(method: PaymentMethod): string {
    const balance = this.getEffectiveWalletBalance(method.id);
    const sym = this.userPreferences.currencySymbol();
    const formatted = this.formatSignedCurrency(balance);
    return `${method.name} · ${sym}${formatted}`;
  }

  public formatSignedCurrency(val: number | null | undefined): string {
    if (val == null || isNaN(val)) return '0';
    const absVal = Math.abs(val);
    const parts = absVal.toFixed(2).split('.');
    const intFormatted = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decPart = parts[1] === '00' ? '' : `,${parts[1]}`;
    return `${val < 0 ? '-' : ''}${intFormatted}${decPart}`;
  }

  // -- FORMULARIO REACTIVO --
  readonly transactionForm: FormGroup = this.fb.nonNullable.group({
    type: ['EXPENSE', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [new Date(), [Validators.required]],
    description: [''],
    category_id: [null],
    payment_method_id: [null, [Validators.required]],
    destination_method_id: [null]
  });

  // -- SEÑALES REACTIVAS DE FORMULARIO --
  readonly selectedType = toSignal(
    this.transactionForm.controls['type'].valueChanges,
    { initialValue: this.transactionForm.controls['type'].value }
  );

  readonly selectedSourceMethod = toSignal(
    this.transactionForm.controls['payment_method_id'].valueChanges,
    { initialValue: this.transactionForm.controls['payment_method_id'].value }
  );

  readonly filteredCategories = computed(() => {
    const currentType = this.selectedType();
    return this.categories().filter(c => c.type === currentType);
  });

  readonly availableDestinationMethods = computed(() => {
    const source = this.selectedSourceMethod();
    return this.paymentMethods().filter(m => m.id !== source);
  });

  // Señal computada en tiempo real: indica si el monto ingresado supera el saldo disponible de la billetera
  readonly isInsufficientBalance = computed(() => {
    const type = this.selectedType();
    if (type !== 'EXPENSE' && type !== 'TRANSFER') {
      return false;
    }
    const methodId = this.selectedSourceMethod();
    if (!methodId) {
      return false;
    }
    const balance = this.availableBalance();
    if (balance === null) {
      return false;
    }
    const amount = this.currentAmount();
    return amount > 0 && amount > balance;
  });

  // Diferencia faltante cuando el monto supera el saldo disponible
  readonly missingBalanceAmount = computed(() => {
    if (!this.isInsufficientBalance()) return 0;
    const balance = Math.max(0, this.availableBalance() ?? 0);
    return Math.max(0, this.currentAmount() - balance);
  });

  // Saldo restante proyectado luego del gasto/transferencia
  readonly projectedRemainingBalance = computed(() => {
    const balance = this.availableBalance();
    if (balance === null) return null;
    const type = this.selectedType();
    const amount = this.currentAmount();
    if (type === 'INCOME') {
      return balance + amount;
    }
    return balance - amount;
  });

  // ==========================================
  // FORMATO EN VIVO DE MONTO (Separador de miles)
  // ==========================================

  onAmountInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value;
    const prevCursor = input.selectionEnd || raw.length;
    const prevLength = raw.length;

    // Permitir sólo números y coma decimal opcional
    const clean = raw.replace(/[^0-9,]/g, '');
    const [intPart = '', ...decParts] = clean.split(',');

    // Quitar ceros a la izquierda innecesarios
    const trimmedInt = intPart.replace(/^0+(?=\d)/, '');

    // Formatear parte entera con puntos de miles
    const formattedInt = trimmedInt.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    const hasComma = clean.includes(',');
    const decPart = decParts.join('').slice(0, 2);
    const formatted = hasComma ? (formattedInt || '0') + ',' + decPart : formattedInt;

    // Número limpio para el formulario reactivo
    const numVal = parseFloat(formatted.replace(/\./g, '').replace(',', '.')) || 0;

    this.displayAmount.set(formatted);
    this.currentAmount.set(numVal);
    if (numVal > 0) {
      this.amountSubmittedInvalid.set(false);
    }
    input.value = formatted;

    // Preservar la posición del cursor de forma natural
    const lengthDiff = formatted.length - prevLength;
    const newCursor = Math.max(0, prevCursor + lengthDiff);
    setTimeout(() => {
      try {
        input.setSelectionRange(newCursor, newCursor);
      } catch {}
    }, 0);

    const amountControl = this.transactionForm.controls['amount'];
    amountControl.setValue(numVal);
    amountControl.markAsDirty();
    amountControl.markAsTouched();
    amountControl.updateValueAndValidity();
  }

  onAmountInputBlur(): void {
    const currentNum = this.transactionForm.controls['amount'].value;
    if (!currentNum || currentNum === 0) {
      this.displayAmount.set('');
      this.currentAmount.set(0);
    } else {
      this.displayAmount.set(this.formatNumberToThousands(currentNum));
      this.currentAmount.set(Number(currentNum));
    }
    this.transactionForm.controls['amount'].markAsTouched();
  }

  public formatNumberToThousands(num: number | null | undefined): string {
    if (num == null || isNaN(num) || num === 0) return '';
    const parts = num.toString().split('.');
    const intFormatted = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts.length > 1 ? `${intFormatted},${parts[1].slice(0, 2)}` : intFormatted;
  }

  public parseFormattedStringToNumber(str: string): number {
    if (!str) return 0;
    const clean = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  }

  // ==========================================
  // DICTADO DE GASTOS POR VOZ CON GEMINI AI
  // ==========================================

  public async toggleVoiceRecording(): Promise<void> {
    if (this.isRecordingVoice()) {
      this.stopVoiceRecording();
    } else {
      await this.startVoiceRecording();
    }
  }

  private async startVoiceRecording(): Promise<void> {
    this.voiceLiveTranscript.set('');
    await this.nativeDeviceService.triggerHaptic('light');

    // Intentar SpeechRecognition nativo primero (Chrome, Edge, Safari, Android)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.lang = 'es-CO';
        this.speechRecognition.continuous = true; // Escucha continua sin corte prematuro a los 5 segundos
        this.speechRecognition.interimResults = true;

        this.speechRecognition.onstart = () => {
          this.isRecordingVoice.set(true);
        };

        this.speechRecognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          this.voiceLiveTranscript.set(currentTranscript);

          // Pausa inteligente: si el usuario deja de hablar por 3.5 segundos, finaliza de forma natural
          if (this.voiceSilenceTimer) {
            clearTimeout(this.voiceSilenceTimer);
          }
          this.voiceSilenceTimer = setTimeout(() => {
            if (this.isRecordingVoice() && this.voiceLiveTranscript().trim()) {
              this.stopVoiceRecording();
            }
          }, 3500);
        };

        this.speechRecognition.onend = () => {
          this.isRecordingVoice.set(false);
          if (this.voiceSilenceTimer) {
            clearTimeout(this.voiceSilenceTimer);
            this.voiceSilenceTimer = null;
          }
          const finalTranscript = this.voiceLiveTranscript().trim();
          if (finalTranscript && !this.isProcessingVoice()) {
            this.processVoiceTranscript(finalTranscript);
          }
        };

        this.speechRecognition.onerror = (err: any) => {
          console.warn('SpeechRecognition error:', err);
          if (err.error !== 'no-speech') {
            this.isRecordingVoice.set(false);
            if (!this.voiceLiveTranscript()) {
              this.startMediaRecorderFallback();
            }
          }
        };

        this.speechRecognition.start();
        return;
      } catch (e) {
        console.warn('SpeechRecognition no pudo iniciar, pasando a MediaRecorder:', e);
      }
    }

    // Fallback con MediaRecorder y audio a Gemini
    await this.startMediaRecorderFallback();
  }

  private async startMediaRecorderFallback(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        this.isRecordingVoice.set(false);
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
        if (audioBlob.size > 0) {
          await this.processVoiceAudioBlob(audioBlob);
        }
      };

      this.mediaRecorder.start();
      this.isRecordingVoice.set(true);
    } catch (err: any) {
      console.error('Error accediendo al micrófono:', err);
      this.message.error('No se pudo acceder al micrófono. Por favor verifica los permisos en tu navegador.');
      this.isRecordingVoice.set(false);
    }
  }

  public stopVoiceRecording(): void {
    if (this.voiceSilenceTimer) {
      clearTimeout(this.voiceSilenceTimer);
      this.voiceSilenceTimer = null;
    }
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
      } catch {}
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.isRecordingVoice.set(false);
  }

  private async processVoiceTranscript(transcript: string): Promise<void> {
    this.isProcessingVoice.set(true);
    try {
      const catNames = this.categories().map(c => c.name);
      const methodNames = this.paymentMethods().map(m => m.name);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (typeof window !== 'undefined') {
        const customApiKey = localStorage.getItem('custom_gemini_api_key') || '';
        if (customApiKey && customApiKey.trim().length > 10) {
          headers['x-gemini-api-key'] = customApiKey.trim();
        }
      }

      const res = await fetch('/api/parse-voice-expense', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transcript,
          categories: catNames,
          paymentMethods: methodNames
        })
      });

      const result = await res.json();
      if (result.success && result.data) {
        this.applyParsedVoiceData(result.data);
      } else {
        this.applyLocalFallbackTranscript(transcript);
      }
    } catch (e: any) {
      console.warn('Fallo en comunicación remota, usando extractor semántico directo:', e);
      this.applyLocalFallbackTranscript(transcript);
    } finally {
      this.isProcessingVoice.set(false);
    }
  }

  private applyLocalFallbackTranscript(transcript: string): void {
    const norm = transcript.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let type = 'EXPENSE';
    if (/transfer|pase|transferi|envie/.test(norm)) {
      type = 'TRANSFER';
    } else if (/ingreso|salario|sueldo|recibi|gane|honorarios|me pagaron|consignacion/.test(norm)) {
      type = 'INCOME';
    }

    let amount = 0;
    const textNumberMap: Record<string, number> = {
      'un millon': 1000000,
      'dos millones': 2000000,
      'tres millones': 3000000,
      'quinientos mil': 500000,
      'cuatrocientos mil': 400000,
      'trescientos mil': 300000,
      'doscientos mil': 200000,
      'cien mil': 100000,
      'noventa mil': 90000,
      'ochenta mil': 80000,
      'setenta mil': 70000,
      'sesenta mil': 60000,
      'cincuenta mil': 50000,
      'cuarenta mil': 40000,
      'treinta mil': 30000,
      'veinticinco mil': 25000,
      'veinte mil': 20000,
      'quince mil': 15000,
      'diez mil': 10000,
      'cinco mil': 5000,
      'dos mil': 2000,
      'mil': 1000
    };

    for (const [phrase, val] of Object.entries(textNumberMap)) {
      if (norm.includes(phrase)) {
        amount = val;
        break;
      }
    }

    if (!amount) {
      const milMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/);
      if (milMatch) {
        amount = parseFloat(milMatch[1].replace(',', '.')) * 1000;
      } else {
        const numMatch = norm.match(/(\d{1,3}(?:\.\d{3})+|\d+)/);
        if (numMatch) {
          amount = parseFloat(numMatch[1].replace(/\./g, ''));
        }
      }
    }

    const matchedCat = this.categories().find(c => {
      const clean = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return norm.includes(clean);
    });

    const matchedMethod = this.paymentMethods().find(m => {
      const clean = m.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return norm.includes(clean);
    });

    let description = transcript.trim();
    if (description.length > 60) {
      description = description.slice(0, 57) + '...';
    }

    const fallbackData = {
      amount,
      type,
      category_hint: matchedCat?.name || '',
      payment_method_hint: matchedMethod?.name || '',
      destination_method_hint: null,
      description: description.charAt(0).toUpperCase() + description.slice(1),
      date: new Date().toISOString().split('T')[0]
    };

    this.applyParsedVoiceData(fallbackData);
  }

  private async processVoiceAudioBlob(blob: Blob): Promise<void> {
    this.isProcessingVoice.set(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64 = await base64Promise;

      const catNames = this.categories().map(c => c.name);
      const methodNames = this.paymentMethods().map(m => m.name);

      const res = await fetch('/api/parse-voice-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: blob.type || 'audio/webm',
          categories: catNames,
          paymentMethods: methodNames
        })
      });

      const result = await res.json();
      if (result.success && result.data) {
        this.applyParsedVoiceData(result.data);
      } else {
        this.message.warning(result.error || 'No se pudo interpretar el audio.');
      }
    } catch (e: any) {
      console.error('Error enviando audio a Gemini:', e);
      this.message.error('Error al procesar el audio con Gemini AI.');
    } finally {
      this.isProcessingVoice.set(false);
    }
  }

  private applyParsedVoiceData(data: any): void {
    const patchObj: Record<string, any> = {};

    // 1. Tipo
    if (data.type && ['EXPENSE', 'INCOME', 'TRANSFER'].includes(data.type)) {
      patchObj['type'] = data.type;
    }

    // 2. Monto
    if (data.amount && Number(data.amount) > 0) {
      const num = Number(data.amount);
      patchObj['amount'] = num;
      this.currentAmount.set(num);
      this.amountSubmittedInvalid.set(false);
      this.displayAmount.set(this.formatNumberToThousands(num));
    }

    // 3. Descripción
    if (data.description) {
      patchObj['description'] = data.description;
    }

    // 4. Fecha
    if (data.date) {
      const parsedDate = new Date(data.date + 'T12:00:00');
      if (!isNaN(parsedDate.getTime())) {
        patchObj['date'] = parsedDate;
      }
    }

    // 5. Categoría coincidente
    if (data.category_hint) {
      const hint = data.category_hint.toLowerCase().trim();
      const matched = this.categories().find(c => 
        c.name.toLowerCase().includes(hint) || hint.includes(c.name.toLowerCase())
      );
      if (matched) {
        patchObj['category_id'] = matched.id;
      }
    }

    // 6. Cuenta o billetera origen
    if (data.payment_method_hint) {
      const hint = data.payment_method_hint.toLowerCase().trim();
      const matched = this.paymentMethods().find(m => 
        m.name.toLowerCase().includes(hint) || hint.includes(m.name.toLowerCase())
      );
      if (matched) {
        patchObj['payment_method_id'] = matched.id;
      }
    }

    // 7. Cuenta destino si es transferencia
    if (data.destination_method_hint && data.type === 'TRANSFER') {
      const hint = data.destination_method_hint.toLowerCase().trim();
      const matched = this.paymentMethods().find(m => 
        m.name.toLowerCase().includes(hint) || hint.includes(m.name.toLowerCase())
      );
      if (matched) {
        patchObj['destination_method_id'] = matched.id;
      }
    }

    this.transactionForm.patchValue(patchObj);
    this.nativeDeviceService.triggerHaptic('success');
    this.message.success('¡Gasto interpretado por Gemini AI! Revisa los campos y guarda cuando desees.');
  }

  // ==========================================
  // CICLO DE VIDA Y LÓGICA DE NEGOCIO
  // ==========================================

  async ngOnInit(): Promise<void> {
    await this.loadCatalogs();
  }

  public async loadCatalogs(force = false): Promise<void> {
    if (this.isLoadingCatalogs()) return;
    if (!force && this.categories().length > 0 && this.paymentMethods().length > 0) {
      return;
    }

    this.isLoadingCatalogs.set(true);
    try {
      const [cats, methods] = await Promise.all([
        this.catalogService.getCategories(),
        this.catalogService.getPaymentMethods()
      ]);
      this.categories.set(cats);
      this.paymentMethods.set(methods);
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      try {
        await new Promise(r => setTimeout(r, 600));
        const [cats, methods] = await Promise.all([
          this.catalogService.getCategories(),
          this.catalogService.getPaymentMethods()
        ]);
        this.categories.set(cats);
        this.paymentMethods.set(methods);
      } catch (retryErr) {
        console.error('Fallo definitivo al cargar catálogos:', retryErr);
      }
    } finally {
      this.isLoadingCatalogs.set(false);
    }
  }

  private applyAmountValidators(type: string, balance: number | null): void {
    const amountControl = this.transactionForm.controls['amount'];
    if ((type === 'EXPENSE' || type === 'TRANSFER') && balance !== null) {
      amountControl.setValidators([Validators.required, Validators.min(0.01), Validators.max(balance)]);
    } else {
      amountControl.setValidators([Validators.required, Validators.min(0.01)]);
    }
    amountControl.updateValueAndValidity({ emitEvent: false });
  }

  private async refreshSelectedWalletBalance(type: string, methodId: string | null): Promise<void> {
    if (!methodId) {
      this.availableBalance.set(null);
      this.applyAmountValidators(type, null);
      return;
    }

    // 1. Actualización inmediata desde el mapa de saldos en memoria (sin latencia visual)
    const cachedMap = this.walletBalances();
    if (methodId in cachedMap) {
      const instantBalance = this.getEffectiveWalletBalance(methodId, cachedMap[methodId]);
      this.availableBalance.set(instantBalance);
      this.applyAmountValidators(type, instantBalance);
    }

    // 2. Verificación estricta contra base de datos para máxima precisión
    this.isCheckingBalance.set(true);
    try {
      const dbBalance = await this.transactionService.getBalanceByPaymentMethod(methodId);
      // Actualizar caché local para esta billetera
      this.walletBalances.update(prev => ({ ...prev, [methodId]: dbBalance }));

      // Confirmar que el usuario sigue teniendo seleccionada la misma billetera
      if (this.transactionForm.controls['payment_method_id'].value === methodId) {
        const effectiveBalance = this.getEffectiveWalletBalance(methodId, dbBalance);
        this.availableBalance.set(effectiveBalance);
        this.applyAmountValidators(this.transactionForm.controls['type'].value, effectiveBalance);
      }
    } catch (error) {
      console.error('Error validando fondos:', error);
      // Fallback al saldo en memoria si la consulta puntual falla
      const fallbackBalance = this.getEffectiveWalletBalance(methodId);
      this.availableBalance.set(fallbackBalance);
      this.applyAmountValidators(type, fallbackBalance);
    } finally {
      this.isCheckingBalance.set(false);
    }
  }

  private setupFormListeners(): void {
    this.transactionForm.controls['type'].valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        const destControl = this.transactionForm.controls['destination_method_id'];
        const catControl = this.transactionForm.controls['category_id'];

        catControl.setValue(null);
        destControl.setValue(null);

        if (type === 'TRANSFER') {
          destControl.setValidators([Validators.required]);
          catControl.clearValidators();
        } else {
          destControl.clearValidators();
        }
        destControl.updateValueAndValidity();
        catControl.updateValueAndValidity();
      });

    combineLatest([
      this.transactionForm.controls['type'].valueChanges.pipe(startWith(this.transactionForm.value.type)),
      this.transactionForm.controls['payment_method_id'].valueChanges.pipe(startWith(this.transactionForm.value.payment_method_id))
    ])
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(async ([type, methodId]) => {
      await this.refreshSelectedWalletBalance(type, methodId);
    });
  }

  public openForEdit(tx: TransactionWithDetails): void {
    const numAmount = Number(tx.amount);
    this.currentAmount.set(numAmount);
    this.displayAmount.set(this.formatNumberToThousands(numAmount));
    this.transactionForm.patchValue({
      type: tx.type,
      amount: numAmount,
      date: new Date(tx.date),
      description: tx.description || '',
      category_id: tx.category_id || null,
      payment_method_id: tx.payment_method_id || null
    });
  }

  public async onCapturePhoto(): Promise<void> {
    if (this.isCapturingImage() || this.isScanningReceipt()) return;
    this.isCapturingImage.set(true);

    try {
      const captured = await this.nativeDeviceService.captureFromCamera();
      if (captured) {
        await this.processImageDirectly(captured);
      }
    } catch (err: any) {
      console.error('Error al capturar foto con cámara:', err);
      this.message.error('No se pudo acceder a la cámara.');
    } finally {
      this.isCapturingImage.set(false);
    }
  }

  public async onPickFile(): Promise<void> {
    if (this.isCapturingImage() || this.isScanningReceipt()) return;
    this.isCapturingImage.set(true);

    try {
      const captured = await this.nativeDeviceService.pickFromGallery();
      if (captured) {
        await this.processImageDirectly(captured);
      }
    } catch (err: any) {
      console.error('Error al seleccionar archivo de comprobante:', err);
      this.message.error('No se pudo cargar el archivo.');
    } finally {
      this.isCapturingImage.set(false);
    }
  }

  private async processImageDirectly(captured: { base64: string; mimeType: string; dataUrl: string }): Promise<void> {
    this.isScanningReceipt.set(true);
    this.scannedReceiptThumbnail.set(captured.dataUrl);
    await this.nativeDeviceService.triggerHaptic('light');

    try {
      const data = await this.receiptScannerService.scanReceipt(captured.base64, captured.mimeType);
      this.scannedReceiptInfo.set(data);

      // Auto-rellenar valores en el formulario reactivo
      const patchObj: Record<string, any> = {
        type: data.type || 'EXPENSE',
        amount: data.amount > 0 ? data.amount : this.transactionForm.value.amount,
        description: data.description || (data.merchant ? `Compra en ${data.merchant}` : ''),
      };

      if (data.amount > 0) {
        this.currentAmount.set(Number(data.amount));
        this.amountSubmittedInvalid.set(false);
        this.displayAmount.set(this.formatNumberToThousands(data.amount));
      }

      if (data.date) {
        try {
          const parts = data.date.split('-');
          if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            patchObj['date'] = new Date(year, month, day);
          }
        } catch {
          // fecha actual por defecto
        }
      }

      // Auto-seleccionar categoría sugerida
      if (data.category_hint) {
        const matchedCatId = this.receiptScannerService.findBestMatchingCategory(
          data.category_hint,
          this.categories()
        );
        if (matchedCatId) {
          patchObj['category_id'] = matchedCatId;
        }
      }

      // Auto-seleccionar método de pago si fue detectado
      if (data.payment_method_hint && data.payment_method_hint !== 'Desconocido') {
        const hintLower = data.payment_method_hint.toLowerCase();
        const matchedMethod = this.paymentMethods().find(m => {
          const nameLower = m.name.toLowerCase();
          return nameLower.includes(hintLower) || hintLower.includes(nameLower);
        });
        if (matchedMethod) {
          patchObj['payment_method_id'] = matchedMethod.id;
        }
      }

      this.transactionForm.patchValue(patchObj);
      await this.nativeDeviceService.triggerHaptic('success');
      this.message.success(`Factura de "${data.merchant}" analizada con éxito`);
    } catch (err: any) {
      console.error('Error al escanear comprobante:', err);
      await this.nativeDeviceService.triggerHaptic('error');
      this.message.error(err?.message || 'No se pudo analizar la factura.');
    } finally {
      this.isScanningReceipt.set(false);
    }
  }

  public clearScannedReceipt(): void {
    this.scannedReceiptInfo.set(null);
    this.scannedReceiptThumbnail.set(null);
  }

  public resetForm(): void {
    this.transactionForm.reset({
      type: 'EXPENSE', amount: 0, date: new Date(), description: '', category_id: null, payment_method_id: null, destination_method_id: null
    });
    this.displayAmount.set('');
    this.currentAmount.set(0);
    this.amountSubmittedInvalid.set(false);
    this.stopVoiceRecording();
    this.availableBalance.set(null);
    this.clearScannedReceipt();
  }

  onCancel(): void {
    this.closeModal.emit();
    this.resetForm();
  }

  async onSubmit(): Promise<void> {
    // Asegurar sincronización de validadores de saldo antes de validar el formulario
    const currentType = this.transactionForm.controls['type'].value;
    const currentMethodId = this.transactionForm.controls['payment_method_id'].value;
    if (currentMethodId && this.availableBalance() !== null) {
      this.applyAmountValidators(currentType, this.availableBalance());
    }

    if (this.transactionForm.valid && !this.isInsufficientBalance()) {
      this.isSubmitting.set(true);
      try {
        const rawValues = this.transactionForm.getRawValue();
        const formattedDate = (rawValues.date as Date).toISOString().split('T')[0];

        if (rawValues.type === 'TRANSFER') {
          await this.transactionService.createTransfer({
            amount: rawValues.amount,
            date: formattedDate,
            description: rawValues.description,
            source_method_id: rawValues.payment_method_id,
            destination_method_id: rawValues.destination_method_id
          });
          this.message.success('Transferencia ejecutada exitosamente');
        } else {
          const formattedData = {
            type: rawValues.type,
            amount: rawValues.amount,
            date: formattedDate,
            description: rawValues.description,
            category_id: rawValues.category_id,
            payment_method_id: rawValues.payment_method_id
          };

          const editTarget = this.transactionToEdit();
          if (editTarget) {
            await this.transactionService.updateTransaction(editTarget.id, formattedData);
            this.message.success('Transacción actualizada exitosamente');
          } else {
            await this.transactionService.createTransaction(formattedData);
            this.message.success('Transacción registrada exitosamente');
          }

          // ALERTA DE GASTO ELEVADO: Si es gasto y supera el umbral configurado
          if (rawValues.type === 'EXPENSE' && this.userPreferences.alertsEnabled()) {
            const threshold = this.userPreferences.expenseAlertThreshold();
            const amountNum = Number(rawValues.amount);
            if (threshold > 0 && amountNum >= threshold) {
              const sym = this.userPreferences.currencySymbol();
              setTimeout(() => {
                this.message.warning(
                  `⚠️ Alerta de Gasto Elevado: Esta compra de ${sym}${amountNum.toLocaleString('es-CO')} superó tu umbral de alerta de ${sym}${threshold.toLocaleString('es-CO')}.`,
                  { nzDuration: 7000 }
                );
              }, 400);
            }
          }
        }

        this.closeModal.emit();
        this.resetForm();
        this.transactionSaved.emit();

      } catch (error) {
        console.error('Error al guardar:', error);
        this.message.error('Ocurrió un error al procesar la operación');
      } finally {
        this.isSubmitting.set(false);
      }
    } else {
      Object.values(this.transactionForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.markAsTouched();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });

      const amountVal = this.currentAmount();
      if (!amountVal || amountVal <= 0) {
        this.amountSubmittedInvalid.set(true);
      }

      await this.nativeDeviceService.triggerHaptic('error');

      // Mostrar alerta explicativa clara según la causa del bloqueo
      if (this.isInsufficientBalance() || this.transactionForm.controls['amount'].errors?.['max']) {
        const sym = this.userPreferences.currencySymbol();
        const avail = this.formatSignedCurrency(this.availableBalance() ?? 0);
        const entered = this.formatSignedCurrency(amountVal);
        const selectedMethod = this.paymentMethods().find(m => m.id === currentMethodId);
        const walletName = selectedMethod ? `"${selectedMethod.name}"` : 'la billetera seleccionada';
        this.message.error(
          `Saldo insuficiente en ${walletName}. Disponible: ${sym}${avail} · Intentaste registrar: ${sym}${entered}`,
          { nzDuration: 5000 }
        );
      } else if (!amountVal || amountVal <= 0) {
        this.message.warning('Por favor ingresa un monto mayor a 0 para registrar el movimiento.');
      } else if (!currentMethodId) {
        this.message.warning('Por favor selecciona la billetera o cuenta del movimiento.');
      } else if (currentType === 'TRANSFER' && !this.transactionForm.controls['destination_method_id'].value) {
        this.message.warning('Por favor selecciona la cuenta destino para la transferencia.');
      }
    }
  }
}
