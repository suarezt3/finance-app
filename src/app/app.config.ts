import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { DatePipe } from '@angular/common';

import { routes } from './app.routes';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import es from '@angular/common/locales/es';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
// Proveedor oficial de ngx-echarts
import { provideEchartsCore } from 'ngx-echarts';
import { provideServiceWorker } from '@angular/service-worker';
import { NzModalModule } from 'ng-zorro-antd/modal';

registerLocaleData(es);

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(NzModalModule),
    DatePipe,
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideNzI18n(es_ES),
    provideNzDateFnsAdapter(),
    // Configuración Enterprise: Lazy Loading del motor de ECharts
    // Esto asegura que ECharts no bloquee la carga inicial de la aplicación.
    provideEchartsCore({ echarts: () => import('echarts') }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
