# Deployment

Use `kapi.run` for the landing page, `app.kapi.run` for the user app, and
`api.kapi.run` for the API.

## Dokploy

Deploy `compose.dokploy.yml` as one compose app.

Domains in Dokploy:

| Host | Service | Port |
| --- | --- | --- |
| `app.kapi.run` | `web` | `80` |
| `api.kapi.run` | `api` | `3001` |
| `app-kapi.jha.sh` | `web` | `80` |
| `api-kapi.jha.sh` | `api` | `3001` |

Environment:

```env
VITE_KAPI_API_URL=https://api.kapi.run
KAPI_WEB_URL=https://app.kapi.run
SWIGGY_REDIRECT_URI=https://api.kapi.run/auth/callback
```

The API persists Swiggy OAuth and encrypted relay files in the
`kapi_api_data` Docker volume.

## Cloudflare

`kapi.run` already maps to the existing `kapi-run` Cloudflare Pages landing
project.

`app.kapi.run` and `api.kapi.run` are proxied by
`infra/cloudflare/kapi-edge-proxy`. The worker forwards them to
`app-kapi.jha.sh` and `api-kapi.jha.sh`, which are covered by the existing OVH
Cloudflare Tunnel wildcard for `*.jha.sh`.
