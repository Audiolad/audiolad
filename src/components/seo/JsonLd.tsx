import { serializeJsonLd } from "@/lib/seo/json-ld/serialize";

type JsonLdProps = {
  data: Record<string, unknown> | null | undefined;
};

export default function JsonLd({ data }: JsonLdProps) {
  if (!data) {
    return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
