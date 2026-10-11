import * as migration_20261011_205557_inicial from './20261011_205557_inicial';
import * as migration_20261011_210000_rls_supabase from './20261011_210000_rls_supabase';

export const migrations = [
  {
    up: migration_20261011_205557_inicial.up,
    down: migration_20261011_205557_inicial.down,
    name: '20261011_205557_inicial'
  },
  {
    up: migration_20261011_210000_rls_supabase.up,
    down: migration_20261011_210000_rls_supabase.down,
    name: '20261011_210000_rls_supabase',
  },
];
