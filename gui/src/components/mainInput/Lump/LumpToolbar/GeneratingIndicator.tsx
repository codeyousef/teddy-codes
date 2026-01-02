import { useEffect, useState } from "react";
import { AnimatedEllipsis } from "../../../AnimatedEllipsis";

const LOADING_MESSAGES = [
  "Generating",
  "Thinking",
  "Reviewing context",
  "Analyzing code",
  "Consulting the map",
  "Planning next steps",
  "Verifying logic",
];

export function GeneratingIndicator({
  text = "Generating",
  testId,
}: {
  text?: string;
  testId?: string;
}) {
  const [currentText, setCurrentText] = useState(text);

  useEffect(() => {
    if (text !== "Generating") {
      setCurrentText(text);
      return;
    }

    // Reset to initial text
    setCurrentText(LOADING_MESSAGES[0]);

    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % LOADING_MESSAGES.length;
      setCurrentText(LOADING_MESSAGES[index]);
    }, 4000);

    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="text-description flex items-center" data-testid={testId}>
      <span className="text-xs">{currentText}</span>
      <AnimatedEllipsis />
    </div>
  );
}
