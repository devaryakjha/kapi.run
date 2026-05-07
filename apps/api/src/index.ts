import { Elysia } from "elysia";

const port = Number(process.env.PORT ?? 3001);

const app = new Elysia()
  .get("/", () => ({ name: "kapi.run", status: "ok", version: "2" }))
  .get("/health", () => ({ status: "ok" }))
  .listen(port);

console.log(`Kapi API running at http://${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
