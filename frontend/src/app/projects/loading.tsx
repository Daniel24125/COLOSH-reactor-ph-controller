export default function Loading() {
    return (
        <main className="max-w-7xl mx-auto px-6 py-8">
            <div className="animate-pulse space-y-6">
                <div className="h-8 w-48 bg-neutral-800 rounded-lg" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
                            <div className="h-5 w-3/4 bg-neutral-800 rounded" />
                            <div className="h-4 w-1/2 bg-neutral-800 rounded" />
                            <div className="h-4 w-1/3 bg-neutral-800 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
