export function resolvePublishedAt(
  wasPublished: boolean,
  previousPublishedAt: string | null,
  willBePublished: boolean,
  now: string,
): string | null {
  if (!willBePublished) {
    return null;
  }

  if (wasPublished && previousPublishedAt) {
    return previousPublishedAt;
  }

  return now;
}
