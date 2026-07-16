#!/usr/bin/env node
import { assertProductionStartAllowed } from "./is-production-server.mjs";

assertProductionStartAllowed();
