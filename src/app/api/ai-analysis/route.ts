/**
 * AI Analysis API route — proxies to Anthropic Claude (or OpenAI).
 * Returns a streaming text response.
 */

import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface RequestBody {
  query: string;
  context: string;
  history: { role: "user" | "assistant"; content: string }[];
}

const SYSTEM_PROMPT = `You are an expert quantitative trading analyst specializing in IMC Prosperity competition strategies.

You have access to parsed trading log data including:
- Order book microstructure (bid/ask prices, sizes, OFI)
- Trade history with buyer/seller classification
- Cumulative PnL series
- Performance metrics (Sharpe, Sortino, drawdown, win rate)
- Strategy comparison deltas

When analyzing logs:
1. Be precise about timestamps (T=XXXXX format)
2. Identify specific patterns: market-making vs taking, inventory buildup, spread capture
3. Quantify claims: "PnL dropped X at T=Y because Z"
4. Suggest concrete parameter improvements
5. Flag abnormal behavior: unusual BOT patterns, unexpected drawdowns
6. Reference the specific metrics provided in context

Format responses with clear sections using markdown. Be concise but thorough.`;

export async function POST(req: NextRequest) {
  const body: RequestBody = await req.json();
  const { query, context, history } = body;

  if (!query?.trim()) {
    return new Response("Query required", { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    return streamAnthropic(query, context, history, apiKey);
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    return streamOpenAI(query, context, history, openAiKey);
  }

  // No API key — return helpful message
  return new Response(
    `No API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local\n\n` +
    `Based on the context provided:\n\n` +
    `**Query:** ${query}\n\n` +
    `**Available Metrics Summary:**\n${context.split("\n").slice(0, 20).join("\n")}`,
    {
      headers: { "Content-Type": "text/plain" },
    }
  );
}

async function streamAnthropic(
  query: string,
  context: string,
  history: { role: "user" | "assistant"; content: string }[],
  apiKey: string
): Promise<Response> {
  const messages = [
    ...history,
    {
      role: "user" as const,
      content: `${context}\n\n---\n\n${query}`,
    },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "messages-2023-12-15",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(`Anthropic API error: ${err}`, { status: res.status });
  }

  // Stream SSE → plain text
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]" || !data) continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              controller.enqueue(encoder.encode(parsed.delta.text));
            }
          } catch {}
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function streamOpenAI(
  query: string,
  context: string,
  history: { role: "user" | "assistant"; content: string }[],
  apiKey: string
): Promise<Response> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history,
    {
      role: "user" as const,
      content: `${context}\n\n---\n\n${query}`,
    },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      stream: true,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(`OpenAI API error: ${err}`, { status: res.status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          } catch {}
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
