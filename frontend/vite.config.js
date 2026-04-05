import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certPath = path.resolve(__dirname, '../.cert/cert.pem')
const keyPath = path.resolve(__dirname, '../.cert/key.pem')

export default defineConfig({
  envDir: '../',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/lightweight-charts')) {
            return 'chart';
          }
          if (id.includes('node_modules/reactflow') || id.includes('node_modules/@reactflow')) {
            return 'flow';
          }
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: fs.existsSync(certPath) && fs.existsSync(keyPath)
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        }
      : false,
  },
})
