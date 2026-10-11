import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Escuta na rede local para abrir pelo celular (http://<ip-do-pc>:5173)
    host: true,
    // O front chama /api no próprio Vite, que repassa para o back. Assim o
    // celular não tenta acessar "localhost:8080", que seria ele mesmo.
    proxy: {
      '/api': process.env.BACK_URL ?? 'http://localhost:8080',
    },
  },
})
