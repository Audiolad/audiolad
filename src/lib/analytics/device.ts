export type DeviceType = "mobile" | "tablet" | "desktop";

export function detectDeviceType(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase();

  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    return "tablet";
  }

  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) {
    return "mobile";
  }

  return "desktop";
}

export function detectClientDeviceType(): DeviceType {
  if (typeof navigator === "undefined") {
    return "desktop";
  }

  return detectDeviceType(navigator.userAgent);
}
