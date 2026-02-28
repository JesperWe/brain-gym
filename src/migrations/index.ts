import * as migration_20260226_170151 from './20260226_170151';
import * as migration_20260228_124053 from './20260228_124053';

export const migrations = [
  {
    up: migration_20260226_170151.up,
    down: migration_20260226_170151.down,
    name: '20260226_170151',
  },
  {
    up: migration_20260228_124053.up,
    down: migration_20260228_124053.down,
    name: '20260228_124053'
  },
];
