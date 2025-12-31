/**
 * Browser stub for @continuedev/fetch
 * The GUI runs in a webview and doesn't need the Node.js fetch implementation.
 * All network requests in the GUI go through the VS Code messenger protocol.
 *
 * IMPORTANT: Do NOT import from "@continuedev/fetch" here - this file IS the alias
 * for that package in browser builds. Importing from it would create a circular dependency.
 */

// Define RequestOptions inline to avoid circular import
// This mirrors the type from @continuedev/config-types
export interface RequestOptions {
  timeout?: number;
  verifySsl?: boolean;
  caBundlePath?: string | string[];
  proxy?: string;
  headers?: { [key: string]: string };
  extraBodyProperties?: { [key: string]: any };
  noProxy?: string[];
  clientCertificate?: {
    cert: string;
    key: string;
    passphrase?: string;
  };
}

// Use the native browser fetch
export const fetchwithRequestOptions = (
  url: RequestInfo | URL,
  init?: RequestInit,
  _requestOptions?: RequestOptions,
): Promise<Response> => {
  return fetch(url, init);
};

export class FetchError extends Error {
  constructor(
    message: string,
    public response: Response,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

// Browser-compatible async generator for streaming responses
export async function* streamResponse(
  response: Response,
): AsyncGenerator<string> {
  if (response.status === 499) {
    return; // Client-side cancellation
  }

  if (response.status !== 200) {
    throw new Error(await response.text());
  }

  if (!response.body) {
    throw new Error("No response body returned.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

// Parse SSE data line
function parseDataLine(line: string): any {
  const json = line.startsWith("data: ")
    ? line.slice("data: ".length)
    : line.slice("data:".length);

  try {
    const data = JSON.parse(json);
    if (data.error) {
      if (
        data.error &&
        typeof data.error === "object" &&
        "message" in data.error
      ) {
        throw new Error(`Error streaming response: ${data.error.message}`);
      }
      throw new Error(
        `Error streaming response: ${JSON.stringify(data.error)}`,
      );
    }
    return data;
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.startsWith("Error streaming response:")
    ) {
      throw e;
    }
    throw new Error(`Malformed JSON sent from server: ${json}`);
  }
}

function parseSseLine(line: string): { done: boolean; data: any } {
  if (line.startsWith("data:[DONE]") || line.startsWith("data: [DONE]")) {
    return { done: true, data: undefined };
  }
  if (line.startsWith("data:")) {
    return { done: false, data: parseDataLine(line) };
  }
  if (line.startsWith(": ping")) {
    return { done: true, data: undefined };
  }
  return { done: false, data: undefined };
}

// Browser-compatible SSE streaming
export async function* streamSse(response: Response): AsyncGenerator<any> {
  let buffer = "";
  for await (const value of streamResponse(response)) {
    buffer += value;

    let position: number;
    while ((position = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, position);
      buffer = buffer.slice(position + 1);

      const { done, data } = parseSseLine(line);
      if (done) {
        break;
      }
      if (data) {
        yield data;
      }
    }
  }

  if (buffer.length > 0) {
    const { done, data } = parseSseLine(buffer);
    if (!done && data) {
      yield data;
    }
  }
}

// Browser-compatible JSON streaming
export async function* streamJSON(response: Response): AsyncGenerator<any> {
  let buffer = "";
  for await (const value of streamResponse(response)) {
    buffer += value;

    let position;
    while ((position = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, position);
      try {
        const data = JSON.parse(line);
        yield data;
      } catch (e) {
        throw new Error(`Malformed JSON sent from server: ${line}`);
      }
      buffer = buffer.slice(position + 1);
    }
  }
}

// Browser-compatible async iterable conversion (mostly for compatibility)
export async function* toAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

// Browser stub for patchedFetch - just use native fetch
export const patchedFetch = fetch;

export default fetchwithRequestOptions;
