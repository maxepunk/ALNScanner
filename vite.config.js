import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  root: './', // Project root is current directory
  publicDir: 'data', // Static assets (tokens data)

  // Base path configuration
  // Development: standalone server on port 8443
  // Production (via backend): served at /gm-scanner/
  base: process.env.VITE_BASE_PATH || '/',

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
