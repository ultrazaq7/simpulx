"use client";
import { useI18n } from "@/lib/i18n";
import { Download } from "lucide-react";
import Shell from "@/components/Shell";
import { getToken } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function ExportPage() {
  const { t } = useI18n();
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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">{t("export.exportData")}</h1>
        <p className="text-sm font-medium text-slate-500 mb-8">
          {t("export.downloadHistoricalDataInCsv")}
        </p>

        <div className="flex flex-col gap-4">
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between gap-6 transition-shadow hover:shadow-md">
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1.5">{t("export.campaignHistory")}</h2>
              <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-[500px]">
                {t("export.exportCampaignPerformanceDataIncluding")}
              </p>
            </div>
            <button
              onClick={() => handleExport("campaigns")}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors shrink-0 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              {t("export.exportCsv")}
            </button>
          </div>

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between gap-6 transition-shadow hover:shadow-md">
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-1.5">{t("export.chatHistorySlaMetrics")}</h2>
              <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-[500px]">
                {t("export.exportDetailedChatRecordsIncluding")}
              </p>
            </div>
            <button
              onClick={() => handleExport("chats")}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors shrink-0 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              {t("export.exportCsv")}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
