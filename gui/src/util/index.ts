import type { ProfileDescription } from "core/config/ProfileLifecycleManager";
import { KeyboardEvent as ReactKeyboardEvent } from "react";
import { getLocalStorage } from "./localStorage";

export type Platform = "mac" | "linux" | "windows" | "unknown";

export function getPlatform(): Platform {
  const platform = window.navigator.platform.toUpperCase();
  if (platform.indexOf("MAC") >= 0) {
    return "mac";
  } else if (platform.indexOf("LINUX") >= 0) {
    return "linux";
  } else if (platform.indexOf("WIN") >= 0) {
    return "windows";
  } else {
    return "unknown";
  }
}

export function isMetaEquivalentKeyPressed({
  metaKey,
  ctrlKey,
}: KeyboardEvent | ReactKeyboardEvent): boolean {
  const platform = getPlatform();
  switch (platform) {
    case "mac":
      return metaKey;
    case "linux":
    case "windows":
      return ctrlKey;
    default:
      return metaKey;
  }
}

export function getMetaKeyLabel(): string {
  return getPlatform() === "mac" ? "⌘" : "Ctrl";
}

export function getAltKeyLabel(): string {
  const platform = getPlatform();
  switch (platform) {
    case "mac":
      return "⌥";
    default:
      return "Alt";
  }
}

export function getFontSize(): number {
  return getLocalStorage("fontSize") ?? (isJetBrains() ? 15 : 14);
}

export function fontSize(n: number): string {
  return `${getFontSize() + n}px`;
}

export function isJetBrains() {
  return getLocalStorage("ide") === "jetbrains";
}

export const isShareSessionSupported = () => !isJetBrains();

export function isWebEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    window.navigator &&
    window.navigator.userAgent.indexOf("Electron") === -1
  );
}

export function isPrerelease() {
  const extensionVersion = getLocalStorage("extensionVersion");
  if (!extensionVersion) {
    console.warn(
      `Could not find extension version in local storage, assuming it's a prerelease`,
    );
    return true;
  }
  const minor = parseInt(extensionVersion.split(".")[1], 10);
  if (minor % 2 !== 0) {
    return true;
  }
  return false;
}

export function isLocalProfile(profile: ProfileDescription): boolean {
  return profile.profileType === "local";
}

export function deduplicateArray<T>(
  array: T[],
  equal: (a: T, b: T) => boolean,
): T[] {
  const result: T[] = [];

  for (const item of array) {
    if (!result.some((existingItem) => equal(existingItem, item))) {
      result.push(item);
    }
  }

  return result;
}

export function splitCamelCaseAndNonAlphaNumeric(value: string) {
  return value
    .split(/(?<=[a-z0-9])(?=[A-Z])|[^a-zA-Z0-9]/)
    .filter((t) => t.length > 0)
    .map((t) => t.toLowerCase());
}
