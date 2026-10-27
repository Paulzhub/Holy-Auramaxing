/**
 * The landing page and its scroll story (D-118, D-121). Only `/` imports this
 * entry, so the story's small client component (and, much later, the 3D
 * chunks it loads on demand) never reach any other page.
 */
export { Landing } from "./components/landing";
