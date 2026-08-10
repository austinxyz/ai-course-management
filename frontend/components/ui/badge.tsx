import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "success" | "danger" | "muted" | "info";

const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  danger: "bg-danger text-danger-foreground",
  muted: "bg-surface-muted text-muted border border-border",
  // 手动录入的互动记录用这个——跟已催（default）/跳过（muted）/取消跳过（success）
  // 三色区分（`interactions-manual-entry` mock）。
  info: "bg-blue-100 text-blue-700",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-token px-2 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
