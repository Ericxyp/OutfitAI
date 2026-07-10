const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const ID_LABEL_PATTERN = /id\s*[:：]/i;
const ITEM_ID_PATTERN = /item_id/i;
const SELECTED_ITEM_IDS_PATTERN = /selected_item_ids/i;

export function containsVisibleId(text: string): boolean {
  if (!text) return false;
  return (
    UUID_PATTERN.test(text) ||
    ID_LABEL_PATTERN.test(text) ||
    ITEM_ID_PATTERN.test(text) ||
    SELECTED_ITEM_IDS_PATTERN.test(text)
  );
}

export function sanitizeVisibleAiText(text: string): string {
  if (!text) return text;

  return text
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ""
    )
    .replace(/\(?\s*id\s*[:：]\s*[0-9a-f-]+\s*\)?/gi, "")
    .replace(/item_id/gi, "")
    .replace(/selected_item_ids/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([，。；、])/g, "$1")
    .trim();
}

export type VisibleAiTextFields = {
  title: string;
  summary: string;
  reasoning: string;
  occasion: string;
  style_tags: string[];
  alternatives: string[];
};

export function assertNoVisibleIdsInResponse(fields: VisibleAiTextFields): void {
  const texts = [
    fields.title,
    fields.summary,
    fields.reasoning,
    fields.occasion,
    ...fields.style_tags,
    ...fields.alternatives,
  ];

  for (const text of texts) {
    if (containsVisibleId(text)) {
      throw new Error("AI 返回包含内部编号，请重新生成");
    }
  }
}

export function sanitizeVisibleAiResponse<T extends VisibleAiTextFields>(
  response: T
): T {
  return {
    ...response,
    title: sanitizeVisibleAiText(response.title),
    summary: sanitizeVisibleAiText(response.summary),
    reasoning: sanitizeVisibleAiText(response.reasoning),
    occasion: sanitizeVisibleAiText(response.occasion),
    style_tags: response.style_tags.map(sanitizeVisibleAiText),
    alternatives: response.alternatives.map(sanitizeVisibleAiText),
  };
}
