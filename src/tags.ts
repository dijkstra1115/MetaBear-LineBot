export const CUSTOMER_TAGS = [
  "大戶",
  "活躍",
  "觀察中",
  "閒置",
  "新手",
] as const;
export type CustomerTag = (typeof CUSTOMER_TAGS)[number];

export function parseTags(value: string): { value: string } | { error: string } {
  const parts = value
    .split(/[,，、\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const unknown = parts.filter(
    (part) => !CUSTOMER_TAGS.includes(part as CustomerTag),
  );
  if (unknown.length)
    return { error: "請使用既有標籤：" + CUSTOMER_TAGS.join("、") };
  return { value: [...new Set(parts)].join(",") };
}
