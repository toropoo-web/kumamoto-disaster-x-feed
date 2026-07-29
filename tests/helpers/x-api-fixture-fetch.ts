import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/x-api"
);
type FixtureRoute = {
  match: RegExp;
  file: string;
  status?: number;
  headers?: Record<string, string>;
};

const routes: FixtureRoute[] = [
  {
    match: /\/users\/by\/username\//,
    file: "user-lookup-success.json",
  },
  {
    match: /\/users\/999404\/tweets/,
    file: "error-404.json",
    status: 404,
  },
  {
    match: /\/users\/999401\/tweets/,
    file: "error-401.json",
    status: 401,
  },
  {
    match: /\/users\/999429\/tweets/,
    file: "error-429.json",
    status: 429,
    headers: { "x-rate-limit-reset": "1893456000" },
  },
  {
    match: /pagination_token=page2token/,
    file: "user-posts-pagination-page2.json",
  },
  {
    match: /\/users\/888001\/tweets/,
    file: "user-posts-pagination-page1.json",
  },
  {
    match: /\/users\/888002\/tweets/,
    file: "user-posts-media.json",
  },
  {
    match: /since_id=1000/,
    file: "user-posts-empty.json",
  },
  {
    match: /\/users\/\d+\/tweets/,
    file: "user-posts-success.json",
  },
];

let serverErrorAttempts = 0;

export function createFixtureFetch(): typeof fetch {
  return async (input) => {
    const url = typeof input === "string" ? input : input.url;

    if (url.includes("/users/999500/tweets")) {
      serverErrorAttempts += 1;
      if (serverErrorAttempts <= 2) {
        const body = fs.readFileSync(
          path.join(FIXTURE_DIR, "error-500.json"),
          "utf-8"
        );
        return new Response(body, { status: 500 });
      }
    }

    const route = routes.find((item) => item.match.test(url));
    const file = route?.file ?? "user-posts-empty.json";
    const status = route?.status ?? 200;
    const body = fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8");
    return new Response(body, {
      status,
      headers: {
        "content-type": "application/json",
        ...(route?.headers ?? {}),
      },
    });
  };
}

export function resetFixtureCounters(): void {
  serverErrorAttempts = 0;
}

export function loadFixture<T>(name: string): T {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, name), "utf-8");
  return JSON.parse(raw) as T;
}
