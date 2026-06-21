# Deployment

Use `kapi.run` for the landing page, `app.kapi.run` for the user app, and
`api.kapi.run` for the API.

## Dokploy

Deploy `compose.dokploy.yml` as one compose app.

Domains:

| Host | Service | Port |
| --- | --- | --- |
| `app.kapi.run` | `web` | `80` |
| `api.kapi.run` | `api` | `3001` |

Environment:

```env
VITE_KAPI_API_URL=https://api.kapi.run
KAPI_WEB_URL=https://app.kapi.run
SWIGGY_REDIRECT_URI=https://api.kapi.run/auth/callback
```

The API persists Swiggy OAuth and encrypted relay files in the
`kapi_api_data` Docker volume.

## Cloudflare

Create DNS records for `app.kapi.run` and `api.kapi.run` pointing at the
Dokploy ingress target, then keep them proxied. The configured Dokploy profile
currently points at `dokploy.jha.sh`, so use that as the CNAME target unless the
Dokploy UI shows a newer ingress hostname.

`kapi.run` already maps to the existing `kapi-run` Cloudflare Pages landing
project.
