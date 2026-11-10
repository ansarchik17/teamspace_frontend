import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const EPS_TARGET = 'http://92.38.49.156:5173'
const WORKSPACE_API_TARGET = loadEnv('development', process.cwd(), '').VITE_API_PROXY_TARGET ?? 'https://teamspace.kz'

const epsProxy = {
  target: EPS_TARGET,
  changeOrigin: true,
  secure: false,
}

const workspaceProxy = {
  target: WORKSPACE_API_TARGET,
  changeOrigin: true,
  secure: true,
  ws: true,
}

/** EPS bundle hardcodes `/api` and `/eps.svg` вЂ” patch at runtime before bundle loads. */
const EPS_RUNTIME_PATCH = `<script>(function(){function g(v){return v==="/eps.svg"?"/web/eps-remote/eps.svg":v}var f=window.fetch.bind(window);window.fetch=function(i,n){var u=typeof i==="string"?i:i instanceof URL?i.href:i.url;try{var p=u.startsWith("http")?new URL(u).pathname:u;if(p.indexOf("/api/")===0||p==="/api"){var r="/web/eps-remote"+p+(u.startsWith("http")?new URL(u).search:"");if(typeof i==="string")return f(r,n);if(i instanceof Request)return f(new Request(r,i),n);return f(r,n)}}catch(e){}return f(i,n)};var s=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(n==="src")v=g(v);return s.call(this,n,v)};var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");d&&d.set&&Object.defineProperty(HTMLImageElement.prototype,"src",{get:d.get,set:function(v){d.set.call(this,g(v))},configurable:!0,enumerable:d.enumerable})})();</script>`

/** EPS bundle hardcodes `/api` and `/eps.svg` вЂ” rewrite for same-origin proxy path. */
function patchEpsBundle(source: string): string {
  return source
    .replace(/d=`\/api`/g, 'd=`/web/eps-remote/api`')
    .replace(/src:`\/eps\.svg`/g, 'src:`/web/eps-remote/eps.svg`')
}

// https://vite.dev/config/
export default defineConfig({
  base: '/web/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['mermaid'],
  },
  build: {
    rolldownOptions: {
      output: {
        // Manual vendor groups can otherwise execute a React CJS wrapper before
        // its dependency is initialized, producing a blank production page.
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'mermaid-vendor',
              test: /node_modules[\\/](?:mermaid|@mermaid-js)[\\/]/,
              priority: 20,
            },
            {
              name: 'large-vendor',
              test: /node_modules[\\/]/,
              minSize: 20_000,
              maxSize: 800_000,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/iform-app/': { target: process.env.VITE_IFORM_PROXY_TARGET || 'http://127.0.0.1:5188', changeOrigin: true },
      // EPS mail app API (hardcoded as /api/* in EPS bundle вЂ” must be before workspace /api)
      '^/api/(auth|emails|mailboxes|calendar|contacts|ai)(?:/|$)': epsProxy,
      // EPS static assets (index.html references /assets/* and /eps.svg from root)
      '/eps.svg': epsProxy,
      '/assets': epsProxy,
      '/web/eps-remote/assets': {
        ...epsProxy,
        rewrite: (path) => path.replace(/^\/web\/eps-remote\/assets/, '/assets'),
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const contentType = proxyRes.headers['content-type'] || ''
            if (!contentType.includes('javascript')) {
              res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
              proxyRes.pipe(res)
              return
            }

            const chunks: Buffer[] = []
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
            proxyRes.on('end', () => {
              const body = patchEpsBundle(Buffer.concat(chunks).toString('utf8'))
              const headers = { ...proxyRes.headers }
              delete headers['content-length']
              delete headers['content-encoding']
              res.writeHead(proxyRes.statusCode || 200, headers)
              res.end(body)
            })
          })
        },
      },
      '/web/eps-remote': {
        ...epsProxy,
        rewrite: (path) => path.replace(/^\/web\/eps-remote/, ''),
        cookieDomainRewrite: '',
        cookiePathRewrite: '/',
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const contentType = proxyRes.headers['content-type'] || ''
            if (!contentType.includes('text/html')) {
              res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
              proxyRes.pipe(res)
              return
            }

            const chunks: Buffer[] = []
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
            proxyRes.on('end', () => {
              let html = Buffer.concat(chunks).toString('utf8')
              html = html
                .replace(/src="\/assets\//g, 'src="/web/eps-remote/assets/')
                .replace(/href="\/assets\//g, 'href="/web/eps-remote/assets/')
                .replace(/href="\/eps\.svg"/g, 'href="/web/eps-remote/eps.svg"')
                .replace('<script type="module"', `${EPS_RUNTIME_PATCH}<script type="module"`)

              const headers = { ...proxyRes.headers }
              delete headers['content-length']
              delete headers['content-encoding']
              res.writeHead(proxyRes.statusCode || 200, headers)
              res.end(html)
            })
          })
        },
      },
      '/v1/chat': {
        ...workspaceProxy,
      },
      '/v1/chats': {
        ...workspaceProxy,
      },
      '/growy/api': {
        ...workspaceProxy,
      },
      '/whiteboard': {
        ...workspaceProxy,
      },
      // ODO is a separate app mounted outside the Workspace /web/ base.
      // Keep its document routes, assets and API on the same local origin.
      '/odo': {
        ...workspaceProxy,
        cookieDomainRewrite: '',
      },
      // SuperApp main backend
      '^/api/(ask|tools)(?:/|$)': {
        target: process.env.VITE_AI_PROXY_TARGET || 'http://127.0.0.1:18002',
        changeOrigin: false,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api': {
        ...workspaceProxy,
      },
    },
  },
})

