"use client";

import { useEffect } from "react";

import { installClientErrorReporter } from "@/lib/client-errors/reporter";

export default function ClientErrorReporter() {
  useEffect(() => {
    installClientErrorReporter();
  }, []);

  return null;
}
