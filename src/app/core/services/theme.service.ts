// src/app/core/services/theme.service.ts
import { Injectable, signal, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'theme_preference';

  readonly isDarkMode = signal<boolean>(false);

  constructor() {
    this.initializeTheme();

    // Effect para mantener sincronizado el elemento raíz <html> con el estado
    effect(() => {
      const dark = this.isDarkMode();
      this.applyThemeToDOM(dark);
    });
  }

  private initializeTheme(): void {
    if (typeof window === 'undefined') return;

    const storedPref = localStorage.getItem(this.STORAGE_KEY) as ThemeMode | null;

    if (storedPref === 'dark') {
      this.isDarkMode.set(true);
    } else if (storedPref === 'light') {
      this.isDarkMode.set(false);
    } else {
      // Detección automática de preferencia del sistema
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.isDarkMode.set(prefersDark);

      // Escuchar cambios del sistema en tiempo real si el usuario no ha forzado una preferencia
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
          this.isDarkMode.set(e.matches);
        }
      });
    }
  }

  toggleTheme(): void {
    const nextState = !this.isDarkMode();
    this.isDarkMode.set(nextState);

    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, nextState ? 'dark' : 'light');
    }
  }

  setTheme(dark: boolean): void {
    this.isDarkMode.set(dark);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, dark ? 'dark' : 'light');
    }
  }

  private applyThemeToDOM(dark: boolean): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }
}
