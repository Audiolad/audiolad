import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const RETIRED_MEDITATION_SOLUTIONS_LANDING_PATH =
  "/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy";

const GONE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

const GONE_BODY = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Страница удалена</title>
</head>
<body>
<h1>Страница удалена</h1>
<p>Эта страница больше не существует.</p>
</body>
</html>
`;

export function GET() {
  return new NextResponse(GONE_BODY, {
    status: 410,
    headers: GONE_HEADERS,
  });
}

export function HEAD() {
  return new NextResponse(null, {
    status: 410,
    headers: GONE_HEADERS,
  });
}
