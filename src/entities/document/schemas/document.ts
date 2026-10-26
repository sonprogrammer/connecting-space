import { z } from "zod";

export const documentKindSchema = z.enum(["proposal", "contract"]);
export const reviewNotice = "검토용 초안입니다. 가격·일정·법적 조건은 확인이 필요하며 확정 계약이나 법률 자문이 아닙니다.";
export const restrictedTerms = /(?:\d[\d,.]*\s*(?:원|만원|USD|KRW|%|일|주|개월|days|weeks)|[일이삼사오육칠팔구십백천만억]+원|₩|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|위약|손해배상|준거법|관할|저작권|소유권|법적|의무|보장|확정|서명|계약기간|가격|비용|금액|요금|무료|무상|할인|일주일|한\s*달|다음\s*달|납기|착수일|완료일)/i;
export const narrativeSchema = z.object({
  title: z.string().trim().min(1).max(160), summary: z.string().trim().min(1).max(5000),
  scopeItems: z.array(z.string().trim().min(1).max(500)).min(1).max(40),
}).strict().refine((v) => !restrictedTerms.test([v.title, v.summary, ...v.scopeItems].join("\n")), "Conditions must remain unconfirmed");
export function makeReviewContent(value: z.infer<typeof narrativeSchema>) {
  return { ...value, reviewOnly: true as const, reviewNotice, needsConfirmation: [
    { category: "price", question: "계약 금액·추가 비용·결제 조건을 담당자와 확인해 주세요." },
    { category: "schedule", question: "착수·완료 일정과 작업 가능 기간을 담당자와 확인해 주세요." },
    { category: "legal", question: "권리·책임·해지 등 법적 조건은 별도 검토 후 합의해 주세요." },
  ] };
}
export const generationInputSchema = z.object({ type: documentKindSchema, requestKey: z.uuid(), retry: z.boolean().default(false) }).strict();
export const saveDocumentSchema = z.object({ type: documentKindSchema, requestKey: z.uuid(), expectedRevision: z.number().int().nonnegative(), content: narrativeSchema }).strict();
