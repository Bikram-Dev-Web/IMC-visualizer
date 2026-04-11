"use client";
/**
 * LogUploader — drag-and-drop + click-to-browse file uploader.
 * Launches the Web Worker for parsing and updates store state.
 */

import React, { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, CheckCircle, AlertCircle, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVisualizerStore } from "@/lib/store/useVisualizerStore";
import type { WorkerResponse } from "@/types";

interface UploaderProps {
  strategyId: "A" | "B";
}

export function LogUploader({ strategyId }: UploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [dragging, setDragging] = useState(false);

  const loadState = useVisualizerStore((s) =>
    strategyId === "A" ? s.loadStateA : s.loadStateB
  );
  const progress = useVisualizerStore((s) =>
    strategyId === "A" ? s.parseProgressA : s.parseProgressB
  );
  const logFile = useVisualizerStore((s) =>
    strategyId === "A" ? s.logA : s.logB
  );

  const {
    setLoadStateA, setLoadStateB,
    setParseProgressA, setParseProgressB,
    setLogA, setLogB,
  } = useVisualizerStore();

  const setLoadState = strategyId === "A" ? setLoadStateA : setLoadStateB;
  const setProgress = strategyId === "A" ? setParseProgressA : setParseProgressB;
  const setLog = strategyId === "A" ? setLogA : setLogB;

  const processFile = useCallback(
    (file: File) => {
      if (workerRef.current) workerRef.current.terminate();

      setLoadState("loading");
      setProgress(0);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;

        // Spawn Web Worker for parsing
        const worker = new Worker(
          new URL("@/lib/workers/parserWorker.ts", import.meta.url),
          { type: "module" }
        );
        workerRef.current = worker;

        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
          const { type, payload } = ev.data;
          if (type === "PROGRESS") {
            setProgress((payload as { progress: number }).progress);
          } else if (type === "DONE") {
            setLog(payload as any);
            worker.terminate();
          } else if (type === "ERROR") {
            setLoadState("error");
            console.error("Parse error:", (payload as { message: string }).message);
            worker.terminate();
          }
        };

        worker.onerror = (err) => {
          console.error("Worker error:", err);
          setLoadState("error");
          // Fallback: parse on main thread
          try {
            const { parseLog } = require("@/lib/parser/logParser");
            const result = parseLog(text, strategyId, file.name, setProgress);
            setLog(result);
          } catch (e2) {
            console.error("Main thread parse also failed:", e2);
          }
        };

        worker.postMessage({
          type: "PARSE",
          payload: { text, strategyId, fileName: file.name },
        });
      };

      reader.onerror = () => setLoadState("error");
      reader.readAsText(file);
    },
    [strategyId, setLoadState, setProgress, setLog]
  );

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    processFile(files[0]);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const colorA = "strat-a";
  const colorB = "strat-b";
  const color = strategyId === "A" ? colorA : colorB;
  const hexColor = strategyId === "A" ? "#00d4aa" : "#7c6af7";

  const borderClass =
    dragging
      ? `border-${color}`
      : loadState === "ready"
      ? `border-${color}/50`
      : loadState === "error"
      ? "border-bear/50"
      : "border-border";

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer
        ${borderClass} ${dragging ? "bg-surface-3" : "bg-surface-2 hover:bg-surface-3"}`}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => loadState !== "loading" && fileRef.current?.click()}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".log,.txt,.csv"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <div className="px-4 py-5 flex flex-col items-center gap-3">
        {/* Badge */}
        <Badge variant={strategyId === "A" ? "stratA" : "stratB"} className="mb-1">
          Strategy {strategyId}
        </Badge>

        {/* Icon / state */}
        <AnimatePresence mode="wait">
          {loadState === "idle" && (
            <motion.div key="idle" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Upload className="h-8 w-8" style={{ color: hexColor + "80" }} />
            </motion.div>
          )}
          {loadState === "loading" && (
            <motion.div key="loading" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <div
                className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: hexColor, borderTopColor: "transparent" }}
              />
            </motion.div>
          )}
          {loadState === "ready" && (
            <motion.div key="ready" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
              <CheckCircle className="h-8 w-8" style={{ color: hexColor }} />
            </motion.div>
          )}
          {loadState === "error" && (
            <motion.div key="error" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <AlertCircle className="h-8 w-8 text-bear" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text */}
        <div className="text-center">
          {loadState === "idle" && (
            <>
              <p className="text-xs font-mono text-text-secondary">
                Drop {strategyId === "A" ? "Strategy A" : "Strategy B"} log
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">.log .txt .csv</p>
            </>
          )}
          {loadState === "loading" && (
            <>
              <p className="text-xs font-mono text-text-secondary">Parsing…</p>
              <p className="text-[10px] text-text-muted font-mono">{Math.round(progress * 100)}%</p>
            </>
          )}
          {loadState === "ready" && logFile && (
            <>
              <p className="text-xs font-mono" style={{ color: hexColor }}>
                {logFile.fileName}
              </p>
              <p className="text-[10px] text-text-muted font-mono mt-0.5">
                {logFile.rowCount.toLocaleString()} rows · {logFile.products.length} products
                · {logFile.parseTime}ms
              </p>
            </>
          )}
          {loadState === "error" && (
            <p className="text-xs font-mono text-bear">Parse failed — check file format</p>
          )}
        </div>

        {/* Progress bar */}
        {loadState === "loading" && (
          <Progress
            value={progress}
            color={strategyId === "A" ? "strat-a" : "strat-b"}
            className="w-full"
          />
        )}

        {/* Re-upload button when ready */}
        {(loadState === "ready" || loadState === "error") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          >
            <Upload className="h-3 w-3 mr-1" />
            Replace
          </Button>
        )}
      </div>
    </div>
  );
}

/** Dual uploader: Strategy A and B side by side */
export function DualLogUploader() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <LogUploader strategyId="A" />
      <LogUploader strategyId="B" />
    </div>
  );
}
