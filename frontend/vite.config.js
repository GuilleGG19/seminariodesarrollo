import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo, /api se reenvia al backend: el navegador ve un solo origen,
// asi la cookie httpOnly de sesion funciona sin configurar CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true },
    },
  },
});
