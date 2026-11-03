import type { validateEmailForRegistrationServer } from "../email";
import { getEmailValidationMessage } from "../email/messages";
import { verifyStandardWebhookSignature } from "./verify-standard-webhook";
import type { GuestHookUser } from "../business-guest/authorize";

type BeforeUserCreatedPayload = {
  metadata?: {
    name?: string;
  };
  user?: GuestHookUser;
};

function hookUnauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function hookRejectSignup(message: string) {
  return Response.json(
    {
      error: {
        http_code: 400,
        message,
      },
    },
    { status: 400 },
  );
}

export function createBeforeUserCreatedHandler(deps: {
  hookSecret: () => string | null;
  guestEnabled: () => boolean;
  authorizeGuest: (user: GuestHookUser | undefined) => Promise<boolean>;
  validateEmail: (email: string) => ReturnType<typeof validateEmailForRegistrationServer>;
}) {
  return async function POST(request: Request) {
    const secret = deps.hookSecret();

    if (!secret) {
      console.error("before_user_created_hook_secret_missing");
      return Response.json({ error: "hook_not_configured" }, { status: 503 });
    }

    const rawBody = await request.text();

    const verified = verifyStandardWebhookSignature({
      rawBody,
      webhookId: request.headers.get("webhook-id"),
      webhookTimestamp: request.headers.get("webhook-timestamp"),
      webhookSignature: request.headers.get("webhook-signature"),
      secret,
    });

    if (!verified) {
      return hookUnauthorized();
    }

    let payload: BeforeUserCreatedPayload;

    try {
      payload = JSON.parse(rawBody) as BeforeUserCreatedPayload;
    } catch {
      return hookRejectSignup("Invalid signup request.");
    }

    if (payload.metadata?.name && payload.metadata.name !== "before-user-created") {
      return hookRejectSignup("Invalid signup request.");
    }

    // The disabled path below is deliberately the existing email-only contract.
    if (deps.guestEnabled() && payload.user?.is_anonymous === true) {
      const allowed = await deps.authorizeGuest(payload.user);
      return allowed ? Response.json({}) : hookRejectSignup("Invalid signup request.");
    }

    const provider = payload.user?.app_metadata?.provider;

    if (provider && provider !== "email") {
      return hookRejectSignup("This signup method is not supported.");
    }

    const email = payload.user?.email?.trim() ?? "";
    const validation = deps.validateEmail(email);

    if (!validation.ok) {
      return hookRejectSignup(getEmailValidationMessage(validation.code));
    }

    return Response.json({});
  };
}
