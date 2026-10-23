// Reverse of assemble.mjs: an existing sz article (.md) → model fields. Used by the tests
// (round trip on the approved angel-hranitel article) and to re-check a hand-edited article.
import { faqEntries } from "./rules.mjs";

const between = (text, start, end) => {
  const a = text.indexOf(start);
  if (a < 0) return "";
  const b = end ? text.indexOf(end, a + start.length) : text.length;
  return text.slice(a + start.length, b < 0 ? text.length : b);
};
const paras = (text) => text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
const scalar = (fm, key) => {
  const raw = fm.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1] ?? "";
  return raw.startsWith('"') ? JSON.parse(raw) : raw;
};

function textSection(chunk) {
  const [title, ...rest] = chunk.split("\n");
  return { title: title.trim(), paragraphs: paras(rest.join("\n")) };
}

export function fieldsFromMarkdown(md) {
  const [, fm, body] = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const beforeGallery = paras(body.slice(0, body.search(/^:::gallery$/m)));
  const question = beforeGallery.pop().replace(/^\*\*|\*\*$/g, "");
  const invitation = beforeGallery.pop();
  const transition = beforeGallery.pop();
  const practiceIntro = paras(between(body, ":::overview\n:::", ":::practiceAudio"));
  const checklist = between(body, ":::checklist\n", "\n:::");
  const line = (key) => checklist.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1] ?? "";
  const psychology = body.slice(body.search(/^## .+: что говорит психология$/m));
  const psychologyIntro = paras(between(psychology, "\n", '<section class="article-expert"'))[0];
  const experts = [...body.matchAll(/<section class="article-expert" aria-label="([^"]+)">\n([\s\S]*?)<\/section>/g)].map(([, name, html]) => ({
    name,
    thesis: html.match(/^### [^:\n]+: (.+)$/m)?.[1] ?? "",
    bridge: paras(html.split(/^> «[^\n]+»\.?$/m)[1] ?? "").join("\n\n"),
  }));
  const faqAt = body.search(/^:::faq$/m);
  const main = body.slice(body.lastIndexOf("</section>", faqAt) + "</section>".length, faqAt);
  const chunks = main.split(/^## /m).map((chunk) => chunk.trim()).filter(Boolean);
  const out = { sectionsBefore: [], sectionsAfter: [] };
  let seenTable = false;
  let seenSteps = false;
  for (const chunk of chunks) {
    const [title, ...rest] = chunk.split("\n");
    const content = rest.join("\n");
    if (/^\|/m.test(content) && !seenTable) {
      seenTable = true;
      const lines = content.split("\n");
      const first = lines.findIndex((l) => l.startsWith("|"));
      const last = lines.length - 1 - [...lines].reverse().findIndex((l) => l.startsWith("|"));
      const row = (l) => l.replace(/^\|\s*|\s*\|$/g, "").split(/\s*\|\s*/);
      out.tableSection = {
        title: title.trim(),
        paragraphsBefore: paras(lines.slice(0, first).join("\n")),
        columns: row(lines[first]),
        rows: lines.slice(first + 2, last + 1).map(row),
        paragraphsAfter: paras(lines.slice(last + 1).join("\n")),
      };
    } else if (seenTable && !seenSteps && /^### /m.test(content)) {
      seenSteps = true;
      const [intro, ...items] = content.split(/^### /m);
      out.steps = {
        title: title.trim(),
        intro: paras(intro).join("\n\n"),
        items: items.map((item) => {
          const [heading, ...text] = item.split("\n");
          return { title: heading.trim(), text: paras(text.join("\n")).join("\n\n") };
        }),
      };
    } else if (title.trim() === "Когда стоит обратиться к специалисту") {
      out.specialist = {
        intro: paras(content)[0],
        items: [...content.matchAll(/^- (.+)$/gm)].map((m) => m[1]),
      };
    } else {
      (seenTable ? out.sectionsAfter : out.sectionsBefore).push(textSection(chunk));
    }
  }
  const tail = body.slice(faqAt);
  const finale = paras(between(tail, ":::morelinks\n:::", "<img src=\"/media/angels/four-angels-06"));
  return {
    seoTitle: scalar(fm, "seoTitle"),
    description: scalar(fm, "description"),
    faqHeading: scalar(fm, "faqHeading"),
    story: beforeGallery,
    transition,
    invitation,
    question,
    practiceIntro,
    checklist: {
      title: line("title"),
      feedbackEmpty: line("feedbackEmpty"),
      feedbackStart: line("feedbackStart"),
      feedbackHalf: line("feedbackHalf"),
      feedbackDone: line("feedbackDone"),
      items: [...checklist.matchAll(/^ {2}text: (.+)$/gm)].map((m) => m[1]),
    },
    psychologyIntro,
    experts,
    sectionsBefore: out.sectionsBefore,
    tableSection: out.tableSection,
    steps: out.steps,
    sectionsAfter: out.sectionsAfter,
    specialist: out.specialist,
    faq: faqEntries(fm).map(([question, answer]) => ({ question, answer })),
    storyEnding: tail.match(/^\*\*Чем закончилась история\.\*\* (.+)$/m)?.[1] ?? "",
    finalInvite: finale[0] ?? "",
    finalQuestion: (finale[1] ?? "").replace(/^\*\*|\*\*$/g, ""),
  };
}
