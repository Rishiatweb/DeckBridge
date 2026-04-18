"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface UploadState {
  status: "idle" | "uploading" | "generating" | "done" | "error";
  progress: string;
  batchText: string;
  pct: number;
  error?: string;
}

export default function UploadZone() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({
    status: "idle",
    progress: "",
    batchText: "",
    pct: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        setState({ status: "error", progress: "", batchText: "", pct: 0, error: "Only PDF files are supported" });
        return;
      }

      try {
        // Step 1: Extract text
        setState({ status: "uploading", progress: "Extracting text from PDF...", batchText: "", pct: 10 });
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(uploadData.error || "Upload failed");
        }

        // Step 2: Stream card generation via SSE
        setState({
          status: "generating",
          progress: `Processing ${uploadData.chunkCount} sections...`,
          batchText: "Starting generation...",
          pct: 20,
        });

        const generateRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunks: uploadData.chunks, fileName: file.name }),
        });

        if (!generateRes.ok || !generateRes.body) {
          const errData = await generateRes.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || "Generation failed");
        }

        const reader = generateRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let deckId = "";
        let cardCount = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            switch (event.type) {
              case "start": {
                const total = event.totalBatches as number;
                setState((s) => ({
                  ...s,
                  batchText: `0 / ${total} batches done`,
                  pct: 25,
                }));
                break;
              }
              case "batch_done": {
                const batch = event.batch as number;
                const total = event.totalBatches as number;
                const cards = event.totalCards as number;
                const pct = Math.round(25 + (batch / total) * 45);
                setState((s) => ({
                  ...s,
                  batchText: `Batch ${batch} / ${total} done · ${cards} cards so far`,
                  pct,
                }));
                break;
              }
              case "synthesis_start":
                setState((s) => ({ ...s, batchText: "Linking concepts across sections...", pct: 72 }));
                break;
              case "synthesis_done": {
                const added = event.added as number;
                setState((s) => ({
                  ...s,
                  batchText: `Synthesis done · +${added} cross-section cards`,
                  pct: 82,
                }));
                break;
              }
              case "meta_start":
                setState((s) => ({ ...s, batchText: "Generating deck title...", pct: 90 }));
                break;
              case "meta_done":
                setState((s) => ({ ...s, batchText: `Titled: "${event.title}"`, pct: 96 }));
                break;
              case "complete":
                deckId = event.deckId as string;
                cardCount = event.cardCount as number;
                break;
              case "error":
                throw new Error(event.message as string);
            }
          }
        }

        if (!deckId) throw new Error("No deck ID received");

        setState({ status: "done", progress: `Created ${cardCount} cards!`, batchText: "", pct: 100 });
        setTimeout(() => router.push(`/decks/${deckId}`), 800);
      } catch (err) {
        setState({
          status: "error",
          progress: "",
          batchText: "",
          pct: 0,
          error: err instanceof Error ? err.message : "Something went wrong",
        });
      }
    },
    [router]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const isProcessing = state.status === "uploading" || state.status === "generating";

  return (
    <div className="w-full max-w-2xl mx-auto">
      <label
        className={`
          relative flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200
          ${isDragging
            ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 scale-[1.02]"
            : "border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-800 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
          }
          ${isProcessing ? "pointer-events-none" : ""}
          ${state.status === "done" ? "border-green-400 bg-green-50 dark:bg-green-900/20" : ""}
          ${state.status === "error" ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20" : ""}
        `}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInput}
          disabled={isProcessing}
        />

        {state.status === "idle" && (
          <>
            <div className="text-5xl mb-4">📄</div>
            <p className="text-lg font-semibold text-stone-700 dark:text-stone-200">Drop your PDF here</p>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">or click to browse</p>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-3">Max 10MB · Text-based PDFs only</p>
          </>
        )}

        {isProcessing && (
          <>
            <div className="text-5xl mb-3 animate-bounce">⚡</div>
            <p className="text-base font-semibold text-stone-700 dark:text-stone-200">{state.progress}</p>
            {state.batchText && (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{state.batchText}</p>
            )}
            <div className="mt-4 w-56 h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${state.pct}%` }}
              />
            </div>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">{state.pct}%</p>
          </>
        )}

        {state.status === "done" && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <p className="text-lg font-semibold text-green-700 dark:text-green-400">{state.progress}</p>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">Taking you to your deck...</p>
          </>
        )}

        {state.status === "error" && (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-base font-semibold text-red-600 dark:text-red-400">{state.error}</p>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-2">Click to try again</p>
          </>
        )}
      </label>
    </div>
  );
}
