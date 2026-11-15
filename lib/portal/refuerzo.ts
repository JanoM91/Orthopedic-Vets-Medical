/**
 * «Pedir refuerzo» (portal, nov-2026). Puro: arma la liga a «Pedir cita» con la
 * mascota, el servicio de vacunación o desparasitación (por su icono) y la nota
 * «Refuerzo: <producto>». Lo usan la ficha de la mascota y el inicio.
 */
export function servicioDeRefuerzo(tipo: string, servicios: { id: number; icono: string }[]): number | null {
  const quiero = tipo.startsWith('desparasitacion') ? ['desparasitacion', 'vacuna'] : ['vacuna', 'desparasitacion']
  for (const q of quiero) {
    const s = servicios.find((x) => x.icono === q)
    if (s) return s.id
  }
  return null
}

export function ligaRefuerzo(mascotaId: number, x: { tipo: string; producto: string }, servicios: { id: number; icono: string }[]): string {
  const q = new URLSearchParams({ mascota: String(mascotaId), nota: `Refuerzo: ${x.producto}` })
  const sid = servicioDeRefuerzo(x.tipo, servicios)
  if (sid) q.set('servicio', String(sid))
  return `/portal/citas/nueva?${q.toString()}`
}
