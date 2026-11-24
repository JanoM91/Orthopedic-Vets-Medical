import * as migration_20261011_205557_inicial from './20261011_205557_inicial';
import * as migration_20261011_210000_rls_supabase from './20261011_210000_rls_supabase';
import * as migration_20261020_170838_clinica_pacientes from './20261020_170838_clinica_pacientes';
import * as migration_20261021_155111_agenda_citas from './20261021_155111_agenda_citas';
import * as migration_20261021_184402_sitio_publico from './20261021_184402_sitio_publico';
import * as migration_20261025_221652_farmacia_base from './20261025_221652_farmacia_base';
import * as migration_20261026_152714_farmacia_compras from './20261026_152714_farmacia_compras';
import * as migration_20261027_053609_farmacia_ventas from './20261027_053609_farmacia_ventas';
import * as migration_20261027_144827_farmacia_alertas from './20261027_144827_farmacia_alertas';
import * as migration_20261027_154211_clinica_avisos from './20261027_154211_clinica_avisos';
import * as migration_20261112_055949_clinica_fotos_iconos from './20261112_055949_clinica_fotos_iconos';
import * as migration_20261113_053734_farmacia_tienda_pedidos from './20261113_053734_farmacia_tienda_pedidos';
import * as migration_20261113_185522_farmacia_domicilio_mercadopago from './20261113_185522_farmacia_domicilio_mercadopago';
import * as migration_20261115_035641_farmacia_recompra from './20261115_035641_farmacia_recompra';
import * as migration_20261115_041426_farmacia_planes from './20261115_041426_farmacia_planes';
import * as migration_20261116_040643_estetica_precios from './20261116_040643_estetica_precios';
import * as migration_20261116_041602_estetica_tablero from './20261116_041602_estetica_tablero';
import * as migration_20261116_042227_estetica_portal from './20261116_042227_estetica_portal';
import * as migration_20261116_150807_sitio_home_b from './20261116_150807_sitio_home_b';
import * as migration_20261116_160019_solicitudes_cita from './20261116_160019_solicitudes_cita';
import * as migration_20261121_205724_paquetes from './20261121_205724_paquetes';
import * as migration_20261121_235641_cirugia_presupuesto from './20261121_235641_cirugia_presupuesto';
import * as migration_20261122_041118_cirugia_hoja from './20261122_041118_cirugia_hoja';
import * as migration_20261123_001039_hospital from './20261123_001039_hospital';
import * as migration_20261123_190050_rehabilitacion from './20261123_190050_rehabilitacion';

export const migrations = [
  {
    up: migration_20261011_205557_inicial.up,
    down: migration_20261011_205557_inicial.down,
    name: '20261011_205557_inicial',
  },
  {
    up: migration_20261011_210000_rls_supabase.up,
    down: migration_20261011_210000_rls_supabase.down,
    name: '20261011_210000_rls_supabase',
  },
  {
    up: migration_20261020_170838_clinica_pacientes.up,
    down: migration_20261020_170838_clinica_pacientes.down,
    name: '20261020_170838_clinica_pacientes',
  },
  {
    up: migration_20261021_155111_agenda_citas.up,
    down: migration_20261021_155111_agenda_citas.down,
    name: '20261021_155111_agenda_citas',
  },
  {
    up: migration_20261021_184402_sitio_publico.up,
    down: migration_20261021_184402_sitio_publico.down,
    name: '20261021_184402_sitio_publico',
  },
  {
    up: migration_20261025_221652_farmacia_base.up,
    down: migration_20261025_221652_farmacia_base.down,
    name: '20261025_221652_farmacia_base',
  },
  {
    up: migration_20261026_152714_farmacia_compras.up,
    down: migration_20261026_152714_farmacia_compras.down,
    name: '20261026_152714_farmacia_compras',
  },
  {
    up: migration_20261027_053609_farmacia_ventas.up,
    down: migration_20261027_053609_farmacia_ventas.down,
    name: '20261027_053609_farmacia_ventas',
  },
  {
    up: migration_20261027_144827_farmacia_alertas.up,
    down: migration_20261027_144827_farmacia_alertas.down,
    name: '20261027_144827_farmacia_alertas',
  },
  {
    up: migration_20261027_154211_clinica_avisos.up,
    down: migration_20261027_154211_clinica_avisos.down,
    name: '20261027_154211_clinica_avisos',
  },
  {
    up: migration_20261112_055949_clinica_fotos_iconos.up,
    down: migration_20261112_055949_clinica_fotos_iconos.down,
    name: '20261112_055949_clinica_fotos_iconos',
  },
  {
    up: migration_20261113_053734_farmacia_tienda_pedidos.up,
    down: migration_20261113_053734_farmacia_tienda_pedidos.down,
    name: '20261113_053734_farmacia_tienda_pedidos',
  },
  {
    up: migration_20261113_185522_farmacia_domicilio_mercadopago.up,
    down: migration_20261113_185522_farmacia_domicilio_mercadopago.down,
    name: '20261113_185522_farmacia_domicilio_mercadopago',
  },
  {
    up: migration_20261115_035641_farmacia_recompra.up,
    down: migration_20261115_035641_farmacia_recompra.down,
    name: '20261115_035641_farmacia_recompra',
  },
  {
    up: migration_20261115_041426_farmacia_planes.up,
    down: migration_20261115_041426_farmacia_planes.down,
    name: '20261115_041426_farmacia_planes',
  },
  {
    up: migration_20261116_040643_estetica_precios.up,
    down: migration_20261116_040643_estetica_precios.down,
    name: '20261116_040643_estetica_precios',
  },
  {
    up: migration_20261116_041602_estetica_tablero.up,
    down: migration_20261116_041602_estetica_tablero.down,
    name: '20261116_041602_estetica_tablero',
  },
  {
    up: migration_20261116_042227_estetica_portal.up,
    down: migration_20261116_042227_estetica_portal.down,
    name: '20261116_042227_estetica_portal',
  },
  {
    up: migration_20261116_150807_sitio_home_b.up,
    down: migration_20261116_150807_sitio_home_b.down,
    name: '20261116_150807_sitio_home_b',
  },
  {
    up: migration_20261116_160019_solicitudes_cita.up,
    down: migration_20261116_160019_solicitudes_cita.down,
    name: '20261116_160019_solicitudes_cita',
  },
  {
    up: migration_20261121_205724_paquetes.up,
    down: migration_20261121_205724_paquetes.down,
    name: '20261121_205724_paquetes',
  },
  {
    up: migration_20261121_235641_cirugia_presupuesto.up,
    down: migration_20261121_235641_cirugia_presupuesto.down,
    name: '20261121_235641_cirugia_presupuesto',
  },
  {
    up: migration_20261122_041118_cirugia_hoja.up,
    down: migration_20261122_041118_cirugia_hoja.down,
    name: '20261122_041118_cirugia_hoja',
  },
  {
    up: migration_20261123_001039_hospital.up,
    down: migration_20261123_001039_hospital.down,
    name: '20261123_001039_hospital',
  },
  {
    up: migration_20261123_190050_rehabilitacion.up,
    down: migration_20261123_190050_rehabilitacion.down,
    name: '20261123_190050_rehabilitacion'
  },
];
