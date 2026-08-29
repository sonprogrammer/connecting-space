import type { MouseEvent } from "react";

export function InquirySelectionButton({
  inquiryId,
  customerName,
  selected,
  onSelect,
}: Readonly<{
  inquiryId: string;
  customerName: string;
  selected: boolean;
  onSelect: (inquiryId: string) => void;
}>) {
  function selectInquiry(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onSelect(inquiryId);
  }

  return (
    <button
      type="button"
      aria-label={`${customerName} 문의 ${selected ? "선택됨" : "선택"}`}
      aria-pressed={selected}
      onClick={selectInquiry}
      className="w-full rounded-sm text-left font-medium text-[#17201a] outline-none focus-visible:ring-3 focus-visible:ring-[#2e6f4f]/35 focus-visible:ring-offset-2"
    >
      {customerName}
    </button>
  );
}
