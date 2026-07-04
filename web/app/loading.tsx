import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] bg-transparent text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-600" />
      <p className="text-sm font-medium animate-pulse text-slate-500">Memuat data...</p>
    </div>
  );
}
