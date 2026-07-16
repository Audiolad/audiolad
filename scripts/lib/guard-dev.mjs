#!/usr/bin/env node
import { assertDevAllowed } from "./is-production-server.mjs";

assertDevAllowed();
