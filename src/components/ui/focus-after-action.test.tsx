import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { arrivalTarget, FocusAfterAction } from "./focus-after-action";

// Accessibility review 2 (A2-3, A2-4): after a form is sent and its page comes
// back, focus goes to the new notice, or to the main heading if it was lost.

function page(html: string) {
  document.body.innerHTML = `<main id="main">${html}</main>`;
}

/** Sends the form the way a server action does: a submit event, then a new page. */
function send(form: HTMLFormElement, submitter: HTMLElement) {
  submitter.focus();
  const event = new Event("submit", { bubbles: true, cancelable: true }) as SubmitEvent;
  Object.defineProperty(event, "submitter", { value: submitter });
  form.dispatchEvent(event);
}

describe("arrivalTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers a notice that wasn't there before", () => {
    page(`<p class="auth-banner" role="status" id="old">Old</p><h1>Title</h1>`);
    const before = new Set(document.querySelectorAll("main .auth-banner"));
    document
      .querySelector("main")!
      .insertAdjacentHTML("beforeend", `<p class="auth-banner" role="status" id="new">Saved.</p>`);
    expect(arrivalTarget(before, false)?.id).toBe("new");
  });

  it("leaves focus alone when nothing new appeared and focus wasn't lost", () => {
    page(`<p class="auth-banner" role="status">Old</p><h1>Title</h1>`);
    const before = new Set(document.querySelectorAll("main .auth-banner"));
    expect(arrivalTarget(before, false)).toBeNull();
  });

  it("falls back to an element the page marks, then to the main heading", () => {
    page(`<h1>Title</h1><h2 data-arrival-focus>Thanks</h2>`);
    expect(arrivalTarget(new Set(), true)?.textContent).toBe("Thanks");
    page(`<h1>Title</h1>`);
    expect(arrivalTarget(new Set(), true)?.tagName).toBe("H1");
  });

  it("ignores info banners that aren't status messages", () => {
    page(`<p class="auth-banner">Just information</p><h1>Title</h1>`);
    expect(arrivalTarget(new Set(), true)?.tagName).toBe("H1");
  });
});

describe("FocusAfterAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no layout.
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("moves focus to the new notice when the pressed button is gone", () => {
    render(<FocusAfterAction />);
    const main = document.createElement("main");
    main.innerHTML = `<h1>Alerts</h1><form><button type="submit">Mark as read</button></form>`;
    document.body.append(main);
    send(main.querySelector("form")!, main.querySelector("button")!);

    // The page comes back: the button is gone, a notice is there.
    main.innerHTML = `<p class="auth-banner" role="status">Marked as read.</p><h1>Alerts</h1>`;
    act(() => void vi.advanceTimersByTime(600));

    const notice = main.querySelector("p")!;
    expect(document.activeElement).toBe(notice);
    expect(notice).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus to the heading when focus was lost and there is no notice", () => {
    render(<FocusAfterAction />);
    const main = document.createElement("main");
    main.innerHTML = `<h1>Check in</h1><form><button type="submit">I stayed free today</button></form>`;
    document.body.append(main);
    send(main.querySelector("form")!, main.querySelector("button")!);
    main.innerHTML = `<h1>Thank you for checking in</h1>`;
    act(() => void vi.advanceTimersByTime(600));
    expect(document.activeElement?.textContent).toBe("Thank you for checking in");
  });

  it("does nothing when the person has moved on", () => {
    render(<FocusAfterAction />);
    const main = document.createElement("main");
    main.innerHTML = `<form><button type="submit">Save</button></form><a href="#x">Elsewhere</a>`;
    document.body.append(main);
    send(main.querySelector("form")!, main.querySelector("button")!);
    main.querySelector("a")!.focus();
    main.insertAdjacentHTML("afterbegin", `<p class="auth-banner" role="status">Saved.</p>`);
    act(() => void vi.advanceTimersByTime(600));
    expect(document.activeElement?.textContent).toBe("Elsewhere");
  });

  it("leaves forms that keep focus themselves alone", () => {
    render(<FocusAfterAction />);
    const main = document.createElement("main");
    main.innerHTML = `<form><button type="submit">Love</button></form>`;
    document.body.append(main);
    const button = main.querySelector("button")!;
    send(main.querySelector("form")!, button);
    act(() => void vi.advanceTimersByTime(600));
    expect(document.activeElement).toBe(button);
  });
});
