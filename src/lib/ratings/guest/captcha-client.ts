export type GuestCaptchaWidget = {
  provider: "smartcaptcha" | "turnstile";
  siteKey: string;
  mode: "invisible" | "visible";
};

type SmartCaptchaApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => number;
  execute: (widgetId?: number) => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
};

declare global {
  interface Window {
    smartCaptcha?: SmartCaptchaApi;
    turnstile?: TurnstileApi;
  }
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("captcha_script_failed"));
    document.head.appendChild(script);
  });
}

/**
 * Invisible first. A visible widget is mounted only when the server asks
 * for it. The token is sent once; the server rejects a reused token.
 */
export async function requestGuestCaptchaToken(
  widget: GuestCaptchaWidget,
): Promise<string> {
  if (!widget.siteKey) {
    throw new Error("captcha_unavailable");
  }

  const container = document.createElement("div");
  container.dataset.guestCaptcha = widget.mode;
  document.body.appendChild(container);

  try {
    if (widget.provider === "turnstile") {
      await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
      const turnstile = window.turnstile;
      if (!turnstile) {
        throw new Error("captcha_unavailable");
      }
      return await new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("captcha_unavailable")), 60_000);
        const id = turnstile.render(container, {
          sitekey: widget.siteKey,
          appearance: widget.mode === "visible" ? "always" : "interaction-only",
          execution: widget.mode === "visible" ? "render" : "execute",
          callback: (token: string) => {
            window.clearTimeout(timeout);
            resolve(token);
          },
          "error-callback": () => {
            window.clearTimeout(timeout);
            reject(new Error("captcha_unavailable"));
          },
        });
        if (widget.mode === "invisible") {
          turnstile.execute(id);
        }
      });
    }

    await loadScript("https://smartcaptcha.yandexcloud.net/captcha.js");
    const smartCaptcha = window.smartCaptcha;
    if (!smartCaptcha) {
      throw new Error("captcha_unavailable");
    }
    return await new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("captcha_unavailable")), 60_000);
      const id = smartCaptcha.render(container, {
        sitekey: widget.siteKey,
        invisible: widget.mode !== "visible",
        hideShield: true,
        callback: (token: string) => {
          window.clearTimeout(timeout);
          resolve(token);
        },
      });
      if (widget.mode !== "visible") {
        smartCaptcha.execute(id);
      }
    });
  } finally {
    container.remove();
  }
}
