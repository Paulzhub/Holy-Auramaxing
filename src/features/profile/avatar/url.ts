/**
 * Avatar URLs (D-026). Safe for client and server code.
 *
 * Avatars are always served by the app at /api/avatar/<user id>, which
 * checks that the viewer may see that profile. The random file name is
 * passed as `v`, so a new photo gets a new URL and old ones expire from
 * every cache naturally.
 */
export const avatarPixelsFor = { sm: 96, md: 96, lg: 256, xl: 256 } as const;
export type AvatarSize = keyof typeof avatarPixelsFor;

export function avatarUrl(userId: string, avatarPath: string | null | undefined, size: AvatarSize): string | undefined {
  if (!avatarPath) return undefined;
  const version = avatarPath.slice(avatarPath.indexOf("/") + 1);
  return `/api/avatar/${userId}?px=${avatarPixelsFor[size]}&v=${encodeURIComponent(version)}`;
}
