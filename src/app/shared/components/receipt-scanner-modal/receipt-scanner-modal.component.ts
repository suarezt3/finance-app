import { Component, input, output, signal, effect, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';

export type DocumentFilterType = 'enhanced' | 'bw' | 'normal';

@Component({
  selector: 'app-receipt-scanner-modal',
  standalone: true,
  imports: [
    CommonModule,
    NzModalModule,
    NzButtonModule,
    NzIconModule,
    NzSpinModule,
    NzTooltipModule
  ],
  template: `
    <nz-modal
      [nzVisible]="isVisible()"
      [nzFooter]="null"
      [nzClosable]="false"
      [nzCentered]="true"
      [nzWidth]="'92vw'"
      [nzStyle]="{ maxWidth: '440px', padding: '0' }"
      (nzOnCancel)="onCancel()"
      [nzBodyStyle]="{ padding: '0', background: '#0b1120', borderRadius: '1.25rem', overflow: 'hidden' }"
    >
      <div *nzModalContent class="doc-scanner-container flex flex-col h-[60vh] max-h-[490px] bg-slate-950 text-slate-100 select-none">

        <!-- BARRA SUPERIOR: HERRAMIENTAS (ESTILO WHATSAPP/CAMSCANNER) -->
        <header class="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur z-10">
          <button
            type="button"
            (click)="onCancel()"
            class="text-slate-300 hover:text-white flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg hover:bg-slate-800 transition"
          >
            <span nz-icon nzType="arrow-left" nzTheme="outline" class="text-xs"></span>
            <span>Volver</span>
          </button>

          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <span nz-icon nzType="scan" nzTheme="outline" class="text-indigo-400"></span>
              Escáner
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <!-- Rotar 90 grados -->
            <button
              type="button"
              (click)="rotate90()"
              nz-tooltip
              nzTooltipTitle="Rotar 90°"
              class="text-slate-300 hover:text-white p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
            >
              <span nz-icon nzType="redo" nzTheme="outline" class="text-sm"></span>
            </button>

            <!-- Recortar bordes (Márgenes automáticos) -->
            <button
              type="button"
              (click)="cycleCropMargin()"
              nz-tooltip
              [nzTooltipTitle]="'Recorte: ' + cropMarginLabel()"
              class="text-slate-300 hover:text-white px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition flex items-center gap-1 text-xs"
            >
              <span nz-icon nzType="border" nzTheme="outline" class="text-xs"></span>
              <span>{{ cropMarginLabel() }}</span>
            </button>
          </div>
        </header>

        <!-- VISOR CENTRAL: LIENZO CON GUÍAS DE ENCUADRE TIPO DOCUMENTO -->
        <main class="relative flex-1 flex items-center justify-center p-3 bg-slate-950 overflow-hidden">
          <canvas #canvasElement class="hidden"></canvas>

          @if (isProcessing()) {
            <div class="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20 gap-2">
              <nz-spin nzSimple></nz-spin>
              <span class="text-xs text-indigo-300 font-medium">Aplicando realce...</span>
            </div>
          }

          <div class="relative max-w-full max-h-full flex items-center justify-center shadow-xl rounded-lg overflow-hidden border border-slate-700/60 bg-black">
            <!-- Guías visuales de esquinas de escaneo de documento -->
            <div class="absolute top-1.5 left-1.5 w-5 h-5 border-t-2 border-l-2 border-indigo-400 pointer-events-none z-10"></div>
            <div class="absolute top-1.5 right-1.5 w-5 h-5 border-t-2 border-r-2 border-indigo-400 pointer-events-none z-10"></div>
            <div class="absolute bottom-1.5 left-1.5 w-5 h-5 border-b-2 border-l-2 border-indigo-400 pointer-events-none z-10"></div>
            <div class="absolute bottom-1.5 right-1.5 w-5 h-5 border-b-2 border-r-2 border-indigo-400 pointer-events-none z-10"></div>

            <img
              [src]="previewDataUrl()"
              alt="Vista previa del comprobante"
              class="max-h-[30vh] max-w-[75vw] object-contain block select-none"
            />
          </div>
        </main>

        <!-- BARRA INFERIOR: SELECTOR DE FILTROS Y ACCIÓN PRINCIPAL -->
        <footer class="flex flex-col gap-3 px-4 py-3.5 bg-slate-900 border-t border-slate-800 z-10">

          <!-- Selector de filtros estilo CamScanner -->
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-medium text-slate-400">Modo de filtro:</span>
            <div class="flex gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                (click)="setFilter('enhanced')"
                [class.bg-indigo-600]="filter() === 'enhanced'"
                [class.text-white]="filter() === 'enhanced'"
                [class.text-slate-400]="filter() !== 'enhanced'"
                class="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1"
              >
                <span>⚡ Realce Mágico</span>
              </button>

              <button
                type="button"
                (click)="setFilter('bw')"
                [class.bg-indigo-600]="filter() === 'bw'"
                [class.text-white]="filter() === 'bw'"
                [class.text-slate-400]="filter() !== 'bw'"
                class="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1"
              >
                <span>📄 B&W Nítido</span>
              </button>

              <button
                type="button"
                (click)="setFilter('normal')"
                [class.bg-indigo-600]="filter() === 'normal'"
                [class.text-white]="filter() === 'normal'"
                [class.text-slate-400]="filter() !== 'normal'"
                class="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1"
              >
                <span>🖼️ Original</span>
              </button>
            </div>
          </div>

          <!-- Botones de Acción -->
          <div class="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              (click)="onRetake()"
              class="flex-1 py-2 px-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center justify-center gap-1.5"
            >
              <span nz-icon nzType="camera" nzTheme="outline"></span>
              <span>Cambiar Foto</span>
            </button>

            <button
              type="button"
              (click)="confirmScan()"
              class="flex-2 py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <span nz-icon nzType="thunderbolt" nzTheme="fill"></span>
              <span>Procesar Factura con IA</span>
            </button>
          </div>

        </footer>

      </div>
    </nz-modal>
  `,
  styles: [`
    :host ::ng-deep .ant-modal-content {
      background: transparent !important;
      box-shadow: none !important;
    }
  `]
})
export class ReceiptScannerModalComponent {
  readonly isVisible = input.required<boolean>();
  readonly rawImageDataUrl = input<string | null>(null);

  readonly scanConfirmed = output<{ base64: string; mimeType: string; dataUrl: string }>();
  readonly cancelled = output<void>();
  readonly retakeRequested = output<void>();

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvasElement');

  readonly filter = signal<DocumentFilterType>('enhanced');
  readonly rotation = signal<number>(0);
  readonly marginCrop = signal<number>(0); // 0 = 0%, 1 = 4%, 2 = 8%
  readonly isProcessing = signal<boolean>(false);
  readonly previewDataUrl = signal<string>('');

  private sourceImage: HTMLImageElement | null = null;

  constructor() {
    effect(() => {
      const dataUrl = this.rawImageDataUrl();
      const visible = this.isVisible();
      if (visible && dataUrl) {
        this.loadImageAndRender(dataUrl);
      }
    });
  }

  cropMarginLabel(): string {
    const m = this.marginCrop();
    if (m === 0) return 'Sin recorte';
    if (m === 1) return 'Recorte 4%';
    return 'Recorte 8%';
  }

  setFilter(newFilter: DocumentFilterType): void {
    if (this.filter() !== newFilter) {
      this.filter.set(newFilter);
      this.renderCanvas();
    }
  }

  rotate90(): void {
    this.rotation.update(r => (r + 90) % 360);
    this.renderCanvas();
  }

  cycleCropMargin(): void {
    this.marginCrop.update(m => (m + 1) % 3);
    this.renderCanvas();
  }

  readonly isSubmitting = signal<boolean>(false);

  onCancel(): void {
    this.isSubmitting.set(false);
    this.cancelled.emit();
  }

  onRetake(): void {
    this.isSubmitting.set(false);
    this.retakeRequested.emit();
  }

  confirmScan(): void {
    if (this.isSubmitting()) return;
    const dataUrl = this.previewDataUrl();
    if (!dataUrl) return;

    this.isSubmitting.set(true);
    const cleanBase64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    this.scanConfirmed.emit({
      base64: cleanBase64,
      mimeType: 'image/jpeg',
      dataUrl
    });
  }

  private loadImageAndRender(dataUrl: string): void {
    this.isSubmitting.set(false);
    this.isProcessing.set(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.sourceImage = img;
      this.renderCanvas();
      this.isProcessing.set(false);
    };
    img.onerror = () => {
      this.previewDataUrl.set(dataUrl);
      this.isProcessing.set(false);
    };
    img.src = dataUrl;
  }

  private renderCanvas(): void {
    if (!this.sourceImage) return;

    const img = this.sourceImage;
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      // Fallback a preview directa si el canvas aún no está en DOM
      this.previewDataUrl.set(img.src);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rot = this.rotation();
    const isSideways = rot === 90 || rot === 270;

    // Dimensiones máximas optimizadas para OCR rápido (1200px máx)
    const maxDim = 1200;
    let srcW = img.width;
    let srcH = img.height;

    // Aplicar recorte de margen si está activo
    const cropPct = this.marginCrop() === 1 ? 0.04 : (this.marginCrop() === 2 ? 0.08 : 0);
    const cropX = Math.round(srcW * cropPct);
    const cropY = Math.round(srcH * cropPct);
    const drawW = srcW - (cropX * 2);
    const drawH = srcH - (cropY * 2);

    let targetW = isSideways ? drawH : drawW;
    let targetH = isSideways ? drawW : drawH;

    if (targetW > maxDim || targetH > maxDim) {
      if (targetW > targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }

    canvas.width = targetW;
    canvas.height = targetH;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);

    const destW = isSideways ? targetH : targetW;
    const destH = isSideways ? targetW : targetH;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      img,
      cropX, cropY, drawW, drawH,
      -destW / 2, -destH / 2, destW, destH
    );
    ctx.restore();

    // Aplicar filtros de documento con manipulación directa de píxeles
    const currentFilter = this.filter();
    if (currentFilter !== 'normal') {
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const len = data.length;

        if (currentFilter === 'bw') {
          // B&W Nítido: Binarización adaptativa con eliminación de fondos grises
          for (let i = 0; i < len; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Luminancia perceptual
            const gray = (r * 0.299 + g * 0.587 + b * 0.114);

            if (gray > 130) {
              // Fondo de papel -> blanco puro
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
            } else {
              // Texto/números impresos -> negro contrastado
              const dark = Math.max(0, gray * 0.6);
              data[i] = dark;
              data[i + 1] = dark;
              data[i + 2] = dark;
            }
          }
        } else if (currentFilter === 'enhanced') {
          // Realce Mágico (CamScanner/WhatsApp): Aumento de contraste local + nitidez
          for (let i = 0; i < len; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Curva de contraste S
            r = r > 128 ? Math.min(255, 128 + (r - 128) * 1.35) : Math.max(0, 128 - (128 - r) * 1.35);
            g = g > 128 ? Math.min(255, 128 + (g - 128) * 1.35) : Math.max(0, 128 - (128 - g) * 1.35);
            b = b > 128 ? Math.min(255, 128 + (b - 128) * 1.35) : Math.max(0, 128 - (128 - b) * 1.35);

            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }

        ctx.putImageData(imgData, 0, 0);
      } catch (err) {
        console.warn('No se pudo aplicar filtro de píxeles al canvas:', err);
      }
    }

    const compressed = canvas.toDataURL('image/jpeg', 0.78);
    this.previewDataUrl.set(compressed);
  }
}
