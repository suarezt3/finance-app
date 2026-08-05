// src/app/core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Functional Guard para proteger rutas privadas.
 * Utiliza inyección de dependencias moderna para interceptar la navegación.
 */
export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  try {
    // 1. Esperamos la resolución oficial de Supabase
    const session = await authService.getSession();

    if (session) {
      // 2. Sesión válida: permitimos el renderizado del componente
      return true;
    }

    // 3. Sin sesión activa: redirigimos de forma segura al Login
    router.navigate(['/auth']);
    return false;

  } catch (error) {
    // 4. Ante cualquier fallo técnico o de red, denegamos el acceso por seguridad (Fail-Safe)
    console.error('Error de seguridad validando el acceso:', error);
    router.navigate(['/auth']);
    return false;
  }
};
