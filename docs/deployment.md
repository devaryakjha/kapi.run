# Deployment

Use `kapi.run` for the web app and its public API routes.

Keep the web and API as separate containers. Route them through one origin.

## Dokploy

Deploy `compose.dokploy.yml` as one compose app.

Domains in Dokploy:

Add these routes in order. Do not strip the path.

| Host | Path | Service | Port |
| --- | --- | --- | --- |
| `kapi.run` | `/auth` | `api` | `3001` |
| `kapi.run` | `/food` | `api` | `3001` |
| `kapi.run` | `/relay` | `api` | `3001` |
| `kapi.run` | `/` | `web` | `80` |

Environment:

```env
VITE_KAPI_API_URL=https://kapi.run
KAPI_WEB_URL=https://kapi.run
SWIGGY_REDIRECT_URI=https://kapi.run/auth/callback
```

The API persists Swiggy OAuth and encrypted relay files in the
`kapi_api_data` Docker volume.

## Cloudflare

Map `kapi.run` to the existing Cloudflare Tunnel.

The tunnel fallback sends traffic to the Dokploy proxy on port `80`:

```yaml
ingress:
  - hostname: code.karya.run
    service: http://100.112.94.100:8080
  - service: http://127.0.0.1:80
```

Do not attach `kapi.run` to Cloudflare Pages or the old edge proxy Worker.
