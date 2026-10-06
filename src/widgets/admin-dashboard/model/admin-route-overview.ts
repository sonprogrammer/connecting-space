export function getLegacyInquiryRedirect(hash: string) {
  return hash.startsWith("#inquiry-") && hash.length > "#inquiry-".length
    ? `/admin/inquiries${hash}`
    : null;
}
