// Workers エントリポイント: app/functions/ の Pages Functions を Workers 上で再利用する。
// 静的アセットはこの Worker の手前で配信される(マッチしたパスはここに来ない)。
import { onRequestGet as weatherGet } from "../app/functions/api/weather.js";
import { onRequestPost as explainPost } from "../app/functions/api/explain.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    // Pages Functions の ctx 互換オブジェクト(request/env/waitUntil のみ使用されている)
    const pf = { request, env, waitUntil: (p) => ctx.waitUntil(p) };
    if (pathname === "/api/weather" && request.method === "GET") return weatherGet(pf);
    if (pathname === "/api/explain" && request.method === "POST") return explainPost(pf);
    return env.ASSETS.fetch(request);
  },
};
