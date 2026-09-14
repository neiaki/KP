import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-white shadow-sm",
        secondary: "border-transparent bg-paper text-ink",
        destructive: "border-transparent bg-bad-bg text-bad border-bad/20",
        outline: "text-ink border-line",
        success: "border-transparent bg-good-bg text-good",
        warning: "border-transparent bg-warn-bg text-warn",
        info: "border-transparent bg-accent-soft text-accent-deep",
        purple: "border-transparent bg-accent-soft text-accent-deep",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
