import Link from "next/link";
import { Database } from "lucide-react";
import { Project } from "@/types";

interface RecentProjectsWidgetProps {
    projects: Project[];
}

export function RecentProjectsWidget({ projects }: RecentProjectsWidgetProps) {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-neutral-200">Recent Projects</h2>
                <Link href="/projects" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                    View Archive &rarr;
                </Link>
            </div>
            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 h-[calc(100%-2rem)]">
                {projects.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-3 border border-neutral-800 border-dashed rounded-xl p-6">
                        <Database className="w-8 h-8 opacity-50" />
                        <p>No projects found. Create one to get started.</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {projects.slice(0, 5).map(project => (
                            <li key={project.id}>
                                <Link
                                    href={`/projects/${project.id}`}
                                    className="block p-4 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-indigo-500/50 transition-all group"
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className="text-neutral-200 font-medium group-hover:text-indigo-400 transition-colors">
                                                {project.name}
                                            </h3>
                                            <p className="text-xs text-neutral-500 mt-1">
                                                {project.researcher_name} &bull; {new Date(project.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="text-neutral-600 group-hover:text-indigo-500 transition-colors">
                                            &rarr;
                                        </div>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
