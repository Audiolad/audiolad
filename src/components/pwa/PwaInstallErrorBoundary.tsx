"use client";

import { Component, type ReactNode } from "react";

import { PwaInstallContext } from "@/components/pwa/PwaInstallProvider";
import { PWA_INSTALL_FALLBACK_CONTEXT } from "@/lib/pwa/fallback-context";

type PwaInstallErrorBoundaryProps = {
  children: ReactNode;
  appChildren: ReactNode;
};

type PwaInstallErrorBoundaryState = {
  hasError: boolean;
};

export default class PwaInstallErrorBoundary extends Component<
  PwaInstallErrorBoundaryProps,
  PwaInstallErrorBoundaryState
> {
  state: PwaInstallErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PwaInstallErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error(
      "pwa_install_provider_error",
      JSON.stringify({
        message: message.slice(0, 500),
        stack: stack?.slice(0, 1000) ?? null,
      }),
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <PwaInstallContext.Provider value={PWA_INSTALL_FALLBACK_CONTEXT}>
          {this.props.appChildren}
        </PwaInstallContext.Provider>
      );
    }

    return this.props.children;
  }
}
