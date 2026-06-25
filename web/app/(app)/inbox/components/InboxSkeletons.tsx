import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** First-load placeholder for the conversation list (shaped like ConversationCard). */
export function ConversationListSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div className="px-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-2.5">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-8" />
            </div>
            <Skeleton className="h-2.5 w-44 mt-2.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** First-load placeholder for a conversation thread (alternating bubbles). */
export function MessageThreadSkeleton() {
  const rows = [
    { w: "w-40", me: false },
    { w: "w-56", me: true },
    { w: "w-28", me: false },
    { w: "w-48", me: true },
    { w: "w-36", me: false },
    { w: "w-52", me: true },
    { w: "w-24", me: false },
  ];
  return (
    <div className="flex-1 overflow-hidden px-4 pt-6 pb-10 flex flex-col gap-3">
      {rows.map((r, i) => (
        <Skeleton
          key={i}
          className={cn("h-9 rounded-2xl", r.w, r.me ? "self-end" : "self-start")}
        />
      ))}
    </div>
  );
}
