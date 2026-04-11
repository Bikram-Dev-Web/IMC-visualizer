"use client";
/**
 * AIAnalysis — natural language log analysis powered by Claude.
 * Builds a structured context from the parsed logs and sends it to the API.
 */

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useVisualizerStore,
  selectMetricsA,
  selectMetricsB,
  selectDeltaMetrics,
  selectProduct,
} from "@/lib/store/useVisualizerStore";
import type { AIChatMessage } from "@/types";

const QUICK_QUERIES = [
  "Why did PnL drop? List the timestamps and likely causes.",
  "Compare the strategies: which is better and why?",
  "What patterns suggest the bot is market-making vs. taking?",
  "Where is the maximum alpha? When does it decay?",
  "Identify any suspicious bot behavior in the trade history.",
];

function buildContext(
  metricsA: ReturnType<typeof selectMetricsA>,
  metricsB: ReturnType<typeof selectMetricsB>,
  delta: ReturnType<typeof selectDeltaMetrics>,
  product: string,
  logA: ReturnType<(s: import("@/lib/store/useVisualizerStore").VisualizerStore) => typeof s.logA>,
  logB: typeof logA
): string {
  const lines: string[] = ["# IMC Prosperity Trading Log Analysis Context\n"];

  lines.push(`## Selected Product: ${product || "None"}`);

  if (metricsA) {
    lines.push(`\n## Strategy A Metrics`);
    lines.push(`- Total PnL: ${metricsA.totalPnL.toFixed(2)}`);
    lines.push(`- Max Drawdown: ${metricsA.maxDrawdown.toFixed(2)}`);
    lines.push(`- Win Rate: ${(metricsA.winRate * 100).toFixed(1)}%`);
    lines.push(`- Total Trades: ${metricsA.totalTrades}`);
    lines.push(`- Sharpe: ${metricsA.sharpeRatio.toFixed(3)}`);
    lines.push(`- Sortino: ${metricsA.sortinoRatio.toFixed(3)}`);
    lines.push(`- Profit Factor: ${isFinite(metricsA.profitFactor) ? metricsA.profitFactor.toFixed(2) : "∞"}`);
    lines.push(`- Participation Rate: ${(metricsA.participationRate * 100).toFixed(1)}%`);
    if (metricsA.maxDrawdownStart) {
      lines.push(`- Drawdown period: T${Math.round(metricsA.maxDrawdownStart)} → T${Math.round(metricsA.maxDrawdownEnd)}`);
    }
  }

  if (metricsB) {
    lines.push(`\n## Strategy B Metrics`);
    lines.push(`- Total PnL: ${metricsB.totalPnL.toFixed(2)}`);
    lines.push(`- Max Drawdown: ${metricsB.maxDrawdown.toFixed(2)}`);
    lines.push(`- Win Rate: ${(metricsB.winRate * 100).toFixed(1)}%`);
    lines.push(`- Total Trades: ${metricsB.totalTrades}`);
    lines.push(`- Sharpe: ${metricsB.sharpeRatio.toFixed(3)}`);
    lines.push(`- Sortino: ${metricsB.sortinoRatio.toFixed(3)}`);
  }

  if (delta) {
    lines.push(`\n## Delta (A - B)`);
    lines.push(`- PnL Delta: ${delta.pnlDelta.toFixed(2)}`);
    lines.push(`- Drawdown Diff: ${delta.drawdownDiff.toFixed(2)}`);
    lines.push(`- Win Rate Diff: ${(delta.winRateDiff * 100).toFixed(1)}%`);
    lines.push(`- Sharpe Diff: ${delta.sharpeDiff.toFixed(3)}`);
  }

  // Sample sandbox logs
  if (logA) {
    const recentLogs = logA.sandboxLogs.slice(-30);
    if (recentLogs.length > 0) {
      lines.push(`\n## Recent Sandbox Logs (last 30)`);
      for (const log of recentLogs) {
        lines.push(`[T${log.timestamp}] ${log.product}: ${log.message}`);
      }
    }
    lines.push(`\n## Data Info`);
    lines.push(`- File: ${logA.fileName}`);
    lines.push(`- Products: ${logA.products.join(", ")}`);
    lines.push(`- Days: ${logA.days.join(", ")}`);
    lines.push(`- Rows: ${logA.rowCount.toLocaleString()}`);
  }

  return lines.join("\n");
}

export function AIAnalysis() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const metricsA = useVisualizerStore(selectMetricsA);
  const metricsB = useVisualizerStore(selectMetricsB);
  const delta = useVisualizerStore(selectDeltaMetrics);
  const product = useVisualizerStore(selectProduct);
  const logA = useVisualizerStore((s) => s.logA);
  const logB = useVisualizerStore((s) => s.logB);
  const chatHistory = useVisualizerStore((s) => s.aiChatHistory);
  const { addAIMessage, clearAIHistory } = useVisualizerStore();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? query).trim();
    if (!msg || loading) return;

    setQuery("");
    setError(null);

    const userMsg: AIChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: msg,
      timestamp: Date.now(),
    };
    addAIMessage(userMsg);
    setLoading(true);

    try {
      const context = buildContext(metricsA, metricsB, delta, product, logA, logB);

      const response = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: msg,
          context,
          history: chatHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || `HTTP ${response.status}`);
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      const assistantMsg: AIChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
      addAIMessage(assistantMsg);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;
          // Update the last message content
          useVisualizerStore.setState((s) => {
            const hist = [...s.aiChatHistory];
            const last = hist[hist.length - 1];
            if (last && last.role === "assistant") {
              hist[hist.length - 1] = { ...last, content: fullContent };
            }
            return { aiChatHistory: hist };
          });
        }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Unknown error";
      setError(`Analysis failed: ${errorText}`);
      addAIMessage({
        id: `e-${Date.now()}`,
        role: "assistant",
        content: `⚠️ Error: ${errorText}\n\nMake sure ANTHROPIC_API_KEY is set in .env.local`,
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-strat-a" />
          <span className="text-xs font-mono font-semibold text-text-primary">AI Log Analysis</span>
          <Badge variant="stratA">Claude</Badge>
        </div>
        {chatHistory.length > 0 && (
          <Button size="icon" variant="ghost" onClick={clearAIHistory}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Quick queries */}
      {chatHistory.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={loading || !logA}
              className="text-[10px] font-mono px-2 py-1 rounded border border-border text-text-muted
                hover:text-text-primary hover:border-border-accent hover:bg-surface-3
                transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {q.length > 50 ? q.slice(0, 50) + "…" : q}
            </button>
          ))}
        </div>
      )}

      {/* Chat history */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 pr-1"
        style={{ maxHeight: "360px" }}
      >
        <AnimatePresence>
          {chatHistory.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`shrink-0 h-5 w-5 rounded-full flex items-center justify-center
                  ${msg.role === "user" ? "bg-strat-a/20" : "bg-strat-b/20"}`}
              >
                {msg.role === "user"
                  ? <User className="h-3 w-3 text-strat-a" />
                  : <Bot className="h-3 w-3 text-strat-b" />}
              </div>
              <div
                className={`text-[11px] font-mono leading-relaxed px-3 py-2 rounded-lg max-w-[85%]
                  whitespace-pre-wrap break-words
                  ${msg.role === "user"
                    ? "bg-strat-a/10 text-text-primary border border-strat-a/20"
                    : "bg-surface-3 text-text-primary border border-border"}`}
              >
                {msg.content || (loading && chatHistory[chatHistory.length - 1]?.id === msg.id
                  ? <span className="animate-pulse-subtle">Analyzing…</span>
                  : "")}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={logA ? "Ask about the logs… (Enter to send)" : "Upload a log file first"}
          disabled={!logA || loading}
          rows={2}
          className="flex-1 bg-surface-3 border border-border rounded text-xs font-mono text-text-primary
            placeholder:text-text-muted px-3 py-2 resize-none focus:outline-none focus:ring-1
            focus:ring-strat-a disabled:opacity-40 min-h-[52px]"
        />
        <Button
          onClick={() => sendMessage()}
          disabled={!query.trim() || loading || !logA}
          size="icon"
          className="h-[52px] w-10 shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      {error && (
        <p className="text-[10px] text-bear font-mono">{error}</p>
      )}
    </div>
  );
}
