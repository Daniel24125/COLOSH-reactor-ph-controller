import { getProjectById, getExperimentsByProject } from "@/actions/dbActions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Beaker, Calendar, Target } from "lucide-react";
import { DeleteExperimentButton } from "@/components/DeleteExperimentButton";
import { ExperimentExportButton } from "@/components/ExperimentExportButton";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const project = await getProjectById(id);

    if (!project) notFound();

    const experiments = await getExperimentsByProject(id);

    return (
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
            {/* Header */}
            <div>
                <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-neutral-400 mb-6 hover:text-indigo-400 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Archive
                </Link>
                <h1 className="text-3xl font-medium tracking-tight text-neutral-100">{project.name}</h1>
                <p className="text-neutral-400 mt-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Created on {new Date(project.created_at).toLocaleDateString()} by {project.researcher_name}
                </p>
            </div>

            <h2 className="text-xl font-medium text-neutral-200 pt-4">Experiments ({experiments.length})</h2>

            {experiments.length === 0 ? (
                <div className="text-neutral-500 text-center py-12 border border-neutral-800 rounded-2xl border-dashed">
                    No experiments recorded for this project yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {experiments.map((exp) => (
                        <div key={exp.id} className="relative group h-full">
                            <Link href={`/experiments/${exp.id}`} className="block h-full">
                                <Card className="bg-neutral-900 border-neutral-800 hover:border-indigo-500/50 transition-colors cursor-pointer group/card h-full">
                                    <CardHeader>
                                        <div className="flex justify-between items-start pr-20">
                                            <CardTitle className="text-neutral-200 group-hover/card:text-indigo-400 transition-colors">
                                                {exp.name}
                                            </CardTitle>
                                            <Badge variant={exp.status === "active" ? "default" : "secondary"} className={exp.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : ""}>
                                                {exp.status}
                                            </Badge>
                                        </div>
                                        <CardDescription className="text-neutral-500 flex items-center gap-2">
                                            <Beaker className="w-3 h-3" />
                                            ID: {exp.id}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-1 text-xs text-neutral-500">
                                            {[
                                                { label: "C1", min: exp.c1_min_ph, max: exp.c1_max_ph },
                                                { label: "C2", min: exp.c2_min_ph, max: exp.c2_max_ph },
                                                { label: "C3", min: exp.c3_min_ph, max: exp.c3_max_ph },
                                            ].map(({ label, min, max }) => (
                                                <div key={label} className="flex items-center gap-2">
                                                    <span className="w-6 font-medium text-neutral-600">{label}</span>
                                                    <Target className="w-3 h-3" />
                                                    <span>{min} – {max} pH</span>
                                                </div>
                                            ))}
                                            <div className="pt-1 text-neutral-600">
                                                {new Date(exp.created_at).toLocaleString()}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                            <div className="absolute top-3 right-3 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ExperimentExportButton
                                    experimentId={exp.id}
                                    experimentName={exp.name}
                                    iconOnly
                                />
                                <DeleteExperimentButton id={exp.id} experimentName={exp.name} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}
