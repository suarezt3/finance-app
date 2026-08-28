import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaUpdateService } from './core/services/pwa-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class App {
  protected readonly title = signal('finance');
  constructor() {
    // Inyectamos el servicio sin asignarlo a ninguna propiedad.
    // Esto fuerza a Angular a instanciarlo y arrancar la vigilancia de la PWA,
    // cumpliendo el objetivo sin ensuciar la clase con variables sin uso.
    inject(PwaUpdateService);
  }

}
