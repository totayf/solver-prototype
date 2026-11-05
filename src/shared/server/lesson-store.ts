import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where a generated lesson lives on disk: `.data/lessons/<id>/` holds the
 * photo, the narration track and the lesson JSON the player loads. Local
 * storage for now; swap for object storage when the app is hosted.
 */
export function lessonStore(lessonId: string) {
  const dir = path.join(process.cwd(), ".data", "lessons", lessonId);

  async function readBytes(name: string): Promise<Bytes | null> {
    try {
      return new Uint8Array(await readFile(path.join(dir, name)));
    } catch {
      return null;
    }
  }

  async function writeBytes(name: string, data: Uint8Array): Promise<void> {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), data);
  }

  async function readJson<T>(name: string): Promise<T | null> {
    const bytes = await readBytes(name);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
  }

  async function writeJson(name: string, value: unknown): Promise<void> {
    await writeBytes(
      name,
      new TextEncoder().encode(JSON.stringify(value, null, 2)),
    );
  }

  /** Deletes the lesson's folder and everything in it. */
  async function remove(): Promise<void> {
    await rm(dir, { recursive: true, force: true });
  }

  return { dir, readBytes, writeBytes, readJson, writeJson, remove };
}

// ── Types ────────────────────────────────────────────────────────────────────

/** Bytes backed by a plain ArrayBuffer — what `Response` and Web Crypto accept. */
export type Bytes = Uint8Array<ArrayBuffer>;
