import { DurableObject } from "cloudflare:workers";
import { app, hydrateDurableState } from "@kapi/api";

type Env = {
  ASSETS: Fetcher;
  KAPI_API: DurableObjectNamespace<KapiApi>;
};

const apiPrefixes = ["/auth/", "/food/", "/relay/"];
const canonicalRoutes = new Set(["/new", "/join", "/menu", "/review"]);

export class KapiApi extends DurableObject<Env> {
  readonly ready: Promise<void>;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.ready = state.blockConcurrencyWhile(() =>
      hydrateDurableState(state.storage),
    );
  }

  async fetch(request: Request) {
    await this.ready;
    return app.handle(request);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (canonicalRoutes.has(url.pathname)) {
      url.pathname += "/";
      return Response.redirect(url.toString(), 308);
    }

    if (
      url.pathname === "/health" ||
      apiPrefixes.some((prefix) => url.pathname.startsWith(prefix))
    ) {
      const id = env.KAPI_API.idFromName("production-apac-se-v1");
      const startedAt = performance.now();
      const response = await env.KAPI_API
        .get(id, { locationHint: "apac-se" })
        .fetch(request);
      const timedResponse = new Response(response.body, response);
      timedResponse.headers.append(
        "server-timing",
        `durable-object;dur=${(performance.now() - startedAt).toFixed(1)}`,
      );
      return timedResponse;
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
