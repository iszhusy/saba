/**
 * 将 schema.sql 应用到 wrangler 本地 D1（.wrangler/state/v3/d1）。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = path.join(root, 'src/storage/schema.sql');

const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'saba-db', '--local', `--file=${schema}`],
  { cwd: root, stdio: 'inherit', shell: true },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('[d1] 本地 schema 已应用（saba-db @ .wrangler/state）');
