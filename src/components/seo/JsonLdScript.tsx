import { serializeJsonLd } from "@/lib/seo/json-ld";

type JsonLdScriptProps = {
  data: unknown;
};

export default function JsonLdScript({ data }: JsonLdScriptProps) {
  if (data == null) {
    return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
