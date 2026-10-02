import { join } from "node:path";

import {
  MUSIC_ANALYZER_CHECKPOINT_DEFAULT,
  MUSIC_ANALYZER_ROOT_DEFAULT,
  MUSIC_ANALYZER_VENV_DIR,
} from "./constants";

export function resolveMusicAnalyzerPaths(env: NodeJS.ProcessEnv = process.env): {
  root: string;
  pythonPath: string;
  checkpointPath: string;
} {
  const root = env.MUSIC_ANALYZER_ROOT?.trim() || MUSIC_ANALYZER_ROOT_DEFAULT;
  const pythonPath = join(root, MUSIC_ANALYZER_VENV_DIR, "bin", "python");
  const checkpointPath = env.MUSIC_ANALYZER_CHECKPOINT?.trim() || MUSIC_ANALYZER_CHECKPOINT_DEFAULT;
  return { root, pythonPath, checkpointPath };
}
