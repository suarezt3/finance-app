import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export interface CapturedImage {
  base64: string;
  mimeType: string;
  dataUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class NativeDeviceService {
  readonly isNative = signal<boolean>(false);
  readonly platform = signal<string>('web');

  constructor() {
    if (typeof window !== 'undefined') {
      const native = Capacitor.isNativePlatform();
      this.isNative.set(native);
      this.platform.set(Capacitor.getPlatform());
    }
  }

  /**
   * Captura una imagen con la cámara del dispositivo o permite seleccionarla de la galería.
   * Funciona de forma transparente tanto en dispositivos nativos (Android/iOS) como en navegadores Web / PWA.
   */
  async captureReceiptImage(): Promise<CapturedImage | null> {
    if (typeof window === 'undefined') return null;

    if (this.isNative()) {
      try {
        const photo = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Prompt, // Pregunta al usuario: Cámara o Fotos
          promptLabelHeader: 'Escanear Comprobante',
          promptLabelPhoto: 'Elegir de la Galería',
          promptLabelPicture: 'Tomar Foto con Cámara',
          promptLabelCancel: 'Cancelar'
        });

        if (!photo.base64String) {
          return null;
        }

        const format = photo.format || 'jpeg';
        const rawMimeType = `image/${format}`;
        const rawDataUrl = `data:${rawMimeType};base64,${photo.base64String}`;

        // Comprimir y redimensionar la imagen para envío óptimo
        const compressed = await this.compressDataUrl(rawDataUrl);

        return {
          base64: compressed.cleanBase64,
          mimeType: compressed.mimeType,
          dataUrl: compressed.dataUrl
        };
      } catch (err: any) {
        // El usuario canceló la captura o denegó permisos
        if (err?.message?.includes('User cancelled') || err?.message?.includes('cancelled')) {
          return null;
        }
        console.warn('Fallo en cámara nativa, intentando fallback web:', err);
        return this.pickImageViaWebInput();
      }
    } else {
      // Entorno Web / PWA: Selector de archivos o captura de cámara web
      return this.pickImageViaWebInput();
    }
  }

  /**
   * Fallback limpio para entorno Web / Móvil / PWA con compresión automática
   */
  private pickImageViaWebInput(): Promise<CapturedImage | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      // Sugerir cámara en dispositivos móviles con navegador
      input.setAttribute('capture', 'environment');
      input.style.display = 'none';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        try {
          // Comprimir la imagen del celular antes de procesarla
          const compressed = await this.compressImageFile(file, 1600, 0.82);
          resolve({
            base64: compressed.cleanBase64,
            mimeType: compressed.mimeType,
            dataUrl: compressed.dataUrl
          });
        } catch (error) {
          console.error('Error al procesar y comprimir imagen:', error);
          try {
            // Fallback directo si canvas falla
            const base64 = await this.fileToBase64(file);
            const cleanBase64 = base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
            resolve({
              base64: cleanBase64,
              mimeType: file.type || 'image/jpeg',
              dataUrl: base64
            });
          } catch {
            resolve(null);
          }
        } finally {
          document.body.removeChild(input);
        }
      };

      input.oncancel = () => {
        resolve(null);
        document.body.removeChild(input);
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  /**
   * Redimensiona y comprime un archivo de imagen en el navegador del teléfono a un tamaño ideal
   * manteniendo alta nitidez para OCR pero reduciendo el peso de ~15MB a ~300KB.
   */
  async compressImageFile(file: File, maxDimension = 1600, quality = 0.82): Promise<{ dataUrl: string; cleanBase64: string; mimeType: string }> {
    const rawDataUrl = await this.fileToBase64(file);
    return this.compressDataUrl(rawDataUrl, maxDimension, quality);
  }

  /**
   * Redimensiona y comprime una Data URL en memoria con HTML5 Canvas
   */
  async compressDataUrl(dataUrl: string, maxDimension = 1600, quality = 0.82): Promise<{ dataUrl: string; cleanBase64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          const cleanBase64 = dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
          resolve({ dataUrl, cleanBase64, mimeType: 'image/jpeg' });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/jpeg';
        const compressedDataUrl = canvas.toDataURL(mimeType, quality);
        const cleanBase64 = compressedDataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

        resolve({
          dataUrl: compressedDataUrl,
          cleanBase64,
          mimeType
        });
      };

      img.onerror = (err) => reject(err);
      img.src = dataUrl;
    });
  }

  /**
   * Vibración háptica agradable para confirmaciones o avisos
   */
  async triggerHaptic(type: 'light' | 'medium' | 'success' | 'warning' | 'error' = 'light'): Promise<void> {
    if (typeof window === 'undefined') return;

    if (this.isNative()) {
      try {
        if (type === 'light') {
          await Haptics.impact({ style: ImpactStyle.Light });
        } else if (type === 'medium') {
          await Haptics.impact({ style: ImpactStyle.Medium });
        } else if (type === 'success') {
          await Haptics.notification({ type: NotificationType.Success });
        } else if (type === 'warning') {
          await Haptics.notification({ type: NotificationType.Warning });
        } else if (type === 'error') {
          await Haptics.notification({ type: NotificationType.Error });
        }
      } catch {
        // Silencioso si el dispositivo no soporta haptics
      }
    } else {
      // Fallback web navigator.vibrate si está disponible
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          if (type === 'success') navigator.vibrate([40, 60, 40]);
          else if (type === 'error') navigator.vibrate([80, 100, 80]);
          else navigator.vibrate(30);
        } catch {
          // Ignorar restricciones de vibración en navegador
        }
      }
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }
}
