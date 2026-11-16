import { existsSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, normalizePath, type Plugin } from 'vite'

function localApiFunctions(): Plugin {
  return {
    name: 'ilume-local-api-functions',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        let requestUrl: URL
        try {
          requestUrl = new URL(req.url || '/', 'http://localhost')
        } catch {
          next()
          return
        }

        if (!requestUrl.pathname.startsWith('/api/')) {
          next()
          return
        }

        const route = requestUrl.pathname.slice(1)
        if (!/^api\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(route)) {
          next()
          return
        }

        const apiRoot = path.resolve(process.cwd(), 'api')
        const handlerPath = path.resolve(process.cwd(), `${route}.ts`)
        if (!handlerPath.startsWith(`${apiRoot}${path.sep}`) || !existsSync(handlerPath)) {
          next()
          return
        }

        const localResponse = res as typeof res & {
          status: (code: number) => typeof res
          json: (body: unknown) => typeof res
          send: (body: unknown) => typeof res
        }
        localResponse.status = (code) => {
          res.statusCode = code
          return res
        }
        localResponse.json = (body) => {
          if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
          return res
        }
        localResponse.send = (body) => {
          res.end(typeof body === 'string' ? body : JSON.stringify(body))
          return res
        }

        const apiRequest = req as typeof req & {
          query: Record<string, string | string[]>
          body?: unknown
        }
        apiRequest.query = {}
        requestUrl.searchParams.forEach((value, key) => {
          const current = apiRequest.query[key]
          apiRequest.query[key] = current === undefined
            ? value
            : Array.isArray(current) ? [...current, value] : [current, value]
        })

        try {
          const contentType = String(req.headers['content-type'] || '').toLowerCase()
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
            const chunks: Buffer[] = []
            let size = 0
            for await (const chunk of req) {
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
              size += buffer.length
              if (size > 1_048_576) {
                res.statusCode = 413
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(JSON.stringify({ success: false, error: 'Corpo da requisição excede o limite local.' }))
                return
              }
              chunks.push(buffer)
            }

            const bodyText = Buffer.concat(chunks).toString('utf8')
            if (bodyText) {
              if (contentType.includes('application/json')) {
                try {
                  apiRequest.body = JSON.parse(bodyText)
                } catch {
                  res.statusCode = 400
                  res.setHeader('Content-Type', 'application/json; charset=utf-8')
                  res.end(JSON.stringify({ success: false, error: 'Corpo JSON inválido.' }))
                  return
                }
              } else {
                apiRequest.body = bodyText
              }
            }
          }

          const module = await server.ssrLoadModule(normalizePath(handlerPath))
          if (typeof module.default !== 'function') {
            res.statusCode = 500
            localResponse.json({ success: false, error: 'A função API não possui um handler padrão válido.' })
            return
          }

          await module.default(apiRequest, localResponse)
          if (!res.writableEnded) res.end()
        } catch (error) {
          server.ssrFixStacktrace(error as Error)
          console.error(`[Local API] Falha ao executar ${requestUrl.pathname}:`, error)
          if (!res.headersSent) {
            res.statusCode = 500
            localResponse.json({ success: false, error: 'Falha interna ao executar a API local.' })
          } else if (!res.writableEnded) {
            res.end()
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode, command }) => {
  // Local .env values are made available to Node handlers only; Vite still exposes
  // client variables exclusively according to its VITE_ prefix rules.
  if (command === 'serve') {
    const serverEnvironment = loadEnv(mode, process.cwd(), '')
    for (const [key, value] of Object.entries(serverEnvironment)) {
      if (process.env[key] === undefined) process.env[key] = value
    }
  }

  return {
    plugins: [react(), localApiFunctions()],
  }
})
