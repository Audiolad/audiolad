/**
 * Official VK Bridge browser build 3.0.2, served from this origin.
 * Loaded only by the `/vk` surface. A normal browser has no parent VK
 * client; init must resolve without throwing.
 */
export const VK_BRIDGE_SCRIPT_PATH = "/vendor/vk-bridge-3.0.2.min.js";
export const VK_BRIDGE_INIT_METHOD = "VKWebAppInit";

type VkBridgeLike = {
  send?: (method: string, params?: Record<string, unknown>) => unknown;
};

type VkBridgeDocument = {
  querySelector: (selector: string) => unknown;
  createElement: (tag: string) => VkBridgeScript;
  head?: { appendChild: (node: VkBridgeScript) => void };
  body?: { appendChild: (node: VkBridgeScript) => void };
};

type VkBridgeScript = {
  src: string;
  async: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

export type VkBridgeEnvironment = {
  vkBridge?: VkBridgeLike;
  document?: VkBridgeDocument;
};

let initPromise: Promise<void> | null = null;

export function resetVkBridgeInitForTests() {
  initPromise = null;
}

function callInit(bridge: VkBridgeLike | undefined): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!bridge || typeof bridge.send !== "function") {
        resolve();
        return;
      }
      const result = bridge.send(VK_BRIDGE_INIT_METHOD, {});
      if (
        result &&
        typeof result === "object" &&
        "then" in result &&
        typeof (result as Promise<unknown>).then === "function"
      ) {
        (result as Promise<unknown>).then(
          () => resolve(),
          () => resolve(),
        );
        return;
      }
      resolve();
    } catch {
      resolve();
    }
  });
}

export function initVkBridge(environment?: VkBridgeEnvironment): Promise<void> {
  if (environment) return startVkBridgeInit(environment);
  if (typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = startVkBridgeInit({
      vkBridge: window.vkBridge,
      document: document as unknown as VkBridgeDocument,
    }).catch(() => undefined);
  }
  return initPromise;
}

function startVkBridgeInit(environment: VkBridgeEnvironment): Promise<void> {
  if (environment.vkBridge && typeof environment.vkBridge.send === "function") {
    return callInit(environment.vkBridge);
  }

  const doc = environment.document;
  if (!doc) return Promise.resolve();

  return new Promise((resolve) => {
    try {
      const existing = doc.querySelector(`script[src="${VK_BRIDGE_SCRIPT_PATH}"]`);
      const script = (existing as VkBridgeScript | null) ?? doc.createElement("script");
      const finish = () => {
        const bridge = environment.vkBridge ?? (typeof window !== "undefined" ? window.vkBridge : undefined);
        void callInit(bridge).then(resolve, resolve);
      };

      if (existing) {
        finish();
        return;
      }

      script.src = VK_BRIDGE_SCRIPT_PATH;
      script.async = false;
      script.onload = finish;
      script.onerror = () => resolve();
      const parent = doc.head ?? doc.body;
      if (!parent) {
        resolve();
        return;
      }
      parent.appendChild(script);
    } catch {
      resolve();
    }
  });
}

declare global {
  interface Window {
    vkBridge?: VkBridgeLike;
  }
}
