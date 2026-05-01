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
export default defineConfig(({ command }) => ({
  // GitHub Pages deployment: use /sfa-admin-testing/ base path in production,
  // localhost in development. main.jsx uses basename={import.meta.env.BASE_URL}
  // to configure react-router, and package.json deploy script copies index.html→404.html.
  base: command === 'build' ? '/sfa-admin-testing/' : '/',

  build: {
    outDir: 'docs',
    // Ensure assets are versioned for cache busting on GitHub Pages
    assetsDir: 'assets',
    // Optimize chunk splitting for subpath deployment
    rollupOptions: {
      output: {
        // Preserve asset paths relative to base directory
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    minify: 'terser',
    cssMinify: true,
  },

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
}))
