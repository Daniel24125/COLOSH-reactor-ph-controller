import { AlertCircle } from "lucide-react";
import Link from "next/link";

interface CalibrationWarningBannerProps {
    message: string;
}

export function CalibrationWarningBanner({ message }: CalibrationWarningBannerProps) {
    return (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-yellow-500 shadow-lg shadow-yellow-900/5">
            <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="font-medium text-sm">{message}</p>
            </div>
            <Link href="/calibration" className="shrink-0 px-4 py-2 text-sm bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg transition-colors border border-yellow-500/20 whitespace-nowrap font-medium">
                Recalibrate Sensors
            </Link>
        </div>
    );
}
