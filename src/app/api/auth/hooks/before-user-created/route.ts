import { NextResponse } from "next/server";

import { validateEmailForRegistrationServer } from "@/lib/auth/email";
import { getEmailValidationMessage } from "@/lib/auth/email/messages";
import {
  getAuthHookSecretFromEnv,
  verifyStandardWebhookSignature,
} from "@/lib/auth/hooks/verify-standard-webhook";

type BeforeUserCreatedPayload = {
  metadata?: {
    name?: string;
  };
  user?: {
    email?: string | null;
    app_metadata?: {
      provider?: string;
    };
  };
};

function hookUnauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function hookRejectSignup(message: string) {
  return NextResponse.json(
    {
      error: {
        http_code: 400,
        message,
      },
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const secret = getAuthHookSecretFromEnv();

  if (!secret) {
    console.error("before_user_created_hook_secret_missing");
    return NextResponse.json({ error: "hook_not_configured" }, { status: 503 });
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

  const provider = payload.user?.app_metadata?.provider;

  if (provider && provider !== "email") {
    return hookRejectSignup("This signup method is not supported.");
  }

  const email = payload.user?.email?.trim() ?? "";
  const validation = validateEmailForRegistrationServer(email);

  if (!validation.ok) {
    return hookRejectSignup(getEmailValidationMessage(validation.code));
  }

  return NextResponse.json({});
}
