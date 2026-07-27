"use strict";

const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function patchedRequire(id) {
  if (id === "server-only") {
    return {};
  }

  return originalRequire.apply(this, arguments);
};
