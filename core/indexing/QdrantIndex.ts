import { fetchwithRequestOptions } from "@continuedev/fetch";
import { Chunk, ILLM, IndexTag, IndexingProgressUpdate } from "../index.js";
import {
  CodebaseIndex,
  MarkCompleteCallback,
  RefreshIndexResults,
} from "./types.js";

class QdrantClient {
  private baseUrl: string;

  constructor(url: string = "http://localhost:6334") {
    this.baseUrl = url;
  }

  async createCollection(name: string, vectorSize: number) {
    const url = `${this.baseUrl}/collections/${name}`;
    await fetchwithRequestOptions(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      }),
    });
  }

  async upsertPoints(collectionName: string, points: any[]) {
    const url = `${this.baseUrl}/collections/${collectionName}/points?wait=true`;
    await fetchwithRequestOptions(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
  }

  async search(collectionName: string, vector: number[], limit: number = 10) {
    const url = `${this.baseUrl}/collections/${collectionName}/points/search`;
    const response = await fetchwithRequestOptions(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
      }),
    });
    if (!response.ok) {
      throw new Error(`Qdrant search failed: ${response.statusText}`);
    }
    return (await response.json()).result;
  }
}

export class QdrantIndex implements CodebaseIndex {
  relativeExpectedTime: number = 1;
  private client: QdrantClient;
  private collectionName: string = "dependencies"; // Default collection for now

  get artifactId(): string {
    return `vectordb::qdrant::${this.embeddingsProvider.embeddingId}`;
  }

  constructor(
    private embeddingsProvider: ILLM,
    qdrantUrl?: string,
  ) {
    this.client = new QdrantClient(qdrantUrl);
  }

  async *update(
    tag: IndexTag,
    results: RefreshIndexResults,
    markComplete: MarkCompleteCallback,
    repoName: string | undefined,
  ): AsyncGenerator<IndexingProgressUpdate> {
    const chunks = results.compute;
    if (chunks.length === 0) {
      return;
    }

    // Create collection if needed (assuming 1536 for now, but should check model)
    // We'll try to create it every time, Qdrant handles existence check or we can ignore error
    // Ideally we get dimension from embeddingsProvider
    // For now, let's assume we can get one embedding to check dimension

    // Embed chunks
    const embeddings = await this.embeddingsProvider.embed(
      chunks.map((c) => c.content),
    );
    if (embeddings.length === 0) return;

    const vectorSize = embeddings[0].length;
    await this.client.createCollection(this.collectionName, vectorSize);

    // Prepare points
    const points = chunks.map((chunk, i) => ({
      id: Math.floor(Math.random() * 100000000), // Simple random ID for now, should be UUID or hash
      vector: embeddings[i],
      payload: {
        content: chunk.content,
        filepath: chunk.filepath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        index: chunk.index,
        digest: chunk.digest,
      },
    }));

    // Upsert
    await this.client.upsertPoints(this.collectionName, points);

    yield { progress: 1, desc: "Qdrant Indexing Complete", status: "done" };
  }

  async retrieve(
    tags: IndexTag[],
    text: string,
    n: number,
    directory?: string,
    filter?: string[],
  ): Promise<Chunk[]> {
    const embeddings = await this.embeddingsProvider.embed([text]);
    if (embeddings.length === 0) return [];

    const results = await this.client.search(
      this.collectionName,
      embeddings[0],
      n,
    );

    return results.map((r: any) => ({
      content: r.payload.content,
      filepath: r.payload.filepath,
      startLine: r.payload.startLine,
      endLine: r.payload.endLine,
      index: r.payload.index,
      digest: r.payload.digest,
    }));
  }
}
