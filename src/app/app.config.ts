import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { DatePipe } from '@angular/common';

import { routes } from './app.routes';
import { es_ES, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import es from '@angular/common/locales/es';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { provideServiceWorker } from '@angular/service-worker';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { APP_ICONS } from './core/icons.config';

registerLocaleData(es);

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(NzModalModule),
    DatePipe,
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideNzIcons(APP_ICONS),
    provideNzI18n(es_ES),
    provideNzDateFnsAdapter(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
