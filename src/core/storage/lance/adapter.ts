/**
 * LanceDB Storage Adapter
 *
 * Unified adapter for vector storage operations.
 */

import { LanceDBVectorStorage } from "./vector-storage";
import type { IVectorStorage } from "../interfaces";

interface LanceDBStorageAdapterOptions {
  path?: string;
}

export class LanceDBStorageAdapter {
  vector: IVectorStorage;

  constructor(_options: LanceDBStorageAdapterOptions = {}) {
    this.vector = new LanceDBVectorStorage();
  }

  async close(): Promise<void> {
    // LanceDBVectorStorage doesn't require explicit closing
  }
}

export type { LanceDBStorageAdapterOptions };
