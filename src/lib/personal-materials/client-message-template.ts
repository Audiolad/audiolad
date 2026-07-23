export const CLIENT_MESSAGE_TEMPLATE_VARIABLES = [
  "{clientName}",
  "{publicUrl}",
  "{contentAction}",
] as const;

export const DEFAULT_CLIENT_MESSAGE_TEMPLATE = `{clientName}, ваша диагностика готова:
{publicUrl}

После {contentAction} её можно сохранить в личном кабинете.

Ждём обратную связь 🙏`;

export const CLIENT_MESSAGE_TEMPLATE_MAX_LENGTH = 4000;

export type ClientMessageContent = {
  hasAudio: boolean;
  hasPdf: boolean;
};

export type ClientMessageTemplateContext = {
  clientName: string;
  publicUrl: string;
  hasAudio?: boolean;
  hasPdf?: boolean;
};

export function resolveContentActionForMessage(content: ClientMessageContent): string {
  if (content.hasAudio && content.hasPdf) {
    return "прослушивания и просмотра";
  }

  if (content.hasAudio) {
    return "прослушивания";
  }

  if (content.hasPdf) {
    return "просмотра";
  }

  return "ознакомления";
}

export function resolveClientNameForMessage(
  clientFirstName: string,
  clientLastName: string | null,
): string {
  const firstName = clientFirstName.trim();
  if (firstName) {
    return firstName;
  }

  return `${clientFirstName} ${clientLastName ?? ""}`.trim();
}

export function resolveClientMessageTemplate(
  storedTemplate: string | null | undefined,
): string {
  const trimmed = storedTemplate?.trim();
  return trimmed ? trimmed : DEFAULT_CLIENT_MESSAGE_TEMPLATE;
}

export function normalizeStoredClientMessageTemplate(
  template: string | null | undefined,
): string | null {
  const trimmed = template?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

export function validateClientMessageTemplate(template: string): string | null {
  const trimmed = template.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > CLIENT_MESSAGE_TEMPLATE_MAX_LENGTH) {
    return `Шаблон не должен быть длиннее ${CLIENT_MESSAGE_TEMPLATE_MAX_LENGTH} символов.`;
  }

  if (!trimmed.includes("{publicUrl}")) {
    return "Шаблон должен содержать переменную {publicUrl}.";
  }

  return null;
}

export function renderClientMessageTemplate(
  template: string | null | undefined,
  context: ClientMessageTemplateContext,
): string {
  const resolvedTemplate = resolveClientMessageTemplate(template);
  const contentAction = resolveContentActionForMessage({
    hasAudio: context.hasAudio ?? false,
    hasPdf: context.hasPdf ?? false,
  });

  return resolvedTemplate
    .split("{clientName}").join(context.clientName)
    .split("{publicUrl}").join(context.publicUrl)
    .split("{contentAction}").join(contentAction);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function scrollElementIntoView(element: HTMLElement | null): void {
  if (!element || typeof element.scrollIntoView !== "function") {
    return;
  }

  element.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}
