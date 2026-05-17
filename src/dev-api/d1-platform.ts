/**
 * 本地 D1：通过 wrangler getPlatformProxy 注入与 Workers 相同的 D1_DATABASE binding。
 */
import type { D1Database } from '@cloudflare/workers-types';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LocalD1Env {
  D1_DATABASE: D1Database;
}

let db: D1Database | null = null;
let disposeProxy: (() => void) | null = null;

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export async function getLocalD1Database(): Promise<D1Database> {
  if (db) return db;

  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy<LocalD1Env>({
    configPath: path.join(projectRoot, 'wrangler.toml'),
  });

  db = proxy.env.D1_DATABASE;
  disposeProxy = proxy.dispose;
  return db;
}

export async function disposeLocalD1(): Promise<void> {
  disposeProxy?.();
  disposeProxy = null;
  db = null;
}
