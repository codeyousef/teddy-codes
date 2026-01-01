import type { IndexingProgressUpdate } from "core";
import { useContext, useEffect, useState } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { Button } from "../ui";

export function TeddyWelcome() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [showWelcome, setShowWelcome] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState<IndexingProgressUpdate | null>(null);

  // Listen for indexing progress updates
  useWebviewListener("indexProgress", async (data) => {
    if (indexing) {
      setProgress(data);
      if (data.status === "done" || data.status === "failed") {
        setIndexing(false);
        if (data.status === "done") {
          setShowWelcome(false);
        }
      }
    }
  });

  useEffect(() => {
    async function checkProject() {
      const result = await ideMessenger.request(
        "teddy/checkProjectStatus",
        undefined,
      );
      if (result.status === "success" && result.content.needsIndexing) {
        setShowWelcome(true);
      }
    }
    checkProject();
  }, [ideMessenger]);

  const handleInitialize = async () => {
    setIndexing(true);
    setProgress({ progress: 0, desc: "Starting...", status: "indexing" });
    // Don't await - progress will be handled via websocket
    ideMessenger.request("teddy/initializeIndex", undefined);
  };

  if (!showWelcome) return null;

  const progressPercent = progress ? Math.round(progress.progress * 100) : 0;

  return (
    <div className="m-4 rounded-lg border border-purple-500 bg-purple-900/20 p-4">
      <h3 className="mb-2 text-lg font-bold text-purple-300">
        Teddy Found a Codebase!
      </h3>
      {!indexing ? (
        <>
          <p className="mb-4 text-sm text-gray-300">
            I see a Git repository here. I can index it using LEANN for 97%
            storage savings.
          </p>
          <Button
            onClick={handleInitialize}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            🚀 Initialize LEANN Index
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-purple-900/50">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-sm text-gray-300">
            {progress?.desc || "Indexing..."}
          </p>
          {progress?.status === "failed" && (
            <Button
              onClick={handleInitialize}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
