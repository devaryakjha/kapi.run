# Deployment

Kapi supports any container platform that can run the web and API services.

Use `compose.dokploy.yml` as a starting point. Adapt the service names, network, and storage settings to your platform.

## Environment

Configure these values before the build:

| Variable              | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `VITE_KAPI_API_URL`   | Public API base URL used by the browser app.     |
| `KAPI_WEB_URL`        | Public URL of the browser app.                   |
| `SWIGGY_REDIRECT_URI` | Exact OAuth callback URL registered with Swiggy. |
| `KAPI_DATA_DIR`       | Directory for API data.                          |
| `PORT`                | API listener port. The default is `3001`.        |

Example values:

```env
VITE_KAPI_API_URL=https://api.example.com
KAPI_WEB_URL=https://app.example.com
SWIGGY_REDIRECT_URI=https://api.example.com/auth/callback
KAPI_DATA_DIR=/data
PORT=3001
```

## Requirements

- Serve all public endpoints over HTTPS.
- Keep the OAuth callback URL identical to the registered Swiggy value.
- Keep API data on persistent storage.
- Keep OAuth tokens and runtime data out of source control.
- Restrict direct access to internal service ports.
- Configure the proxy or gateway for your chosen public URL layout.

The web and API can use one origin or separate origins. Set the public URLs to match your deployment.
