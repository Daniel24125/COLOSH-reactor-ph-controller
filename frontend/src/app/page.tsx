"use client";

import { useMqtt } from "@/hooks/useMqtt";
import { useState } from "react";
import { Droplet, Activity, Database, AlertCircle, PlayCircle } from "lucide-react";

export default function Dashboard() {
  const { isConnected, phData, status, dosePump } = useMqtt();
  const [showSetup, setShowSetup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleManualDose = (pumpId: number) => {
    dosePump(pumpId, "forward", 50); // 50 steps default dose
  };

  const handleSetupSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      projectName: formData.get("projectName"),
      researcherName: formData.get("researcherName"),
      experimentName: formData.get("experimentName"),
      targetPhMin: parseFloat(formData.get("targetPhMin") as string),
      targetPhMax: parseFloat(formData.get("targetPhMax") as string),
    };

    try {
      const res = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setShowSetup(false);
        // MQTT Auto-Thresholds will be updated by Python backend detecting DB change, 
        // or we could force a reload here if needed.
      } else {
        console.error("Failed to start experiment");
      }
    } catch (err) {
      console.error("Error submitting experiment:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h1 className="text-xl font-medium tracking-tight text-neutral-200">
              Reactor<span className="text-cyan-400">Control</span>
            </h1>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Database className={`w-4 h-4 ${status.db_connected ? "text-emerald-400" : "text-neutral-500"}`} />
              <span className="text-neutral-400">DB</span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${isConnected ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
              <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
              {isConnected ? "Broker Connected" : "Broker Offline"}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Active Experiment Banner */}
        {status.active_experiment ? (
          <div className="bg-cyan-950/30 border border-cyan-800/50 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-cyan-500/20 p-2 rounded-lg">
                <PlayCircle className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-cyan-400/80 font-medium">Active Experiment</p>
                <p className="text-neutral-200">ID: {status.active_experiment}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSetup(true)}
                className="px-4 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors border border-neutral-700"
              >
                New Experiment
              </button>
              <div className="text-sm px-3 py-1 bg-cyan-900/50 text-cyan-300 rounded-full border border-cyan-700/50 flex shrink-0 items-center justify-center">
                Logging active
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-neutral-400">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              <p>No active experiment. Telemetry is not being recorded to DB.</p>
            </div>
            <button
              onClick={() => setShowSetup(true)}
              className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg shadow-lg shadow-cyan-900/20 transition-all font-medium flex shrink-0 items-center justify-center"
            >
              Start Setup
            </button>
          </div>
        )}

        {/* Setup Modal */}
        {showSetup && (
          <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-medium text-neutral-200 mb-4">New Experiment Validation</h2>
              <form onSubmit={handleSetupSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Project Name</label>
                    <input required name="projectName" type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-cyan-500 transition-colors" placeholder="e.g. Bio-Reactor" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Researcher Name</label>
                    <input required name="researcherName" type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-cyan-500 transition-colors" placeholder="e.g. Dr. Smith" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Experiment Name</label>
                  <input required name="experimentName" type="text" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-cyan-500 transition-colors" placeholder="e.g. Test Run Alpha" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Target pH (Min)</label>
                    <input required name="targetPhMin" type="number" step="0.1" defaultValue="6.8" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Target pH (Max)</label>
                    <input required name="targetPhMax" type="number" step="0.1" defaultValue="7.2" className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-neutral-200 focus:outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowSetup(false)} className="flex-1 px-4 py-2 text-neutral-400 bg-neutral-800 hover:bg-neutral-700/80 rounded-lg transition-colors border border-neutral-700/50">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg shadow-lg shadow-cyan-900/20 transition-all font-medium">
                    {isSubmitting ? "Starting..." : "Start Validation"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Telemetry Grid */}
        <div>
          <h2 className="text-lg font-medium text-neutral-200 mb-4">Live Telemetry</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((id) => (
              <div key={id} className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 relative overflow-hidden group">
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 p-8 w-32 h-32 bg-cyan-500/5 blur-3xl group-hover:bg-cyan-500/10 transition-colors duration-500" />

                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center font-mono text-sm text-neutral-400">
                      C{id}
                    </div>
                    <span className="text-neutral-400 font-medium">Compartment {id}</span>
                  </div>
                  <Droplet className="w-5 h-5 text-neutral-600 group-hover:text-cyan-500/50 transition-colors" />
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-light tracking-tight text-neutral-100">
                    {phData[id as keyof typeof phData] !== undefined
                      ? phData[id as keyof typeof phData]?.toFixed(2)
                      : "--"}
                  </span>
                  <span className="text-neutral-500 text-lg">pH</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manual Override Control */}
        <div>
          <h2 className="text-lg font-medium text-neutral-200 mb-4">Manual Override</h2>
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((id) => (
                <button
                  key={`pump-${id}`}
                  onClick={() => handleManualDose(id)}
                  disabled={!isConnected}
                  className="group relative overflow-hidden flex items-center justify-between p-4 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-neutral-800"
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-neutral-400 text-sm font-medium">Pump {id}</span>
                    <span className="text-neutral-200">Dose Base</span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500 group-hover:scale-110 transition-all">
                    <Droplet className="w-4 h-4 text-cyan-400 group-hover:text-neutral-950 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
            <p className="text-neutral-500 text-sm mt-4">
              Clicking a pump immediately forces a 50-step dose. Overrides any active auto-loop.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
