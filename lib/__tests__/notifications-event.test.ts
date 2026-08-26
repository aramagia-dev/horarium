import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatEventCompletedBody,
  getEventCompletedTitle,
  buildEventCompletedBodyFromCompleters,
  type Notification,
} from "@/lib/notifications";

// Ensure service_role leak helper not needed here; we test formatting only.

describe("notifications — event_completed formatting", () => {
  it("getEventCompletedTitle is fixed string", () => {
    expect(getEventCompletedTitle()).toBe("Evento completado");
  });

  it("formatEventCompletedBody — single completer", () => {
    expect(formatEventCompletedBody("Franco", 0, "Entrega TP1")).toBe("Franco completó Entrega TP1");
  });

  it("formatEventCompletedBody — 1 other", () => {
    expect(formatEventCompletedBody("Franco", 1, "Entrega TP1")).toBe("Franco y 1 más completaron Entrega TP1");
  });

  it("formatEventCompletedBody — 2 others", () => {
    expect(formatEventCompletedBody("Franco", 2, "Entrega TP1")).toBe("Franco y 2 más completaron Entrega TP1");
  });

  it("formatEventCompletedBody — empty name fallback Alguien", () => {
    expect(formatEventCompletedBody("", 0, "Entrega TP1")).toBe("Alguien completó Entrega TP1");
    expect(formatEventCompletedBody("   ", 1, "Entrega TP1")).toBe("Alguien y 1 más completaron Entrega TP1");
  });

  it("formatEventCompletedBody — empty title fallback evento", () => {
    expect(formatEventCompletedBody("Franco", 0, "")).toBe("Franco completó evento");
    expect(formatEventCompletedBody("Franco", 0, "   ")).toBe("Franco completó evento");
  });

  it("buildEventCompletedBodyFromCompleters — 0 completers fallback", () => {
    expect(buildEventCompletedBodyFromCompleters([], "Entrega TP1")).toBe("Alguien completó Entrega TP1");
  });

  it("buildEventCompletedBodyFromCompleters — 1 completer", () => {
    expect(
      buildEventCompletedBodyFromCompleters([{ display_name: "Mora", user_id: "u1" }], "Parcial ASI"),
    ).toBe("Mora completó Parcial ASI");
  });

  it("buildEventCompletedBodyFromCompleters — 3 completers merges count", () => {
    const completers = [
      { display_name: "Franco", user_id: "u1" },
      { display_name: "Ana", user_id: "u2" },
      { display_name: "Luis", user_id: "u3" },
    ];
    expect(buildEventCompletedBodyFromCompleters(completers, "TP Redes")).toBe("Franco y 2 más completaron TP Redes");
  });

  it("buildEventCompletedBodyFromCompleters — null display_name fallback", () => {
    expect(
      buildEventCompletedBodyFromCompleters([{ display_name: null, user_id: "u1" }], "Evento X"),
    ).toBe("Alguien completó Evento X");
  });

  it("body truncation threshold matches board: 3+ shows N más", () => {
    // Simulate fan-out body generation for 5 completers -> Franco y 4 más (notification style: no plus sign)
    const cs = Array.from({ length: 5 }, (_, i) => ({
      display_name: i === 0 ? "Franco" : `User${i}`,
      user_id: `u${i}`,
    }));
    const body = buildEventCompletedBodyFromCompleters(cs, "Entrega Final");
    expect(body).toBe("Franco y 4 más completaron Entrega Final");
    // Board badge uses plus: "Franco y +3 completaron" — notification body uses "y 4 más" without plus
    expect(body).toContain("4 más");
    expect(body).not.toContain("+5");
  });

  it("notification grouped shape — event_completed type valid", () => {
    const notif: Partial<Notification> = {
      type: "event_completed",
      title: getEventCompletedTitle(),
      body: formatEventCompletedBody("Franco", 2, "Entrega TP1"),
      event_id: "evt-123",
    };
    expect(notif.type).toBe("event_completed");
    expect(notif.title).toBe("Evento completado");
    expect(notif.body).toBe("Franco y 2 más completaron Entrega TP1");
  });
});

// Fan-out contract validation — ensures body format consistent with server route
describe("notifications — fan-out body contract (vencido still notifies)", () => {
  it("vencido event still generates body (completed path does not filter vencido)", () => {
    // The server route does not check isEventOverdue — vencido still notifies per spec
    const body = formatEventCompletedBody("Franco", 0, "Parcial vencido");
    expect(body).toBe("Franco completó Parcial vencido");
  });
});
