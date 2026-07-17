import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          vexflow: ['vexflow/bravura'],
        },
      },
    },
  },
  server: {
    allowedHosts: ['.ngrok-free.dev'],
    proxy: {
      '/signal': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
    },
  },
  test: {
    environment: 'node',
  },
})
