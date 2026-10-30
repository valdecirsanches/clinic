import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // O mesmo comportamento do servidor principal: o proxy pode encaminhar
    // clinic.sky9.com.br ou outros hosts públicos válidos.
    allowedHosts: true,
    // 🛡️ Ignora pastas pesadas para evitar ENOSPC (limite de watchers do Linux)
    watch: {
      ignored: ['**/server/uploads/**', '**/node_modules/**', '**/.git/**', '**/data/**']
    }
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true
  }
});