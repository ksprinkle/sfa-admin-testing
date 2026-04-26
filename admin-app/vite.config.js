import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

function getGitShortHash() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'nogit'
  }
}

const appVersion = process.env.npm_package_version || pkg.version || '0.0.0'
const gitShortHash = getGitShortHash()
const buildId = `v${appVersion}-${gitShortHash}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
