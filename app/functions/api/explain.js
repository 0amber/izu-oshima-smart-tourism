// Pages Function: POST /api/explain — 旅程JSON → Claudeの解説をSSEで返す
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildExplainPrompt } from "./_lib/prompt.mjs";

const MODEL = "claude-opus-5";

export async function onRequestPost(ctx) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30_000 });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const sse = (s) => writer.write(enc.encode(s));

  ctx.waitUntil((async () => {
    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 2000, // 400〜600字の解説なので意図的に小さく
        output_config: { effort: "low" }, // 短い定型解説。品質不足なら "medium" へ
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildExplainPrompt(body) }],
      });
      stream.on("text", (t) => { sse(`data: ${JSON.stringify(t)}\n\n`); });
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        await sse(`event: fallback\ndata: "refusal"\n\n`);
      }
      await sse(`event: done\ndata: {}\n\n`);
    } catch (e) {
      // SDKが1回リトライ済み。ここに来たらクライアント側テンプレにフォールバック
      await sse(`event: fallback\ndata: ${JSON.stringify(String(e))}\n\n`);
      await sse(`event: done\ndata: {}\n\n`);
    } finally {
      await writer.close();
    }
  })());

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
