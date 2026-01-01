import { vscForeground } from "..";

interface TeddyLogoProps {
  height?: number;
  width?: number;
}

/**
 * Teddy.Codes logo - displays the brand name with styling
 */
export default function TeddyLogo({ height = 75, width }: TeddyLogoProps) {
  // Calculate width based on height to maintain aspect ratio
  const calculatedWidth = width || height * 4;

  return (
    <svg
      width={calculatedWidth}
      height={height}
      viewBox="0 0 400 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Teddy.Codes text */}
      <text
        x="200"
        y="65"
        textAnchor="middle"
        fill={vscForeground}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="48"
        fontWeight="600"
      >
        Teddy.Codes
      </text>
    </svg>
  );
}
