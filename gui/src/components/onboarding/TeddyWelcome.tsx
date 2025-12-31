import { useContext, useEffect, useState } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { Button } from "../ui";

export function TeddyWelcome() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [showWelcome, setShowWelcome] = useState(false);
  const [indexing, setIndexing] = useState(false);

  useEffect(() => {
    async function checkProject() {
      // We'll implement this message handler in the core/extension later
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
    // We'll implement this message handler in the core/extension later
    await ideMessenger.request("teddy/initializeIndex", undefined);
    setIndexing(false);
    setShowWelcome(false);
  };

  if (!showWelcome) return null;

  return (
    <div className="m-4 rounded-lg border border-purple-500 bg-purple-900/20 p-4">
      <h3 className="mb-2 text-lg font-bold text-purple-300">
        Teddy Found a Codebase!
      </h3>
      <p className="mb-4 text-sm text-gray-300">
        I see a Git repository here. I can index it using LEANN for 97% storage
        savings.
      </p>
      <Button
        onClick={handleInitialize}
        disabled={indexing}
        className="w-full bg-purple-600 hover:bg-purple-700"
      >
        {indexing ? "Indexing..." : "🚀 Initialize LEANN Index"}
      </Button>
    </div>
  );
}
