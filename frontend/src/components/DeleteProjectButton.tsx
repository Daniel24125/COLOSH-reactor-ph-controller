"use client";

import { Trash2 } from "lucide-react";
import { deleteProject } from "@/actions/dbActions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function DeleteProjectButton({ id, projectName }: { id: number, projectName: string }) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        // Stop event propagation so the click doesn't trigger the `<Link>` wrapping this Card
        e.preventDefault();
        e.stopPropagation();

        setIsDeleting(true);
        const success = await deleteProject(id);
        if (success) {
            toast.success("Project deleted successfully.");
            router.refresh();
        } else {
            toast.error("Failed to delete project.");
            setIsDeleting(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    disabled={isDeleting}
                    className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete Project"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-neutral-900 border border-neutral-800 text-neutral-100">
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription className="text-neutral-400">
                        This action cannot be undone. This will permanently delete the project
                        <strong className="text-neutral-200"> "{projectName}" </strong>
                        and all of its associated experiments and telemetry data.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel
                        className="bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white border-neutral-700"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                    >
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20"
                    >
                        {isDeleting ? "Deleting..." : "Delete Project"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
