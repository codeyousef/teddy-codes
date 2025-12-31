import os from "node:os";
import { IdeInfo } from "../index.js";

// Teddy.Codes: Telemetry is completely disabled.
// This file is a stub to satisfy existing imports without sending any data.

export enum PosthogFeatureFlag {
  AutocompleteTimeout = "autocomplete-timeout",
  RecentlyVisitedRangesNumSurroundingLines = "recently-visited-ranges-num-surrounding-lines",
}

export const EXPERIMENTS: {
  [key in PosthogFeatureFlag]: {
    [key: string]: { value: any };
  };
} = {
  [PosthogFeatureFlag.AutocompleteTimeout]: {
    control: { value: 150 },
    "250": { value: 250 },
    "350": { value: 350 },
    "450": { value: 450 },
  },
  [PosthogFeatureFlag.RecentlyVisitedRangesNumSurroundingLines]: {
    control: { value: null },
    "5": { value: 5 },
    "10": { value: 10 },
    "15": { value: 15 },
    "20": { value: 20 },
  },
};

export class Telemetry {
  static client: any = undefined;
  static uniqueId = "TEDDY_LOCAL";
  static os: string | undefined = undefined;
  static ideInfo: IdeInfo | undefined = undefined;

  static async captureError(errorName: string, error: unknown) {
    // No-op
  }

  static async capture(
    event: string,
    properties: { [key: string]: any },
    sendToTeam: boolean = false,
    isExtensionActivationError: boolean = false,
  ) {
    // No-op
  }

  static shutdownPosthogClient() {
    // No-op
  }

  static async getTelemetryClient(): Promise<any> {
    return undefined;
  }

  static async setup(allow: boolean, uniqueId: string, ideInfo: IdeInfo) {
    Telemetry.uniqueId = uniqueId;
    Telemetry.os = os.platform();
    Telemetry.ideInfo = ideInfo;
    // Always undefined
    Telemetry.client = undefined;
  }

  static async getFeatureFlag(flag: PosthogFeatureFlag) {
    return undefined;
  }

  static async getValueForFeatureFlag(flag: PosthogFeatureFlag) {
    // Always return control/default values or undefined
    return undefined;
  }
}
