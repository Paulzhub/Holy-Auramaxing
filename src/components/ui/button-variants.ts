import { cva } from "class-variance-authority";

/** Shared by <Button> and by links styled as buttons (usable in Server Components). */
export const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      primary: "ui-button--primary",
      secondary: "ui-button--secondary",
      ghost: "ui-button--ghost",
    },
    size: {
      sm: "ui-button--sm",
      md: "",
      lg: "ui-button--lg",
      icon: "ui-button--icon",
    },
  },
  defaultVariants: { variant: "primary", size: "md" },
});
