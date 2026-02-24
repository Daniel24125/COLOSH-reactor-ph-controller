"use client";

import { Trash2 } from "lucide-react";
import { deleteProject } from "@/actions/dbActions";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProjectButton({ id, projectName }: { id: number, projectName: string }) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent navigating to the project link

        if (window.confirm(`Are you sure you want to delete the project "${projectName}"? This will permanently delete ALL associated experiments and telemetry.`)) {
            setIsDeleting(true);
            const success = await deleteProject(id);
            if (success) {
                router.refresh();
            } else {
                alert("Failed to delete project.");
                setIsDeleting(false);
            }
        }
    };

    return (
        <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
            title="Delete Project"
        >
            <Trash2 className="w-4 h-4" />
        </button>
    );
}
