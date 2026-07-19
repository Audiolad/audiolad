import type { PwaInstallDialogMode } from "@/lib/pwa/types";

type InstallDialogListener = () => void;

let dialogMode: PwaInstallDialogMode | null = null;
const listeners = new Set<InstallDialogListener>();

export function getInstallDialogMode(): PwaInstallDialogMode | null {
  return dialogMode;
}

export function setInstallDialogMode(mode: PwaInstallDialogMode | null): void {
  dialogMode = mode;

  for (const listener of listeners) {
    listener();
  }
}

export function subscribeInstallDialogMode(
  listener: InstallDialogListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
