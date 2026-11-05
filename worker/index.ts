/**
 * Worker for the shared web build: serves `dist/` and proxies `/api/*` to Kovan's
 * Dev Solver API (read-only), so the browser needs no CORS and never sees the
 * solver key. Accepts `/api/<route>` and `/api/dev-solver/<route>`.
 */
interface Env {
  SOLVER_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/(dev-solver\/)?/, "");
    if (route.endsWith("/generate")) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers({ "x-solver-key": env.SOLVER_KEY });
    const range = request.headers.get("range");
    if (range) headers.set("range", range);

    return fetch(
      `https://kovanacademy.com/api/dev-solver/${route}${url.search}`,
      { method: request.method, headers },
    );
  },
};
