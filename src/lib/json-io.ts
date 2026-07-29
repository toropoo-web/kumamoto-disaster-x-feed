import fs from "fs";
import path from "path";

export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf-8");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

export function writeJsonAtomically(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const content = JSON.stringify(data, null, 2);
  JSON.parse(content);
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, filePath);
}
