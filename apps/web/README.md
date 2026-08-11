# Kapi Web

The production web app uses HTML, CSS, browser APIs, and Oat.

## Commands

```sh
bun run --cwd apps/web dev
bun run --cwd apps/web build
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web test:routing
```

The development server uses `http://localhost:3000`.

Application routes use canonical directory URLs such as `/new/`. Clean paths
redirect to their canonical URL in development, preview, and Cloudflare Workers.

## Rules

- Use real HTML documents for routes.
- Use Oat CSS before Kapi theme and page CSS.
- Prefer native elements and current browser APIs.
- Keep production runtime dependencies limited to Oat.
- Keep remote strings out of `innerHTML`.
- Preserve current copy, behavior, colors, typography, spacing, and geometry.

## Page status

- `/`: implemented and compared.
- `/new`: implemented and compared.
- `/join`: implemented and compared.
- `/menu`: implemented and compared.
- `/review`: implemented and compared.
