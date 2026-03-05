import { CalibrationRecord } from "@/actions/calibrationActions";

interface CalibrationHistoryTableProps {
    history: CalibrationRecord[];
}

export function CalibrationHistoryTable({ history }: CalibrationHistoryTableProps) {
    return (
        <div className="mt-12 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-800">
                <h3 className="text-lg font-medium text-neutral-200">Calibration History</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-neutral-400">
                    <thead className="bg-neutral-950/50 text-xs uppercase text-neutral-500 border-b border-neutral-800">
                        <tr>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Compartment</th>
                            <th className="px-6 py-3">Slope (V/pH)</th>
                            <th className="px-6 py-3">Intercept (V)</th>
                            <th className="px-6 py-3">Researcher</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                        {history.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                                    No calibration records found.
                                </td>
                            </tr>
                        ) : (
                            history.map((record) => (
                                <tr key={record.id} className="hover:bg-neutral-800/50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-neutral-300">
                                        {new Date(record.calibrated_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-800 text-xs font-bold text-neutral-300">
                                            {record.compartment}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono">{record.slope.toFixed(4)}</td>
                                    <td className="px-6 py-4 font-mono">{record.intercept.toFixed(4)}</td>
                                    <td className="px-6 py-4">{record.researcher || "Unknown"}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
