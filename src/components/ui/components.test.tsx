import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/intl";

import { Avatar, initialsFor } from "./avatar";
import { Button } from "./button";
import { ProgressRing, ringOffset } from "./progress-ring";
import { ReactionBar } from "./reaction-bar";
import { TextField } from "./text-field";

describe("Button", () => {
  it("calls onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("stays focusable but inert when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("announces loading and blocks repeat submits", () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Saving" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Save\s*Saving/ });
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("TextField", () => {
  it("links label, hint and error to the input", () => {
    render(<TextField id="name" label="Display name" hint="Shown to your group" error="Too short" />);
    const input = screen.getByLabelText("Display name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Shown to your group Too short");
  });

  it("is valid when there is no error", () => {
    render(<TextField id="name" label="Display name" />);
    expect(screen.getByLabelText("Display name")).not.toHaveAttribute("aria-invalid");
  });
});

describe("Avatar", () => {
  it("builds initials from first and last names", () => {
    expect(initialsFor("Grace Thomas")).toBe("GT");
    expect(initialsFor("  priya   devi lal ")).toBe("PL");
    expect(initialsFor("Joel")).toBe("J");
    expect(initialsFor("")).toBe("");
  });

  it("names the initials fallback for screen readers", () => {
    render(<Avatar name="Grace Thomas" />);
    expect(screen.getByRole("img", { name: "Grace Thomas" })).toHaveTextContent("GT");
  });

  it("falls back to initials when the photo fails", () => {
    render(<Avatar name="Grace Thomas" src="/missing.png" />);
    fireEvent.error(screen.getByRole("img", { name: "Grace Thomas" }));
    expect(screen.getByRole("img", { name: "Grace Thomas" })).toHaveTextContent("GT");
  });

  it("hides decorative avatars from assistive tech", () => {
    const { container } = render(<Avatar name="Grace Thomas" decorative />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("ProgressRing", () => {
  it("exposes value and spoken text", () => {
    render(<ProgressRing value={3} max={10} label="Progress to next level" valueText="3 of 10 days" />);
    const ring = screen.getByRole("progressbar", { name: "Progress to next level" });
    expect(ring).toHaveAttribute("aria-valuenow", "3");
    expect(ring).toHaveAttribute("aria-valuemax", "10");
    expect(ring).toHaveAttribute("aria-valuetext", "3 of 10 days");
  });

  it("clamps the arc between empty and full", () => {
    expect(ringOffset(0, 10)).toBeCloseTo(2 * Math.PI * 44);
    expect(ringOffset(10, 10)).toBe(0);
    expect(ringOffset(15, 10)).toBe(0);
    expect(ringOffset(-2, 10)).toBeCloseTo(2 * Math.PI * 44);
    expect(ringOffset(1, 0)).toBeCloseTo(2 * Math.PI * 44);
  });
});

describe("ReactionBar", () => {
  it("labels each reaction with its count and pressed state", () => {
    const onToggle = vi.fn();
    renderWithIntl(
      <ReactionBar
        reactions={[
          { kind: "pray", count: 1, mine: true },
          { kind: "heart", count: 0, mine: false },
        ]}
        onToggle={onToggle}
      />,
    );
    const pray = screen.getByRole("button", { name: "Praying, 1 reaction" });
    expect(pray).toHaveAttribute("aria-pressed", "true");
    const heart = screen.getByRole("button", { name: "Love, no reactions" });
    fireEvent.click(heart);
    expect(onToggle).toHaveBeenCalledWith("heart");
  });

  it("does not toggle while disabled", () => {
    const onToggle = vi.fn();
    renderWithIntl(<ReactionBar reactions={[{ kind: "dove", count: 2, mine: false }]} onToggle={onToggle} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Peace, 2 reactions" }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
