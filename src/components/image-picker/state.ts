/**
 * Shared by the square image picker (avatars and group pictures) and the
 * Server Actions behind it. Safe for client and server code.
 */

/** Keys under "<namespace>.errors" in messages/en.json. */
export type ImageErrorKey =
  "avatarType" | "avatarSize" | "avatarUnreadable" | "avatarTooSmall" | "rateLimited" | "saveFailed";

export interface ImageFormState {
  status: "idle" | "uploaded" | "removed" | "error";
  error?: ImageErrorKey;
}

/**
 * Where a picker's copy lives. Both sections have the same keys (a unit test
 * checks), and "<namespace>.errors" holds the ImageErrorKey messages.
 */
export type ImageMessages = "profile.avatar" | "groups.picture";

export function imageErrorNamespace(messages: ImageMessages): "profile.errors" | "groups.errors" {
  return messages === "profile.avatar" ? "profile.errors" : "groups.errors";
}

/** Maps SquareImageError reasons to message keys. */
export const imageErrorKeys = {
  type: "avatarType",
  size: "avatarSize",
  unreadable: "avatarUnreadable",
  tooSmall: "avatarTooSmall",
} as const satisfies Record<string, ImageErrorKey>;
