import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createQueryClient } = require("../author-practice-access-test-state.cjs");

export async function createClient() {
  return createQueryClient();
}
