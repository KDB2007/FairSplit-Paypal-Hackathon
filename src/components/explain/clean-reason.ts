/** Model prose sometimes inlines ids like "(c_003)"; the evidence chips already show them. */
export function cleanReason(text: string): string {
  return text
    .replace(/\s*\((?:c_\d+(?:\s*,\s*)?)+\)/g, "")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}
