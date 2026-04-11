"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

export interface SelectProps {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}

export function Select({ value, onValueChange, options, placeholder, className }: SelectProps) {
  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "appearance-none bg-surface-3 border border-border rounded",
          "text-text-primary text-xs font-mono pl-2.5 pr-6 py-1.5",
          "focus:outline-none focus:ring-1 focus:ring-strat-a cursor-pointer",
          "hover:border-border-accent transition-colors"
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-1.5 h-3 w-3 text-text-muted pointer-events-none" />
    </div>
  );
}
