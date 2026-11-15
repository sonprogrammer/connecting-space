import "./helpers/register-path-alias";
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { compileWidget, widgetSpecSchema, requirementsSchema } from "../src/entities/widget/schemas/widget";

export const spec = { elements: [{ id: "title", parentId: null, tag: "h2", text: "환영 <script> & 소개" }, { id: "button", parentId: null, tag: "button", text: "열기" }], styles: [{ targetId: "title", property: "color", value: "#123456" }], interactions: [{ triggerId: "button", targetId: "title", action: "toggle" }] };
test("compiles isolated HTML CSS JavaScript from an allowlisted spec", () => {
  const result = compileWidget(spec, "c4c2ddc2-67ef-461e-b501-229ab45dd9ee");
  assert.match(result.html, /&lt;script&gt; &amp;/);
  assert.match(result.css, /#iw-c4c2ddc2-67ef-461e-b501-229ab45dd9ee/);
  assert.match(result.javascript, /classList.toggle\("is-active"\)/);
  assert.equal(result.reviewOnly, true);
});
test("rejects executable syntax, invalid references and unbounded structures", () => {
  for (const bad of [
    { ...spec, html: "<script>alert(1)</script>" }, { ...spec, javascript: "fetch('secret')" },
    { ...spec, elements: [{ ...spec.elements[0], tag: "script" }] },
    { ...spec, elements: [{ ...spec.elements[0], onclick: "alert(1)" }] },
    { ...spec, elements: [{ ...spec.elements[0], href: "javascript:alert(1)" }] },
    { ...spec, elements: [{ ...spec.elements[0], parentId: "title" }] },
    { ...spec, elements: [spec.elements[0], spec.elements[0]] },
    { ...spec, interactions: [{ triggerId: "missing", targetId: "title", action: "toggle" }] },
    { ...spec, elements: Array.from({ length: 81 }, (_, n) => ({ ...spec.elements[0], id: `x${n}` })) },
    { ...spec, elements: [{ ...spec.elements[0], text: "x".repeat(2001) }] },
    ...["url(https://evil)", "expression(alert(1))", "red;display:none", "\\75rl(test)", "@import x", "/*x*/red"].map(value => ({ ...spec, styles: [{ targetId: "title", property: "color", value }] })),
    { ...spec, styles: [{ targetId: "title", property: "background-image", value: "none" }] },
  ]) assert.equal(widgetSpecSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 160));
});
test("requirements are bounded strict structured input", () => {
  const input = { industry: "카페", purpose: "소개", targetAudience: "방문자", mood: "차분함", colors: ["#123456"], sections: ["소개"], interactions: ["열기"] };
  assert.equal(requirementsSchema.safeParse(input).success, true);
  assert.equal(requirementsSchema.safeParse({ ...input, prompt: "secret" }).success, false);
  assert.equal(requirementsSchema.safeParse({ ...input, sections: [] }).success, false);
});
test("generated JavaScript binds once and toggles only the selected local element", () => {
  const result=compileWidget(spec,"c4c2ddc2-67ef-461e-b501-229ab45dd9ee");
  let clicks=0, toggles=0; let click:(()=>void)|undefined;
  const root={dataset:{} as Record<string,string>,querySelector:(selector:string)=>{
    assert.match(selector,/^#iw-c4c2ddc2-67ef-461e-b501-229ab45dd9ee-/);
    if(selector.endsWith("-button"))return {addEventListener:(event:string,fn:()=>void)=>{assert.equal(event,"click");click=fn;clicks++;}};
    return {classList:{toggle:(value:string)=>{assert.equal(value,"is-active");toggles++;}}};
  }};
  const sandbox={document:{getElementById:(id:string)=>{assert.equal(id,"iw-c4c2ddc2-67ef-461e-b501-229ab45dd9ee");return root;}}};
  runInNewContext(result.javascript,sandbox);runInNewContext(result.javascript,sandbox);
  assert.equal(clicks,1);assert.equal(toggles,0);click!();assert.equal(toggles,1);
  runInNewContext(result.javascript,{document:{getElementById:()=>null}});
});
