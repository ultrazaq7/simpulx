import { cn } from "@/lib/utils";

/** Pulsing placeholder block. Compose into list/thread skeletons for first-load. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
