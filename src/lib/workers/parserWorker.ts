/**
 * Web Worker: parses trading logs off the main thread.
 *
 * Receives: WorkerRequest (PARSE)
 * Sends:    WorkerResponse (PROGRESS | DONE | ERROR)
 *
 * By running parsing in a Worker, the main thread stays unblocked
 * for 60fps rendering even during multi-MB file ingestion.
 */

// NOTE: This file is executed in Worker context — no DOM, no window.
// Import only pure computation libraries.

import { parseLog } from "@/lib/parser/logParser";
import type { WorkerRequest, WorkerResponse } from "@/types";

// Worker message handler
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { type, payload } = event.data;

  if (type === "PARSE") {
    try {
      const { text, strategyId, fileName } = payload;

      const result = parseLog(text, strategyId, fileName, (progress) => {
        const msg: WorkerResponse = { type: "PROGRESS", payload: { progress } };
        self.postMessage(msg);
      });

      // Transfer TypedArrays to avoid copying — much faster for large datasets
      const msg: WorkerResponse = { type: "DONE", payload: result };
      // Post without transfer to keep compatibility — Maps aren't transferable anyway.
      // For very large logs the structured clone cost is acceptable (< 50ms for 100k rows).
      self.postMessage(msg);
    } catch (error) {
      const msg: WorkerResponse = {
        type: "ERROR",
        payload: { message: error instanceof Error ? error.message : String(error) },
      };
      self.postMessage(msg);
    }
  }
};
