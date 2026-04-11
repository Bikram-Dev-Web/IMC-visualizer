import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "bull" | "bear" | "neutral" | "stratA" | "stratB" | "outline";
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-surface-3 text-text-primary border-border",
  bull: "bg-bull/20 text-bull border-bull/30",
  bear: "bg-bear/20 text-bear border-bear/30",
  neutral: "bg-neutral/20 text-neutral border-neutral/30",
  stratA: "bg-strat-a/20 text-strat-a border-strat-a/30",
  stratB: "bg-strat-b/20 text-strat-b border-strat-b/30",
  outline: "border-border text-text-secondary bg-transparent",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold border",
        "uppercase tracking-wider",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
