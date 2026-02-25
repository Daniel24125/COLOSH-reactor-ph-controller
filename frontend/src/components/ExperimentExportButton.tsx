"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ExperimentExportButtonProps {
    experimentId: string;
    experimentName: string;
    iconOnly?: boolean;
}

export function ExperimentExportButton({ experimentId, experimentName, iconOnly = false }: ExperimentExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await fetch(`/api/export/${experimentId}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Export failed");
            }

            // Stream the response as a file download
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            // Use the filename from Content-Disposition if available
            const disposition = res.headers.get("Content-Disposition") ?? "";
            const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
            a.download = filenameMatch?.[1] ?? `ReactorExport_${experimentId.slice(0, 8)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            toast.success(`"${experimentName}" exported successfully`);
        } catch (err) {
            console.error("Export error:", err);
            toast.error(err instanceof Error ? err.message : "Failed to export experiment data");
        } finally {
            setIsExporting(false);
        }
    };

    if (iconOnly) {
        return (
            <button
                onClick={handleExport}
                disabled={isExporting}
                className="p-1.5 rounded-md bg-neutral-900/80 hover:bg-emerald-500/20 text-neutral-400 hover:text-emerald-400 border border-neutral-700 hover:border-emerald-600/40 transition-colors disabled:opacity-50"
                title={`Export "${experimentName}" to Excel`}
            >
                {isExporting
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <FileSpreadsheet className="w-3.5 h-3.5" />}
            </button>
        );
    }

    return (
        <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-600/20 rounded-lg transition-colors font-medium disabled:opacity-50"
            title="Export experiment data to Excel"
        >
            {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileSpreadsheet className="w-4 h-4" />
            )}
            {isExporting ? "Exporting..." : "Export to Excel"}
        </button>
    );
}
