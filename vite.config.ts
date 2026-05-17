import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: path.join(projectRoot, '.env'), quiet: true });
loadDotenv({ path: path.join(projectRoot, '.env.local'), override: true, quiet: true });

function sabaDevApiPlugin(): Plugin {
  return {
    name: 'saba-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { createSabaDevApiMiddleware } = await import('./src/dev-api/middleware.js');
        return createSabaDevApiMiddleware()(req, res, next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sabaDevApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: process.env.CI !== 'true' && process.env.PLAYWRIGHT !== '1',
  },
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
});
