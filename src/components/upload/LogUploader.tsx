"use client";
/**
 * LogUploader — drag-and-drop + click-to-browse file uploader.
 * Parses the log on the main thread via dynamic import.
 */

import React, { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVisualizerStore } from "@/lib/store/useVisualizerStore";

interface UploaderProps {
  strategyId: "A" | "B";
}

export function LogUploader({ strategyId }: UploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
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
      setLoadState("loading");
      setProgress(0);

      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        // Yield to React so the loading spinner renders before we block the thread
        await new Promise<void>((r) => setTimeout(r, 0));
        try {
          const { parseLog } = await import("@/lib/parser/logParser");
          const result = parseLog(text, strategyId, file.name, (p) => {
            setProgress(p);
          });
          if (result.products.length === 0 || result.rowCount === 0) {
            console.error("Parse produced no usable data:", file.name);
            setLoadState("error");
            return;
          }
          setLog(result);
        } catch (err) {
          console.error("Parse error:", err);
          setLoadState("error");
        }
      };
      reader.onerror = () => setLoadState("error");
      reader.readAsText(file);
    },
    [strategyId, setLoadState, setProgress, setLog]
  );

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      processFile(files[0]);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const hexColor = strategyId === "A" ? "#00d4aa" : "#7c6af7";
  const color = strategyId === "A" ? "strat-a" : "strat-b";

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
        accept=".log,.txt,.csv,.json"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      <div className="px-4 py-5 flex flex-col items-center gap-3">
        <Badge variant={strategyId === "A" ? "stratA" : "stratB"} className="mb-1">
          Strategy {strategyId}
        </Badge>

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
                {logFile.rowCount.toLocaleString("en-US")} rows · {logFile.products.length} products
                · {logFile.parseTime}ms
              </p>
            </>
          )}
          {loadState === "error" && (
            <p className="text-xs font-mono text-bear">Parse failed — check file format</p>
          )}
        </div>

        {loadState === "loading" && (
          <Progress
            value={progress}
            color={strategyId === "A" ? "strat-a" : "strat-b"}
            className="w-full"
          />
        )}

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
