"use client";
import { DownloadSquareLinear as Download } from "solar-icon-set";
import Shell from "@/components/Shell";
import { getToken } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ExportPage() {
  const token = getToken();

  const handleExport = (type: "campaigns" | "chats") => {
    // Generate a temporary link to download the CSV directly from the backend
    const url = `${API}/api/export/${type}?token=${token}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Shell>
      <div className="px-6 pt-6 pb-8 max-w-[800px] mx-auto">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Export Data</h1>
        <p className="text-sm font-medium text-slate-500 mb-8">
          Download historical data in CSV format for offline reporting and analytics.
        </p>

        <div className="flex flex-col gap-4">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between gap-6 transition-shadow hover:shadow-md">
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1.5">Campaign History</h2>
              <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-[500px]">
                Export campaign performance data including leads generated, messages sent, engagement metrics, and conversion rates for all campaigns.
              </p>
            </div>
            <button
              onClick={() => handleExport("campaigns")}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors shrink-0 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between gap-6 transition-shadow hover:shadow-md">
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1.5">Chat History & SLA Metrics</h2>
              <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-[500px]">
                Export detailed chat records including SLA tracking (response times), follow-up activity, pipeline stages, lead qualifications, and call attempts.
              </p>
            </div>
            <button
              onClick={() => handleExport("chats")}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors shrink-0 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
