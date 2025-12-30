import { fetchwithRequestOptions } from "@continuedev/fetch";

export class DocFetcher {
  static async fetchDocs(
    packageName: string,
    homepage?: string,
  ): Promise<string | null> {
    if (!homepage) return null;

    // 1. Try llms.txt
    const llmTxtUrl = `${homepage.replace(/\/$/, "")}/llms.txt`;
    try {
      const response = await fetchwithRequestOptions(llmTxtUrl, {});
      if (response.ok) {
        return await response.text();
      }
    } catch (e) {
      // Ignore
    }

    // 2. Fallback: Light Scraper (README.md)
    // If homepage is a GitHub URL, try to fetch README.md
    if (homepage.includes("github.com")) {
      const rawUrl =
        homepage
          .replace("github.com", "raw.githubusercontent.com")
          .replace(/\/$/, "") + "/master/README.md";
      const mainUrl =
        homepage
          .replace("github.com", "raw.githubusercontent.com")
          .replace(/\/$/, "") + "/main/README.md";

      try {
        let response = await fetchwithRequestOptions(mainUrl, {});
        if (response.ok) return await response.text();

        response = await fetchwithRequestOptions(rawUrl, {});
        if (response.ok) return await response.text();
      } catch (e) {
        // Ignore
      }
    }

    return null;
  }
}
