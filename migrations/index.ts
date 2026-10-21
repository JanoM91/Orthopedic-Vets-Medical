import * as migration_20261011_205557_inicial from './20261011_205557_inicial';
import * as migration_20261011_210000_rls_supabase from './20261011_210000_rls_supabase';
import * as migration_20261020_170838_clinica_pacientes from './20261020_170838_clinica_pacientes';
import * as migration_20261021_155111_agenda_citas from './20261021_155111_agenda_citas';

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
    name: '20261021_155111_agenda_citas'
  },
];
