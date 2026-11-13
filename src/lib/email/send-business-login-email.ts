import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getHostBrandName } from "@/lib/business-app/brand-icons";
import { BUSINESS_HOSTNAME, BUSINESS_ORIGIN, COFFEE_ORIGIN, isCoffeeHostname } from "@/lib/business-app/host";
import { BUSINESS_CABINET_RETURN_PATH } from "@/lib/access-grants/paths";
import { getSmtpConfigFromEnv } from "@/lib/email/smtp-config";
import { createSmtpEmailProvider } from "@/lib/email/providers/smtp";
import { formatMimeFromAddress } from "@/lib/email/mime";

/** Best effort, only immediately after the session's anonymous account was linked. No token persistence. */
export async function sendBusinessLoginEmail(email: string, hostname: string, userId: string): Promise<void> {
  try {
    const smtp = getSmtpConfigFromEnv();
    if (!smtp) return;
    const coffee = isCoffeeHostname(hostname);
    const brand = getHostBrandName(coffee ? hostname : BUSINESS_HOSTNAME);
    const origin = coffee ? COFFEE_ORIGIN : BUSINESS_ORIGIN;
    const next = coffee ? "/cabinet" : BUSINESS_CABINET_RETURN_PATH;
    // Business auth lives on the apex, coffee auth on coffee itself.
    const authOrigin = coffee ? origin : "https://audiolad.ru";
    const callback = new URL("/auth/callback", authOrigin);
    callback.searchParams.set("next", next);
    const { data, error } = await createServiceRoleClient().auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo: callback.toString() },
    });
    if (error || data.user?.id !== userId || !data.properties?.hashed_token) return;
    // Admin links have no PKCE verifier. The callback verifies the hash on the server.
    callback.searchParams.set("token_hash", data.properties.hashed_token);
    callback.searchParams.set("type", "email");
    const link = callback.toString().replaceAll("&", "&amp;");
    const result = await createSmtpEmailProvider(smtp).send({
      to: email, from: formatMimeFromAddress(brand, smtp.user), envelopeFrom: smtp.user,
      subject: `Вход в кабинет ${brand}`,
      html: `<h1>Вход в кабинет ${brand}</h1><p>Почта для входа сохранена. Ваш кабинет и подписка доступны с любого устройства.</p><p><a href="${link}">Войти в кабинет</a></p><p>Если ссылка устарела, откройте страницу входа и запросите код из письма.</p>`,
    });
    if (!result.ok) console.warn("business_login_email_send_failed");
  } catch {
    console.warn("business_login_email_send_failed");
  }
}
