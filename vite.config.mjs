import { defineConfig } from 'vite';

// base: './' → asset con path relativi, necessario per Capacitor (file://) e
// per l'apertura da sottocartelle. outDir 'dist' è ciò che Capacitor impacchetta.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2019',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    host: true, // raggiungibile da altri device in LAN per test su telefono
  },
});
