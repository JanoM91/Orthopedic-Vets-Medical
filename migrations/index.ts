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
    name: '20261115_041426_farmacia_planes'
  },
];
