import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/account': 'http://localhost:3000',
      '/catalog': 'http://localhost:3000',
    },
  },
})