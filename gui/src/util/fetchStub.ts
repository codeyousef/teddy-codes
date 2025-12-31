/**
 * Browser stub for @continuedev/fetch
 * The GUI runs in a webview and doesn't need the Node.js fetch implementation.
 * All network requests in the GUI go through the VS Code messenger protocol.
 */

// Use the native browser fetch
export const fetchwithRequestOptions = (
  url: RequestInfo | URL,
  init?: RequestInit,
  _requestOptions?: unknown,
): Promise<Response> => {
  return fetch(url, init);
};

export default fetchwithRequestOptions;
