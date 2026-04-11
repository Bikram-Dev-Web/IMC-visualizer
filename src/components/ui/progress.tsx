import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

export function Progress({
  value = 0,
  className,
  color = "strat-a",
}: {
  value?: number;
  className?: string;
  color?: "strat-a" | "strat-b" | "bull" | "bear";
}) {
  const colorClass = {
    "strat-a": "bg-strat-a",
    "strat-b": "bg-strat-b",
    bull: "bg-bull",
    bear: "bg-bear",
  }[color];

  return (
    <div className={cn("h-1.5 w-full rounded-full bg-surface-4 overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-300", colorClass)}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}
