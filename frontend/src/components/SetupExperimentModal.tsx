"use client";

import { useUser } from "@/context/UserContext";
import { Project } from "@/types";

interface SetupExperimentModalProps {
    projects: Project[];
    isCreatingProject: boolean;
    selectedProjectId: string;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onToggleCreateProject: () => void;
    onSelectProject: (id: string) => void;
}

export function SetupExperimentModal({
    projects,
    isCreatingProject,
    selectedProjectId,
    isSubmitting,
    onClose,
    onSubmit,
    onToggleCreateProject,
    onSelectProject
}: SetupExperimentModalProps) {
    const { user } = useUser();

    return (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <h2 className="text-xl font-medium text-neutral-200 mb-4">New Experiment Validation</h2>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="block text-sm font-medium text-neutral-400">Project Assignment</label>
                            {projects.length > 0 && (
                                <button
                                    type="button"
                                    onClick={onToggleCreateProject}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                    {isCreatingProject ? "Select Existing" : "+ Create New"}
                                </button>
                            )}
                        </div>

                        {!isCreatingProject ? (
                            <select
                                value={selectedProjectId}
                                onChange={(e) => onSelectProject(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors"
                            >
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.researcher_name})</option>
                                ))}
                            </select>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 mb-1">New Project Name</label>
                                    <input required={isCreatingProject} name="projectName" type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Bio-Reactor" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-500 mb-1">Researcher Name</label>
                                    <input required={isCreatingProject} name="researcherName" defaultValue={user?.name || ""} type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Dr. Smith" />
                                </div>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-1">Experiment Name</label>
                        <input required name="experimentName" type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Test Run Alpha" />
                    </div>

                    <div className="border border-neutral-800 rounded-lg overflow-hidden">
                        <details className="group">
                            <summary className="bg-neutral-900/50 px-4 py-3 cursor-pointer text-sm font-medium text-neutral-300 hover:text-indigo-400 transition-colors flex items-center justify-between outline-none">
                                Hardware Adaptations & Configuration
                                <span className="text-neutral-500 group-open:rotate-180 transition-transform">&darr;</span>
                            </summary>
                            <div className="p-4 space-y-4 bg-neutral-950/30">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-400 mb-1">Data Acquisition Interval (Minutes)</label>
                                    <input required name="measurementIntervalMins" type="number" step="1" min="1" defaultValue="1" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-neutral-200 text-sm focus:outline-none focus:border-indigo-500" />
                                    <p className="text-[10px] text-neutral-600 mt-1">1 measurement / [value] minutes</p>
                                </div>

                                <div className="pt-2 border-t border-neutral-800/50">
                                    <span className="text-xs font-medium text-indigo-400/80 mb-2 block">Compartment pH Thresholds</span>
                                    {[1, 2, 3].map(id => (
                                        <div key={`c${id}`} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 mb-2">
                                            <span className="text-xs text-neutral-500 w-6">C{id}</span>
                                            <input required name={`c${id}MinPh`} type="number" step="0.1" defaultValue="6.8" placeholder="Min" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-indigo-500" />
                                            <input required name={`c${id}MaxPh`} type="number" step="0.1" defaultValue="7.2" placeholder="Max" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-indigo-500" />
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-2 border-t border-neutral-800/50 grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] text-neutral-500 mb-1">Max Pump Time (Sec)</label>
                                        <input required name="maxPumpTimeSec" type="number" defaultValue="30" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-indigo-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-neutral-500 mb-1">Mixing Cooldown (Sec)</label>
                                        <input required name="mixingCooldownSec" type="number" defaultValue="10" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-indigo-500" />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-[10px] text-neutral-500 mb-1">Manual Dose Limit (Steps)</label>
                                        <input required name="manualDoseSteps" type="number" defaultValue="50" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-indigo-500" />
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-neutral-400 bg-neutral-800 hover:bg-neutral-700/80 rounded-lg transition-colors border border-neutral-700/50">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg shadow-lg shadow-indigo-900/20 transition-all font-medium">
                            {isSubmitting ? "Starting..." : "Start Validation"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
