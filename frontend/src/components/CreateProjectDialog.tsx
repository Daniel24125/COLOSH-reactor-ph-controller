"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/actions/dbActions";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function CreateProjectDialog({
    triggerButton,
    onSuccess
}: {
    triggerButton?: React.ReactNode;
    onSuccess?: () => void;
}) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [name, setName] = useState("");
    const [researcher, setResearcher] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim() || !researcher.trim()) {
            toast.error("Please fill out all fields.");
            return;
        }

        setIsSubmitting(true);
        const result = await createProject(name, researcher);

        if (result) {
            toast.success(`Project "${name}" created successfully.`);
            setIsOpen(false);
            setName("");
            setResearcher("");

            if (onSuccess) {
                onSuccess();
            } else {
                router.refresh();
            }
        } else {
            toast.error("Failed to create project.");
        }

        setIsSubmitting(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {triggerButton || (
                    <Button className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20">
                        <Plus className="w-4 h-4 mr-2" />
                        New Project
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Create New Project</DialogTitle>
                        <DialogDescription className="text-neutral-400">
                            Set up a new workspace to group related pH control experiments.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right text-neutral-300">
                                Name
                            </Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Bio-Reactor Alpha"
                                className="col-span-3 bg-neutral-950 border-neutral-800 text-neutral-200 focus-visible:ring-indigo-500"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="researcher" className="text-right text-neutral-300">
                                Researcher
                            </Label>
                            <Input
                                id="researcher"
                                value={researcher}
                                onChange={(e) => setResearcher(e.target.value)}
                                placeholder="e.g. Dr. Smith"
                                className="col-span-3 bg-neutral-950 border-neutral-800 text-neutral-200 focus-visible:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsOpen(false)}
                            className="bg-transparent border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                            {isSubmitting ? "Saving..." : "Create Project"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
