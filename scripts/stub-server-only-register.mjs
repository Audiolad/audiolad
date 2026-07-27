import { register } from "node:module";

register(new URL("./stub-server-only-hooks.mjs", import.meta.url).href);
