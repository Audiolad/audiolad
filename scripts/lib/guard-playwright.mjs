#!/usr/bin/env node
import { assertPlaywrightAllowed } from "./is-production-server.mjs";

assertPlaywrightAllowed();
