/**
 * The only strings the last-resort error screen needs. global-error.tsx is
 * part of every page's JavaScript, so importing all of messages/en.json there
 * would ship every message to every visitor. global-error-messages.test.ts
 * checks these stay identical to messages/en.json, which remains the source.
 */
export const globalErrorMessages = {
  en: {
    app: { tabName: "Aura" },
    meta: { titleTemplate: "{page} | {app}", error: "Something went wrong" },
    errors: {
      errorTitle: "Something went wrong on our side",
      errorBody: "Your information is safe. Try again, and if it keeps happening, come back in a few minutes.",
      tryAgain: "Try again",
    },
  },
} as const;
