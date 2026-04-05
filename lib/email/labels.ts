const GMAIL_LABEL_MAP: Record<string, string> = {
  INBOX: "Inbox",
  SENT: "Sent",
  IMPORTANT: "Important",
  STARRED: "Starred",
  SPAM: "Spam",
  TRASH: "Trash",
  DRAFT: "Draft",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_PERSONAL: "Personal",
};

const HIDDEN_LABELS = new Set(["UNREAD", "INBOX", "SENT", "DRAFT", "SPAM", "TRASH"]);

export function labelDisplay(labelId: string): string | null {
  if (HIDDEN_LABELS.has(labelId)) return null;
  return GMAIL_LABEL_MAP[labelId] ?? labelId.replace(/^Label_/, "");
}
