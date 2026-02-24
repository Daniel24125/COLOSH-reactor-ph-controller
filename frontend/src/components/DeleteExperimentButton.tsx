"use client";

import { Trash2 } from "lucide-react";
import { deleteExperiment } from "@/actions/dbActions";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteExperimentButton({ id, experimentName }: { id: number, experimentName: string }) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent wrapper link navigation

        if (window.confirm(`Delete experiment "${experimentName}" and all its telemetry?`)) {
            setIsDeleting(true);
            const success = await deleteExperiment(id);
            if (success) {
                router.refresh();
            } else {
                alert("Failed to delete experiment.");
                setIsDeleting(false);
            }
        }
    };

    return (
        <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
            title="Delete Experiment"
        >
            <Trash2 className="w-4 h-4" />
        </button>
    );
}
