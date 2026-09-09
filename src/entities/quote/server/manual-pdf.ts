import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFString,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type { Json } from "@/shared/types/database.generated";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 10.5;
const BODY_LINE_HEIGHT = 17;
// Resolve this at runtime instead of importing the binary so webpack/Turbopack
// does not try to parse the WOFF2 file as a JavaScript module.
const FONT_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "noto-sans-kr",
  "files",
  "noto-sans-kr-korean-400-normal.woff2",
);

export type ManualQuotePdfPayload = {
  customerName: string;
  title: string;
  body: string;
  scopeItems: string[];
  totalAmount: number;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
  depositAmount: number;
  balanceAmount: number;
  depositTerms: string;
  balanceTerms: string;
  issuedAt: string;
  expiresAt: string;
  approvalUrl: string;
};

export function createManualQuotePdfPayload(input: {
  customerName: string;
  token: string;
  publicBaseUrl: string;
  issuedAt: string;
  expiresAt: string;
  version: {
    title: string;
    body: string;
    scope_items: Json | unknown;
    total_amount: number;
    estimated_start_date: string | null;
    estimated_end_date: string | null;
    deposit_amount: number;
    balance_amount: number;
    deposit_terms: string;
    balance_terms: string;
  };
}): ManualQuotePdfPayload {
  if (
    !Array.isArray(input.version.scope_items) ||
    input.version.scope_items.some((item) => typeof item !== "string")
  ) {
    throw new Error("INVALID_QUOTE_MANUAL_PDF_PAYLOAD");
  }
  return {
    customerName: input.customerName,
    title: input.version.title,
    body: input.version.body,
    scopeItems: input.version.scope_items as string[],
    totalAmount: input.version.total_amount,
    estimatedStartDate: input.version.estimated_start_date,
    estimatedEndDate: input.version.estimated_end_date,
    depositAmount: input.version.deposit_amount,
    balanceAmount: input.version.balance_amount,
    depositTerms: input.version.deposit_terms,
    balanceTerms: input.version.balance_terms,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    approvalUrl: `${new URL(input.publicBaseUrl).origin}/quotes/${input.token}`,
  };
}

export async function renderManualQuotePdf(payload: ManualQuotePdfPayload) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(FONT_PATH);
  const font = await document.embedFont(fontBytes, { subset: true });
  document.setTitle(payload.title);
  document.setAuthor("Connecting Space");
  document.setSubject("고객 확인 및 승인을 위한 견적서");
  document.setCreationDate(new Date(payload.issuedAt));
  document.setModificationDate(new Date(payload.issuedAt));

  const writer = new PdfWriter(document, font);
  writer.heading("견적서", 22);
  writer.text(`고객명: ${payload.customerName}`, 12);
  writer.text(`견적 제목: ${payload.title}`, 12);
  writer.gap(8);
  writer.section("견적 내용");
  writer.paragraph(payload.body);
  writer.section("작업 범위");
  for (const item of payload.scopeItems) writer.paragraph(`• ${item}`);
  writer.section("금액 및 결제 조건");
  writer.text(`총액: ${formatWon(payload.totalAmount)}`);
  writer.text(`선수금: ${formatWon(payload.depositAmount)} · ${payload.depositTerms}`);
  writer.text(`잔금: ${formatWon(payload.balanceAmount)} · ${payload.balanceTerms}`);
  writer.section("일정 및 유효기간");
  writer.text(`예상 작업 기간: ${formatPeriod(payload)}`);
  writer.text(`발급 시각: ${formatSeoulDateTime(payload.issuedAt)}`);
  writer.text(`유효 시각: ${formatSeoulDateTime(payload.expiresAt)}`);
  writer.section("견적 확인 및 승인");
  writer.paragraph("아래 링크에서 견적 내용을 확인한 뒤 승인 버튼을 눌러 주세요.");
  writer.link(payload.approvalUrl);
  writer.paragraph("링크 조회만으로는 승인되지 않으며, 고객의 명시적인 승인 동작이 필요합니다.");

  return document.save({ useObjectStreams: false });
}

class PdfWriter {
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;

  constructor(
    private readonly document: PDFDocument,
    private readonly font: PDFFont,
  ) {
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  heading(value: string, size: number) {
    this.ensureSpace(size + 12);
    this.page.drawText(value, {
      x: MARGIN,
      y: this.y - size,
      size,
      font: this.font,
      color: rgb(0.11, 0.2, 0.17),
    });
    this.y -= size + 14;
  }

  section(value: string) {
    this.gap(9);
    this.heading(value, 14);
  }

  text(value: string, size = BODY_SIZE) {
    this.writeLines(wrapText(value, this.font, size, CONTENT_WIDTH), size, BODY_LINE_HEIGHT);
  }

  paragraph(value: string) {
    for (const paragraph of value.split(/\r?\n/)) {
      this.text(paragraph || " ");
    }
    this.gap(4);
  }

  link(url: string) {
    const size = 9;
    const lines = wrapText(url, this.font, size, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(BODY_LINE_HEIGHT);
      const baseline = this.y - size;
      this.page.drawText(line, {
        x: MARGIN,
        y: baseline,
        size,
        font: this.font,
        color: rgb(0.08, 0.31, 0.65),
      });
      const width = this.font.widthOfTextAtSize(line, size);
      const annotation = this.document.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [MARGIN, baseline - 2, MARGIN + width, baseline + size + 2],
        Border: [0, 0, 0],
        A: {
          Type: "Action",
          S: "URI",
          URI: PDFString.of(url),
        },
      });
      this.page.node.addAnnot(this.document.context.register(annotation));
      this.y -= BODY_LINE_HEIGHT;
    }
    this.gap(5);
  }

  gap(points: number) {
    this.y -= points;
  }

  private writeLines(lines: string[], size: number, lineHeight: number) {
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        size,
        font: this.font,
        color: rgb(0.13, 0.15, 0.14),
      });
      this.y -= lineHeight;
    }
  }

  private ensureSpace(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number) {
  if (!value) return [""];
  const lines: string[] = [];
  let current = "";
  for (const character of Array.from(value)) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatWon(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function formatPeriod(payload: ManualQuotePdfPayload) {
  if (!payload.estimatedStartDate && !payload.estimatedEndDate) return "협의 후 확정";
  return `${payload.estimatedStartDate ?? "미정"} ~ ${payload.estimatedEndDate ?? "미정"}`;
}

function formatSeoulDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}
