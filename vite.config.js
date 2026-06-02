import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'fs';

// Emit the repo-root sw.js verbatim into dist/sw.js. Kept OUT of publicDir
// because publicDir ('data') is the ALN-TokenData submodule — putting sw.js
// there would pollute the shared token submodule (SW-1).
function emitServiceWorker() {
  return {
    name: 'aln-emit-service-worker',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: readFileSync('./sw.js', 'utf8')
      });
    }
  };
}

export default defineConfig({
  root: './', // Project root is current directory
  publicDir: 'data', // Static assets (tokens data)

  // Base path configuration
  // Development: standalone server on port 8443
  // Production (via backend): served at /gm-scanner/
  base: process.env.VITE_BASE_PATH || (process.env.NODE_ENV === 'production' ? '/gm-scanner/' : '/'),

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    emptyOutDir: true,

    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },

  server: {
    // Use different port from backend (3000/8000)
    port: 8443,
    https: true, // Required for NFC API
    open: true,
    host: '0.0.0.0', // Allow network access

    // CORS for backend integration during development
    cors: true,

    // Proxy API requests to backend during development (optional)
    proxy: {
      '/api': {
        target: 'https://localhost:3000',
        secure: false, // Accept self-signed cert
        changeOrigin: true
      }
    }
  },

  plugins: [
    // HTTPS with self-signed certificate (required for NFC API)
    basicSsl(),

    // Emit the runtime service worker into dist/sw.js (publicDir is the token submodule)
    emitServiceWorker(),

    // HTML processing
    createHtmlPlugin({
      minify: true
    })
  ],

  // Resolve configuration
  resolve: {
    alias: {
      '@': '/src',
      '@app': '/src/app',
      '@core': '/src/core',
      '@network': '/src/network',
      '@ui': '/src/ui',
      '@utils': '/src/utils'
    }
  }
});
