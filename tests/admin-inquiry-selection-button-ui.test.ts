import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MouseEvent, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InquirySelectionButton } from "../src/widgets/admin-dashboard/ui/inquiry-selection-button";

describe("admin inquiry selection button UI", () => {
  test("uses a native button with selected state and a visible keyboard focus style", () => {
    const markup = renderToStaticMarkup(
      InquirySelectionButton({
        inquiryId: "inquiry-2",
        customerName: "두 번째 문의자",
        selected: true,
        onSelect: () => undefined,
      }),
    );

    assert.match(markup, /^<button/);
    assert.match(markup, /type="button"/);
    assert.match(markup, /aria-pressed="true"/);
    assert.match(markup, /focus-visible:ring/);
    assert.match(markup, /두 번째 문의자/);
  });

  test("selects the matching inquiry through the native button action", () => {
    let selectedInquiryId: string | null = null;
    let propagationStopped = false;
    const element = InquirySelectionButton({
      inquiryId: "inquiry-2",
      customerName: "두 번째 문의자",
      selected: false,
      onSelect: (inquiryId: string) => { selectedInquiryId = inquiryId; },
    }) as ReactElement<{
      onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    }>;

    element.props.onClick({
      stopPropagation: () => { propagationStopped = true; },
    } as MouseEvent<HTMLButtonElement>);

    assert.equal(selectedInquiryId, "inquiry-2");
    assert.equal(propagationStopped, true);
  });
});
