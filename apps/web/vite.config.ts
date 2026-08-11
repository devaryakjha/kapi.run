import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Connect, Plugin } from 'vite'

const appDirectory = fileURLToPath(new URL('.', import.meta.url))
const cleanRoutes = new Set(['/new', '/join', '/menu', '/review'])

function canonicalRoutes(): Plugin {
  const redirect: Connect.NextHandleFunction = (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://kapi.local')
    if (!cleanRoutes.has(url.pathname)) {
      next()
      return
    }

    response.statusCode = 308
    response.setHeader('location', `${url.pathname}/${url.search}`)
    response.end()
  }

  return {
    name: 'kapi-canonical-routes',
    configureServer(server) {
      server.middlewares.use(redirect)
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect)
    },
  }
}

export default defineConfig({
  appType: 'mpa',
  plugins: [canonicalRoutes()],
  build: {
    rolldownOptions: {
      input: {
        home: resolve(appDirectory, 'index.html'),
        join: resolve(appDirectory, 'join/index.html'),
        menu: resolve(appDirectory, 'menu/index.html'),
        new: resolve(appDirectory, 'new/index.html'),
        review: resolve(appDirectory, 'review/index.html'),
      },
    },
  },
  server: {
    port: 3002,
    strictPort: true,
  },
  preview: {
    port: 3002,
    strictPort: true,
  },
})
