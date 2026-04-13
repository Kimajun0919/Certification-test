import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — changes rarely, long-lived cache
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // QR scanner — largest dependency (~400KB), lazy-loadable
          'vendor-qr-scanner': ['html5-qrcode'],
          // QR code renderer
          'vendor-qr-code': ['qrcode.react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the FastAPI backend during development
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
