import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const widgetTags = ["div", "section", "h2", "h3", "p", "span", "button", "ul", "li", "strong", "em"] as const;
export const cssProperties = ["color", "background-color", "font-size", "font-weight", "line-height", "text-align", "padding", "margin", "gap", "display", "border-radius", "border-color", "border-width", "border-style", "max-width", "width", "flex-direction", "align-items", "justify-content", "opacity"] as const;
const shortText = z.string().trim().min(1).max(500);
export const requirementsSchema = z.object({
  industry: shortText, purpose: shortText, targetAudience: shortText, mood: shortText,
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8),
  sections: z.array(shortText).min(1).max(20), interactions: z.array(shortText).max(10),
}).strict().refine(v => Buffer.byteLength(JSON.stringify(v), "utf8") <= 12288);
export const widgetSpecSchema = z.object({
  elements: z.array(z.object({ id, parentId: id.nullable(), tag: z.enum(widgetTags), text: z.string().max(2000) }).strict()).min(1).max(80),
  styles: z.array(z.object({ targetId: id, property: z.enum(cssProperties), value: z.string().min(1).max(80).regex(/^[a-zA-Z0-9# .,%_-]+$/), active: z.boolean().default(false) }).strict()).max(120),
  interactions: z.array(z.object({ triggerId: id, targetId: id, action: z.literal("toggle") }).strict()).max(20),
}).strict().superRefine((v, ctx) => {
  const seen = new Map<string, { depth: number; tag: string }>();
  for (const el of v.elements) {
    const parent = el.parentId === null ? undefined : seen.get(el.parentId);
    const depth = (parent?.depth ?? 0) + 1;
    if (seen.has(el.id) || (el.parentId !== null && !parent) || depth > 10
      || (parent && !["div", "section", "ul", "li"].includes(parent.tag))
      || (parent?.tag === "ul" && el.tag !== "li") || (el.tag === "li" && parent?.tag !== "ul")) {
      ctx.addIssue({ code: "custom", message: "Invalid element tree" });
    }
    seen.set(el.id, { depth, tag: el.tag });
  }
  for (const style of v.styles) if (!seen.has(style.targetId)) ctx.addIssue({ code: "custom", message: "Unknown style target" });
  for (const action of v.interactions) if (seen.get(action.triggerId)?.tag !== "button" || !seen.has(action.targetId)) ctx.addIssue({ code: "custom", message: "Invalid action target" });
  if (Buffer.byteLength(JSON.stringify(v), "utf8") > 32768) ctx.addIssue({ code: "custom", message: "Spec too large" });
});
export const widgetInputSchema = z.object({ requestKey: z.uuid(), retry: z.boolean().default(false), requirements: requirementsSchema }).strict();

// No provider-authored HTML, CSS syntax, attribute names or JavaScript enter this compiler.
export function compileWidget(input: unknown, projectId: string) {
  const spec = widgetSpecSchema.parse(input);
  const root = `iw-${z.uuid().parse(projectId)}`;
  const escape = (text: string): string => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const render = (parent: string | null): string => spec.elements.filter(e => e.parentId === parent).map(e =>
    `<${e.tag} id="${root}-${e.id}"${e.tag === "button" ? ' type="button"' : ""}>${escape(e.text)}${render(e.id)}</${e.tag}>`).join("\n");
  const css = spec.styles.map(s => `#${root} #${root}-${s.targetId}${s.active ? ".is-active" : ""} { ${s.property}: ${s.value}; }`).join("\n");
  const actions = spec.interactions.map(a => `root.querySelector("#${root}-${a.triggerId}").addEventListener("click", function () { root.querySelector("#${root}-${a.targetId}").classList.toggle("is-active"); });`).join("\n");
  return { html: `<div id="${root}">\n${render(null)}\n</div>`, css,
    javascript: actions ? `(function () { "use strict"; const root = document.getElementById("${root}"); if (!root || root.dataset.iwBound === "1") return; root.dataset.iwBound = "1";\n${actions}\n})();` : "",
    reviewOnly: true, reviewNotice: "아임웹 코드 위젯용 검토 초안입니다. 운영 삽입 전 별도 환경에서 검토하세요." };
}
