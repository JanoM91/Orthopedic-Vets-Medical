# Arreglo: restablecer contraseña (panel y portal)

## Qué cambia

- **Los mensajes de error ya se leen en producción.** Next.js minifica el código y las clases de error de Payload pierden su nombre. Con eso, Payload contestaba «An unknown error occurred.» aunque el error fuera público y trajera un mensaje en español (400, 403, 429). El nuevo gancho global `mostrarMensajeDeError` (`lib/erroresPublicos.ts`, en `hooks.afterError` de `payload.config.ts`):
  - devuelve el mensaje real si el error es público;
  - traduce los textos en inglés de Payload que conocemos;
  - deja ocultos los errores internos (500).

  También arregla otros mensajes que salían igual de genéricos, como «Demasiadas solicitudes de recuperación» o los avisos de roles.
- **La liga se revisa antes de cambiar la contraseña.** `revisarLigaDeRecuperacion` (`beforeOperation` de `users` y `tutores`) contesta en español:
  - liga usada o vencida → «Esta liga ya se usó o ya venció. Si ya cambiaste tu contraseña, entra con la nueva; si no, pide otra liga.»;
  - liga reemplazada por otra más nueva, o inexistente → «Esta liga ya no sirve: se pidió otra más nueva…»;
  - contraseña de menos de 8 caracteres, o liga incompleta.

  No revela si un correo tiene cuenta.
- **La liga vale 24 horas** (antes 1 hora). El correo ahora dice que sirve una sola vez y que solo vale la del correo más reciente. La invitación de tutor sigue en 7 días.
- **Formulario del portal** (`/portal/restablecer/<token>` y la entrada):
  - botón «Mostrar» en la contraseña;
  - sin mayúscula ni corrector automáticos;
  - campo «Escríbela otra vez» que avisa si no coinciden;
  - estado «Guardando…»;
  - liga «¿La liga ya no sirve? Pide otra».

## Por qué

Jano y el Dr. Joni no podían restablecer su contraseña (18-nov-2026). En los registros de Resend y Vercel y en la base (solo lectura) se vio esto:

- Todos los correos llegaron, con la liga correcta.
- Jano **sí** cambió su contraseña a las 23:21. Después volvió a usar la misma liga siete veces; cada intento respondió «Token is either invalid or has expired», que en producción se veía como «An unknown error occurred.». Sin saber qué pasaba, siguió con la liga vieja y la contraseña anterior.
- La liga del Dr. Joni venció (1 hora) antes de que la usara.

El flujo funcionaba. Lo que fallaba era que el mensaje no explicaba nada y que la vigencia era corta.

## Cómo probarlo (vista previa de Vercel)

1. Cierra sesión. En `/admin` → «¿Olvidaste tu contraseña?» → escribe tu correo. Llega el correo con la liga (vigencia: 24 horas).
2. Abre la liga y cambia la contraseña: entras al panel.
3. Abre otra vez la **misma** liga e intenta cambiarla: el aviso dice en español que la liga ya se usó.
4. Pide dos ligas seguidas y abre la primera: el aviso dice que se pidió otra más nueva.
5. En el portal, `/portal/olvide` → correo → liga: escribe dos contraseñas distintas y verás el aviso; con dos iguales, entras.

## Base de datos y variables

Sin migración ni variables nuevas.

## Verificación hecha

- `npx tsc --noEmit` y `npm run build` sin errores; `npm run lint` con 0 errores.
- Pruebas sobre Postgres local vacío (con `npm run start`, es decir, código minificado como en producción):
  - `test:clinica` **214/214**, con pruebas nuevas: liga usada → 403 con mensaje en español; liga inexistente en `users` y `tutores` → 403; contraseña corta → 400; vigencia de 24 h.
  - `test:estetica` 90/90.
- En el navegador (Playwright, 390 px):
  - el panel muestra el aviso en español con una liga inválida;
  - el portal avisa cuando las contraseñas no coinciden y muestra el mensaje del servidor.

## Riesgos y pendientes

- Las ligas que ya se mandaron antes del despliegue siguen con su vigencia de 1 hora.
- Si alguien no puede entrar, el superadmin puede ponerle una contraseña temporal en **Sistema → Usuarios** y pedirle que la cambie al entrar.

## Documentación actualizada

- `CLAUDE.md`: errores públicos, reglas de restablecer contraseña y número de pruebas.
- Este archivo.
