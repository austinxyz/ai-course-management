import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "success" | "danger" | "muted";

const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  danger: "bg-danger text-danger-foreground",
  muted: "bg-surface-muted text-muted border border-border",
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
