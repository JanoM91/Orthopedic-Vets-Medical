# Descripciones de Pull Requests

Cada rama de trabajo deja aquí su descripción de PR en `docs/pr/<rama>.md`
(con `/` cambiado por `-`, p. ej. `feat-ui-a-4-mostrador.md`). Es la misma que
se pega en GitHub al abrir el PR, y queda en el repo para que quien ajuste el
código después (persona o IA) sepa **qué se cambió, por qué, cómo se probó y
qué quedó pendiente** sin depender de la conversación donde se hizo.

## Formato

Mismo orden que `.github/pull_request_template.md`:

1. **Qué cambia**: lo que ve la persona usuaria y los archivos principales.
2. **Por qué**: la decisión de negocio o el pedido (con fecha y quién lo pidió).
3. **Cómo probarlo**: pasos concretos en la vista previa de Vercel.
4. **Base de datos y variables**: migraciones (nombre) y variables nuevas, o «ninguna».
5. **Verificación hecha**: comandos y resultados reales (no lo que «debería» pasar).
6. **Riesgos y pendientes**: lo que no se probó y lo que queda fuera.
7. **Documentación actualizada**: qué archivos de docs cambiaron.

## Cómo se abre el PR

La entrega de cada rama trae una **liga de GitHub ya llena** (título y
descripción): `https://github.com/<dueño>/<repo>/compare/main...<rama>?expand=1&title=…&body=…`.
Se abre después del `git push` y solo falta revisar y tocar «Create pull request».
Si la liga no llena el texto, copia el contenido de `docs/pr/<rama>.md`.

PRs anteriores a esta convención: `docs/pr/HISTORIAL.md`.
