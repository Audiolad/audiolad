import { requireAdminPermission } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const ID_CHUNK = 40;
const MEMBERS_PAGE_SIZE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function csvCell(value: string | null): string {
  let safe = value ?? "";

  if (/^[=+\-@]/.test(safe)) {
    safe = `'${safe}`;
  }

  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET() {
  await requireAdminPermission("users.view");

  const service = createServiceRoleClient();
  const authorUserIds = new Set<string>();

  for (let from = 0; ; from += MEMBERS_PAGE_SIZE) {
    const { data, error } = await service
      .from("author_members")
      .select("user_id")
      .range(from, from + MEMBERS_PAGE_SIZE - 1);

    if (error) {
      throw new Error("admin_author_export_members_failed");
    }

    for (const row of data ?? []) {
      if (row.user_id) {
        authorUserIds.add(row.user_id);
      }
    }

    if (!data || data.length < MEMBERS_PAGE_SIZE) {
      break;
    }
  }

  const profiles: Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    created_at: string;
  }> = [];

  const ids = [...authorUserIds];

  for (const idChunk of chunk(ids, ID_CHUNK)) {
    const { data, error } = await service
      .from("profiles")
      .select("id, email, full_name, created_at")
      .in("id", idChunk);

    if (error) {
      throw new Error("admin_author_export_profiles_failed");
    }

    profiles.push(...(data ?? []));
  }

  profiles.sort((a, b) => {
    const aName = (a.full_name ?? a.email ?? "").toLocaleLowerCase("ru-RU");
    const bName = (b.full_name ?? b.email ?? "").toLocaleLowerCase("ru-RU");
    return aName.localeCompare(bName, "ru-RU");
  });

  const rows = [
    ["Имя", "Email", "User ID", "Регистрация"].map(csvCell).join(","),
    ...profiles.map((profile) =>
      [
        profile.full_name,
        profile.email,
        profile.id,
        profile.created_at,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];

  const csv = "\uFEFF" + rows.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audiolad-authors-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
