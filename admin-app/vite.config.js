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
export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build'
  const isRenderBuild = isBuild && mode === 'render'

  return {
    // Render serves the app at the domain root and expects output in dist/.
    // GitHub Pages serves from /sfa-admin-testing/ and publishes from ../docs/.
    base: isRenderBuild ? '/' : isBuild ? '/sfa-admin-testing/' : '/',

    build: {
      outDir: isRenderBuild ? 'dist' : '../docs',
      emptyOutDir: true,
      assetsDir: 'assets',
      rollupOptions: {
        output: {
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
  }
})
