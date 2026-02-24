import { getProjects } from "@/actions/dbActions";
import Link from "next/link";
import { FolderArchive, Calendar, User } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";

export const dynamic = "force-dynamic";

export default async function ProjectsArchive() {
    const projects = await getProjects();

    return (
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <FolderArchive className="w-6 h-6 text-indigo-400" />
                    <h1 className="text-2xl font-medium tracking-tight text-neutral-100">Projects Archive</h1>
                </div>
                <CreateProjectDialog />
            </div>

            {projects.length === 0 ? (
                <div className="text-neutral-500 text-center py-12 border border-neutral-800 rounded-2xl border-dashed">
                    No projects found.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.map((project) => (
                        <div key={project.id} className="relative group h-full">
                            <Link href={`/projects/${project.id}`} className="block h-full">
                                <Card className="bg-neutral-900 border-neutral-800 hover:border-indigo-500/50 transition-colors cursor-pointer group/card h-full">
                                    <CardHeader>
                                        <CardTitle className="text-neutral-200 group-hover/card:text-indigo-400 transition-colors pr-10">
                                            {project.name}
                                        </CardTitle>
                                        <CardDescription className="text-neutral-500 flex items-center gap-2">
                                            <User className="w-3 h-3" />
                                            {project.researcher_name || "Unknown"}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(project.created_at).toLocaleDateString()}
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                            <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <DeleteProjectButton id={project.id} projectName={project.name} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}
