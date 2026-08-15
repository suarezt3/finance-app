import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import es from '@angular/common/locales/es';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
// Proveedor oficial de ngx-echarts
import { provideEchartsCore } from 'ngx-echarts';

registerLocaleData(es);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideNzI18n(es_ES),
    provideNzDateFnsAdapter(),
    // Configuración Enterprise: Lazy Loading del motor de ECharts
    // Esto asegura que ECharts no bloquee la carga inicial de la aplicación.
    provideEchartsCore({ echarts: () => import('echarts') })
  ],
};
