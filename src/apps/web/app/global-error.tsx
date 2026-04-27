"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-surface/90 p-6 text-center shadow-[0_16px_48px_rgba(0,0,0,0.25)]">
            <h2 className="text-2xl font-semibold text-text-primary">Application error</h2>
            <p className="mt-3 text-sm text-text-secondary">
              {error.message || "Something went wrong while rendering AgentLens."}
            </p>
            <button onClick={() => reset()} className="mt-5 rounded-full bg-primary px-4 py-2 text-sm text-white">
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
