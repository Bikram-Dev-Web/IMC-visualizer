"use client";
import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  label?: string;
  formatValue?: (v: number) => string;
}

export function Slider({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  className,
  label,
  formatValue,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {(label || formatValue) && (
        <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
          {label && <span>{label}</span>}
          {formatValue && <span className="text-text-secondary">{formatValue(value)}</span>}
        </div>
      )}
      <div className="relative h-4 flex items-center">
        {/* Track */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-surface-4">
          {/* Fill */}
          <div
            className="h-full rounded-full bg-strat-a transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Native range input (invisible, for interaction) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-4"
        />
        {/* Thumb */}
        <div
          className="absolute h-3.5 w-3.5 rounded-full bg-strat-a border-2 border-surface-0 shadow pointer-events-none"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
    </div>
  );
}
