// src/app/shared/directives/decimal-input.directive.ts
import { Directive, ElementRef, AfterViewInit, inject } from '@angular/core';

@Directive({
  selector: 'nz-input-number[appDecimalInput]',
  standalone: true
})
export class DecimalInputDirective implements AfterViewInit {
  private readonly el = inject(ElementRef<HTMLElement>);

  ngAfterViewInit(): void {
    // Retrasamos la ejecución un ciclo (macro-task) para asegurar que
    // NG-Zorro haya terminado de renderizar su HTML interno.
    setTimeout(() => {
      // Buscamos el elemento nativo <input> oculto dentro del componente de NG-Zorro
      const innerInput = this.el.nativeElement.querySelector('input');

      if (innerInput) {
        // Le inyectamos el atributo nativo de HTML5 al input real.
        // Esto fuerza a iOS y Android a abrir el teclado numérico con separador decimal.
        innerInput.setAttribute('inputmode', 'decimal');
      }
    }, 0);
  }
}
