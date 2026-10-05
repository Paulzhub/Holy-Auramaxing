/**
 * Field limits and choices shared by the forms (client) and the schemas
 * (server). No imports: Zod stays on the server (D-010), so client
 * components take their constants from here, never from the schema files.
 */
export const DISPLAY_NAME_MAX = 40;
export const MY_WHY_MAX = 500;
export const BIO_MAX = 280;
export const TESTIMONY_MAX = 2000;
export const VERSE_MAX = 200;
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export const visibilities = ["groups", "partners", "nobody"] as const;
export type Visibility = (typeof visibilities)[number];
