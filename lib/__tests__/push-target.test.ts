import { describe, expect, it } from "vitest";

import { buildPushUrl, formatReminderBody, pushTag, reminderTitle } from "@/lib/push-target";

describe("buildPushUrl", () => {
  it("routes event pushes to the events view with the id", () => {
    expect(buildPushUrl({ title: "t", body: "b", target: { view: "events", eventId: "e1" } })).toBe("/?push=events&event=e1");
  });

  it("routes event pushes without id to the events list", () => {
    expect(buildPushUrl({ title: "t", body: "b", target: { view: "events" } })).toBe("/?push=events");
  });

  it("routes note pushes with note, subject and comment refs", () => {
    const url = buildPushUrl({
      title: "t",
      body: "b",
      target: { view: "notes", noteId: "n1", subjectId: "s1", commentId: "c1" },
    });
    expect(url).toBe("/?push=notes&note=n1&subject=s1&comment=c1");
  });

  it("omits missing note refs", () => {
    expect(buildPushUrl({ title: "t", body: "b", target: { view: "notes" } })).toBe("/?push=notes");
  });
});

describe("formatReminderBody", () => {
  it("formats with code, DD/MM and HH:MM", () => {
    expect(formatReminderBody("Parcial", "RED", "2026-09-16", "18:00:00")).toBe("Parcial · RED · 16/09 18:00");
  });

  it("omits code and time when missing", () => {
    expect(formatReminderBody("Entrega", "", "2026-09-16", null)).toBe("Entrega · 16/09");
  });
});

describe("reminderTitle", () => {
  it("says manana for 1 day out", () => {
    expect(reminderTitle(1)).toBe("Se vence mañana");
  });

  it("counts days otherwise", () => {
    expect(reminderTitle(7)).toBe("Faltan 7 días");
  });
});

describe("pushTag", () => {
  it("collapses by event id", () => {
    expect(pushTag({ title: "t", body: "b", target: { view: "events", eventId: "e1" } })).toBe("horarium-event-e1");
  });

  it("collapses by note id", () => {
    expect(pushTag({ title: "t", body: "b", target: { view: "notes", noteId: "n1" } })).toBe("horarium-note-n1");
  });
});
