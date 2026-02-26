import * as migration_20260226_170151 from './20260226_170151';

export const migrations = [
  {
    up: migration_20260226_170151.up,
    down: migration_20260226_170151.down,
    name: '20260226_170151'
  },
];
