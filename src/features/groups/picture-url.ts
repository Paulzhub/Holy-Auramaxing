/**
 * Group picture URLs (D-036). Safe for client and server code.
 *
 * Pictures are always served by the app at /api/group-picture/<group id>,
 * which checks that the viewer belongs to the group. The random file name
 * is passed as `v`, so a new picture gets a new URL.
 */
export const groupPicturePixels = { sm: 96, md: 96, lg: 256, xl: 256 } as const;
export type GroupPictureSize = keyof typeof groupPicturePixels;

export function groupPictureUrl(
  groupId: string,
  coverPath: string | null | undefined,
  size: GroupPictureSize,
): string | undefined {
  if (!coverPath) return undefined;
  const version = coverPath.slice(coverPath.indexOf("/") + 1);
  return `/api/group-picture/${groupId}?px=${groupPicturePixels[size]}&v=${encodeURIComponent(version)}`;
}
