import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const certPath = path.resolve(__dirname, '../.cert/cert.pem')
const keyPath = path.resolve(__dirname, '../.cert/key.pem')

export default defineConfig({
  envDir: '../',
  plugins: [
    react(),
    tailwindcss(),
  ],
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