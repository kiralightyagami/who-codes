import fs from "fs";
import path from "path";

const MEMORY_DIR = path.join(process.env.AGENT_DIR ?? process.env.HOME ?? "~", ".whocodes", "memory");

/**
 * Stores useful facts about the workspace and user preferences.
 * Persisted to disk as JSON files so memory survives restarts.
 *
 * Each workspace path maps to a memory file at:
 *   ~/.whocodes/memory/<sanitized-path>.json
 */

interface WorkspaceMemory {
  facts: string[];
  preferences: Record<string, unknown>;
  lastUpdated: number;
}

export class MemoryManager {
  private cache: Map<string, WorkspaceMemory> = new Map();

  private getMemoryPath(workspacePath: string): string {
    // Sanitize the path for use as a filename
    const sanitized = workspacePath.replace(/[/\\]/g, "_").replace(/^_+/, "");
    return path.join(MEMORY_DIR, `${sanitized}.json`);
  }

  private load(workspacePath: string): WorkspaceMemory {
    if (this.cache.has(workspacePath)) {
      return this.cache.get(workspacePath)!;
    }

    const filePath = this.getMemoryPath(workspacePath);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      this.cache.set(workspacePath, data);
      return data;
    } catch {
      // File doesn't exist or is invalid — start fresh
      const empty: WorkspaceMemory = {
        facts: [],
        preferences: {},
        lastUpdated: Date.now(),
      };
      this.cache.set(workspacePath, empty);
      return empty;
    }
  }

  private save(workspacePath: string, memory: WorkspaceMemory): void {
    this.cache.set(workspacePath, memory);
    const filePath = this.getMemoryPath(workspacePath);
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
  }

  /**
   * Get all memory for a given workspace path as a JSON string.
   * Used by getAgentLoopPrompt to inject known facts.
   */
  getMemory(workspacePath: string): string {
    const mem = this.load(workspacePath);
    return JSON.stringify({
      facts: mem.facts,
      preferences: mem.preferences,
    }, null, 2);
  }

  /**
   * Save a new fact to memory.
   */
  saveFact(workspacePath: string, fact: string): void {
    const mem = this.load(workspacePath);
    mem.facts.push(fact);
    mem.facts = [...new Set(mem.facts)]; // dedupe
    mem.lastUpdated = Date.now();
    this.save(workspacePath, mem);
  }

  /**
   * Save a user preference.
   */
  savePreference(workspacePath: string, key: string, value: unknown): void {
    const mem = this.load(workspacePath);
    mem.preferences[key] = value;
    mem.lastUpdated = Date.now();
    this.save(workspacePath, mem);
  }

  /**
   * Clear all memory for a workspace.
   */
  clearMemory(workspacePath: string): void {
    this.cache.delete(workspacePath);
    const filePath = this.getMemoryPath(workspacePath);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File doesn't exist — ignore
    }
  }
}

/** Singleton instance */
export const memoryManager = new MemoryManager();
