"use client";

import { Component, type ReactNode } from "react";

import { logHomeSectionError } from "@/lib/home/safe";

type HomeSectionBoundaryProps = {
  section: string;
  children: ReactNode;
};

type HomeSectionBoundaryState = {
  hasError: boolean;
};

export default class HomeSectionBoundary extends Component<
  HomeSectionBoundaryProps,
  HomeSectionBoundaryState
> {
  state: HomeSectionBoundaryState = { hasError: false };

  static getDerivedStateFromError(): HomeSectionBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    logHomeSectionError(this.props.section, error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}
