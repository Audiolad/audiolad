import {
  ADMIN_SALES_PAGE_SIZE,
  buildAdminSaleBuyerName,
  detectAdminSaleBuyerKind,
  type AdminSaleDetail,
  type AdminSaleListItem,
  type AdminSalesPageData,
} from "@/lib/admin/sales";
import { resolveOwnerSaleBuyer, type SaleBuyerAuthUser } from "@/lib/admin/sale-buyer";
import { BUSINESS_SUBSCRIPTION_ORDER_KIND } from "@/lib/business/subscription-checkout";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type PaymentListRow = {
  id: string;
  order_id: string;
  status: string;
  amount_minor: number;
  currency: string;
  confirmed_at: string | null;
  created_at: string;
  provider: string | null;
  provider_payment_id: string | null;
  is_test: boolean | null;
  orders:
    | {
        id: string;
        user_id: string;
        status: string;
        practice_id: string | null;
        practice_title_snapshot: string | null;
        practice_slug_snapshot: string | null;
        author_id_snapshot: string | null;
        paid_at: string | null;
        checkout_origin_path: string | null;
        order_kind?: string | null;
      }
    | {
        id: string;
        user_id: string;
        status: string;
        practice_id: string | null;
        practice_title_snapshot: string | null;
        practice_slug_snapshot: string | null;
        author_id_snapshot: string | null;
        paid_at: string | null;
        checkout_origin_path: string | null;
        order_kind?: string | null;
      }[]
    | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type AuthorRow = {
  id: string;
  name: string;
};

type BusinessOwnerMemberRow = {
  user_id: string;
  organization_id: string;
  created_at: string | null;
};

type BusinessOrganizationRow = {
  id: string;
  name: string | null;
};

type AuthorMemberRow = {
  author_id: string;
  user_id: string;
};

function asOrder(value: PaymentListRow["orders"]) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function mapAdminSaleListItem(input: {
  paymentId: string;
  orderId: string;
  paidAt: string | null;
  buyerUserId: string | null;
  buyerFullName: string | null;
  buyerEmail: string | null;
  productTitle: string | null;
  authorId: string | null;
  authorName: string | null;
  amountMinor: number;
  currency: string;
  paymentStatus: string;
  orderStatus: string | null;
  authorMemberUserIds?: readonly string[] | null;
  authorMemberEmails?: readonly string[] | null;
  /** t1345u: АудиоЛад Бизнес subscription – the organization is shown instead of an author. */
  isBusinessSubscription?: boolean;
  organizationName?: string | null;
  /**
   * Email for the self-purchase badge: only the profile / account email. A receipt-only
   * address (user_metadata.receipt_email) is shown but never proves account ownership.
   * Defaults to buyerEmail.
   */
  buyerKindEmail?: string | null;
}): AdminSaleListItem {
  const business = input.isBusinessSubscription === true;
  return {
    paymentId: input.paymentId,
    orderId: input.orderId,
    paidAt: input.paidAt,
    buyerUserId: input.buyerUserId,
    buyerName: buildAdminSaleBuyerName(input.buyerFullName, input.buyerEmail),
    buyerEmail: input.buyerEmail,
    productTitle: input.productTitle?.trim() || "Продукт",
    authorId: input.authorId,
    authorName: (business ? input.organizationName?.trim() : input.authorName?.trim()) || "—",
    authorLabel: business ? "Заведение" : "Автор",
    amountMinor: input.amountMinor,
    currency: input.currency || "RUB",
    paymentStatus: input.paymentStatus,
    orderStatus: input.orderStatus,
    buyerKind: detectAdminSaleBuyerKind({
      buyerUserId: input.buyerUserId,
      buyerEmail: input.buyerKindEmail === undefined ? input.buyerEmail : input.buyerKindEmail,
      authorMemberUserIds: input.authorMemberUserIds,
      authorMemberEmails: input.authorMemberEmails,
    }),
  };
}

async function loadSaleRelatedMaps(
  service: ReturnType<typeof createServiceRoleClient>,
  rows: PaymentListRow[],
): Promise<{
  profiles: Map<string, ProfileRow>;
  authors: Map<string, AuthorRow>;
  membersByAuthor: Map<string, { userIds: string[]; emails: string[] }>;
  authUsers: Map<string, SaleBuyerAuthUser>;
  organizationsByOwner: Map<string, string>;
}> {
  const orders = rows.map((row) => asOrder(row.orders)).filter(Boolean);
  const buyerIds = [
    ...new Set(
      orders
        .map((order) => order?.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const authorIds = [
    ...new Set(
      orders
        .map((order) => order?.author_id_snapshot)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [profilesResult, authorsResult, membersResult] = await Promise.all([
    buyerIds.length
      ? service
          .from("profiles")
          .select("id, email, full_name")
          .in("id", buyerIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    authorIds.length
      ? service.from("authors").select("id, name").in("id", authorIds)
      : Promise.resolve({ data: [] as AuthorRow[] }),
    authorIds.length
      ? service
          .from("author_members")
          .select("author_id, user_id")
          .in("author_id", authorIds)
          .eq("role", "owner")
      : Promise.resolve({ data: [] as AuthorMemberRow[] }),
  ]);

  const memberUserIds = [
    ...new Set(
      ((membersResult.data ?? []) as AuthorMemberRow[]).map((row) => row.user_id),
    ),
  ];

  const memberProfilesResult = memberUserIds.length
    ? await service
        .from("profiles")
        .select("id, email, full_name")
        .in("id", memberUserIds)
    : { data: [] as ProfileRow[] };

  const profiles = new Map<string, ProfileRow>();
  for (const row of [
    ...((profilesResult.data ?? []) as ProfileRow[]),
    ...((memberProfilesResult.data ?? []) as ProfileRow[]),
  ]) {
    profiles.set(row.id, row);
  }

  const authors = new Map<string, AuthorRow>();
  for (const row of (authorsResult.data ?? []) as AuthorRow[]) {
    authors.set(row.id, row);
  }

  const membersByAuthor = new Map<string, { userIds: string[]; emails: string[] }>();
  for (const member of (membersResult.data ?? []) as AuthorMemberRow[]) {
    const current = membersByAuthor.get(member.author_id) ?? {
      userIds: [],
      emails: [],
    };
    current.userIds.push(member.user_id);
    const email = profiles.get(member.user_id)?.email ?? null;
    if (email) {
      current.emails.push(email);
    }
    membersByAuthor.set(member.author_id, current);
  }

  // t1345u: buyers without profile name or email (guest-start АудиоЛад Бизнес owners) and
  // Business payers – name / email fall back to auth (user_metadata, receipt_email).
  const businessBuyerIds = [
    ...new Set(
      orders
        .filter((order) => order?.order_kind === BUSINESS_SUBSCRIPTION_ORDER_KIND)
        .map((order) => order?.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const authLookupIds = buyerIds.filter((id) => {
    const profile = profiles.get(id);
    return businessBuyerIds.includes(id) || !profile?.email?.trim() || !profile?.full_name?.trim();
  });
  const [authUsers, organizationsByOwner] = await Promise.all([
    loadSaleAuthUsers(service, authLookupIds),
    loadBusinessOrganizationsByOwner(service, businessBuyerIds),
  ]);

  return { profiles, authors, membersByAuthor, authUsers, organizationsByOwner };
}

async function loadSaleAuthUsers(
  service: ReturnType<typeof createServiceRoleClient>,
  userIds: string[],
): Promise<Map<string, SaleBuyerAuthUser>> {
  const result = new Map<string, SaleBuyerAuthUser>();
  const admin = (service as { auth?: { admin?: ReturnType<typeof createServiceRoleClient>["auth"]["admin"] } }).auth?.admin;
  if (!admin || userIds.length === 0) return result;
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data, error } = await admin.getUserById(id);
        if (error || !data?.user) return;
        result.set(id, { email: data.user.email ?? null, user_metadata: data.user.user_metadata ?? null });
      } catch {
        // Auth is a fallback only: the row keeps the profile values.
      }
    }),
  );
  return result;
}

/** Owner user id → organization name (the earliest owner membership), АудиоЛад Бизнес only. */
async function loadBusinessOrganizationsByOwner(
  service: ReturnType<typeof createServiceRoleClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;
  try {
    const { data: members, error: membersError } = await service
      .from("business_organization_members")
      .select("user_id, organization_id, created_at")
      .in("user_id", userIds)
      .eq("role", "owner")
      .order("created_at", { ascending: true });
    if (membersError || !members?.length) return result;
    const firstOrgByUser = new Map<string, string>();
    for (const row of members as BusinessOwnerMemberRow[]) {
      if (!firstOrgByUser.has(row.user_id)) firstOrgByUser.set(row.user_id, row.organization_id);
    }
    const orgIds = [...new Set(firstOrgByUser.values())];
    const { data: orgs, error: orgsError } = await service
      .from("business_organizations")
      .select("id, name")
      .in("id", orgIds);
    if (orgsError) return result;
    const names = new Map<string, string>();
    for (const org of (orgs ?? []) as BusinessOrganizationRow[]) {
      const name = org.name?.trim();
      if (name) names.set(org.id, name);
    }
    for (const [userId, orgId] of firstOrgByUser) {
      const name = names.get(orgId);
      if (name) result.set(userId, name);
    }
  } catch {
    // The organization line is informational: a read error leaves «—».
  }
  return result;
}

function toListItem(
  row: PaymentListRow,
  related: Awaited<ReturnType<typeof loadSaleRelatedMaps>>,
): AdminSaleListItem {
  const order = asOrder(row.orders);
  const buyer = order?.user_id ? related.profiles.get(order.user_id) : null;
  const authorId = order?.author_id_snapshot ?? null;
  const author = authorId ? related.authors.get(authorId) : null;
  const members = authorId ? related.membersByAuthor.get(authorId) : null;
  const buyerUserId = order?.user_id ?? null;
  const { buyerName, buyerEmail } = resolveOwnerSaleBuyer({
    profileFullName: buyer?.full_name ?? null,
    profileEmail: buyer?.email ?? null,
    authUser: buyerUserId ? (related.authUsers.get(buyerUserId) ?? null) : null,
  });
  const isBusinessSubscription = order?.order_kind === BUSINESS_SUBSCRIPTION_ORDER_KIND;
  const authUser = buyerUserId ? related.authUsers.get(buyerUserId) : undefined;
  const buyerKindEmail = buyer?.email?.trim() || authUser?.email?.trim() || null;

  return mapAdminSaleListItem({
    paymentId: row.id,
    orderId: order?.id ?? row.order_id,
    paidAt: row.confirmed_at ?? order?.paid_at ?? row.created_at,
    buyerUserId: order?.user_id ?? null,
    // Already resolved; buildAdminSaleBuyerName keeps a resolved name as is.
    buyerFullName: buyerName,
    buyerEmail,
    productTitle: order?.practice_title_snapshot ?? null,
    authorId,
    authorName: author?.name ?? null,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paymentStatus: row.status,
    orderStatus: order?.status ?? null,
    authorMemberUserIds: members?.userIds,
    authorMemberEmails: members?.emails,
    buyerKindEmail,
    isBusinessSubscription,
    organizationName: buyerUserId ? (related.organizationsByOwner.get(buyerUserId) ?? null) : null,
  });
}

/** Rows → list items with buyer / author / organization lookups (exported for tests). */
export async function mapAdminSaleRows(
  service: ReturnType<typeof createServiceRoleClient>,
  rows: PaymentListRow[],
): Promise<AdminSaleListItem[]> {
  const related = await loadSaleRelatedMaps(service, rows);
  return rows.map((row) => toListItem(row, related));
}

const SALE_SELECT = `
  id,
  order_id,
  status,
  amount_minor,
  currency,
  confirmed_at,
  created_at,
  provider,
  provider_payment_id,
  is_test,
  orders (
    id,
    user_id,
    status,
    practice_id,
    practice_title_snapshot,
    practice_slug_snapshot,
    author_id_snapshot,
    paid_at,
    checkout_origin_path,
    order_kind
  )
`;

export async function listAdminSales(input?: {
  page?: number;
  pageSize?: number;
}): Promise<AdminSalesPageData> {
  const service = createServiceRoleClient();
  const pageSize = Math.max(1, input?.pageSize ?? ADMIN_SALES_PAGE_SIZE);
  const page = Math.max(1, input?.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await service
    .from("payments")
    .select(SALE_SELECT, { count: "exact" })
    .eq("status", "succeeded")
    .eq("is_test", false)
    .order("confirmed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error("admin_sales_list_failed");
  }

  const rows = (data ?? []) as PaymentListRow[];
  return {
    sales: await mapAdminSaleRows(service, rows),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getAdminSale(
  paymentId: string,
): Promise<AdminSaleDetail | null> {
  const service = createServiceRoleClient();
  const trimmed = paymentId.trim();

  if (!trimmed) {
    return null;
  }

  const { data, error } = await service
    .from("payments")
    .select(SALE_SELECT)
    .eq("id", trimmed)
    .eq("status", "succeeded")
    .maybeSingle();

  if (error) {
    throw new Error("admin_sale_detail_failed");
  }

  if (!data) {
    return null;
  }

  const row = data as PaymentListRow;
  const [listItem] = await mapAdminSaleRows(service, [row]);
  const order = asOrder(row.orders);

  return {
    ...listItem,
    practiceId: order?.practice_id ?? null,
    practiceSlug: order?.practice_slug_snapshot ?? null,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    checkoutOriginPath: order?.checkout_origin_path ?? null,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    isTest: row.is_test === true,
  };
}
