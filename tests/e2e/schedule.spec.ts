import { expect, test } from "@playwright/test";

test.describe("Horarium schedule", () => {
  test("shows correct auth status for current mode", async ({ page }) => {
    await page.goto("/");
    const localBadge = page.getByTestId("auth-local-status");
    const signInButton = page.getByRole("button", { name: "Iniciar sesión", exact: true });
    await expect(localBadge.or(signInButton)).toBeVisible();
    if ((await localBadge.count()) > 0) {
      await expect(localBadge).toHaveText("Modo local");
      await expect(signInButton).toHaveCount(0);
    } else {
      await expect(signInButton).toBeVisible();
      await expect(localBadge).toHaveCount(0);
    }
  });

  test("keeps administration hidden while signed out (both modes)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const localBadge = page.getByTestId("auth-local-status");
    const signInButton = page.getByRole("button", { name: "Iniciar sesión", exact: true });
    await expect(localBadge.or(signInButton)).toBeVisible();
    if ((await localBadge.count()) > 0) {
      await expect(localBadge).toHaveText("Modo local");
    } else {
      await expect(signInButton).toBeVisible();
      await expect(localBadge).toHaveCount(0);
    }
      await expect(page.getByRole("button", { name: "Administración", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Importar horario local (11 sesiones)", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name: "Administración", exact: true })).toHaveCount(0);
  });

  test("shows the weekly schedule on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await expect(page.getByText("Horarium", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: / · Semana \d+$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Semana anterior" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Semana siguiente" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hoy", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Seleccionar fecha" })).toBeVisible();
    await expect(page.getByText("21:15", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("22:00", { exact: true })).toBeVisible();
    await expect(page.getByText("22:45", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("schedule-source-status")).toHaveCount(0);

    for (const day of ["Lun", "Mar", "Mié", "Jue", "Vie"]) {
      await expect(page.getByRole("paragraph").filter({ hasText: new RegExp(`^${day}$`) })).toBeVisible();
    }

    for (const subject of [
      "Administración de Sistemas de Información",
      "Redes de Datos",
      "Tecnología para la Automatización",
    ]) {
      await expect(page.getByText(subject, { exact: true }).first()).toBeVisible();
    }
  });

  test("navigates weeks and returns to today", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const heading = page.getByRole("heading", { name: / · Semana \d+$/ });
    const initialHeading = await heading.textContent();
    await page.getByRole("button", { name: "Semana siguiente" }).click();
    await expect(heading).not.toHaveText(initialHeading ?? "");
    await page.getByRole("button", { name: "Hoy", exact: true }).click();
    await expect(heading).toHaveText(initialHeading ?? "");
  });

  test("switches mobile days and hides the desktop sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const monday = page.getByRole("button", { name: /^Lun \d+$/ });
    const tuesday = page.getByRole("button", { name: /^Mar \d+$/ });
    await expect(monday).toBeVisible();
    await monday.click();
    await expect(page.getByRole("button", { name: /Administración de Sistemas de Información/ }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Ingeniería y Calidad de Software/ }).last()).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeHidden();

    await tuesday.click();
    await expect(page.getByRole("button", { name: /Ingeniería y Calidad de Software/ }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Nazar Patricia/ }).last()).toBeVisible();
  });

  test("hides and shows the desktop sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const sidebar = page.locator("aside").first();
    await expect(sidebar.getByRole("button", { name: "Inicio" })).toContainText("Inicio");
    await page.getByRole("button", { name: "Ocultar navegación" }).click();
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole("button", { name: "Mostrar navegación" })).toBeVisible();
    await page.getByRole("button", { name: "Mostrar navegación" }).click();
    await expect(page.getByRole("button", { name: "Ocultar navegación" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeVisible();
  });

  test("opens the mobile drawer, navigates, and closes it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    const drawer = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Materias" }).click();
    await expect(page.getByRole("heading", { name: "Materias" })).toBeVisible();
    await expect(drawer).toBeHidden();
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    await page.getByRole("button", { name: "Cerrar menú" }).click();
    await expect(drawer).toBeHidden();
  });

  test("renders every navigation view and synchronizes the theme setting", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const sidebar = page.getByRole("navigation", { name: "Navegación principal" });
    for (const [label, heading] of [["Inicio", "Bienvenido a Horarium"], ["Horario", / · Semana \d+$/], ["Notas", "Notas"], ["Materias", "Materias"], ["Profesores", "Profesores"], ["Aulas", "Aulas"], ["Configuración", "Configuración"]] as const) {
      await sidebar.getByRole("button", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    const headerTheme = page.getByRole("button", { name: "Cambiar a tema oscuro" });
    await headerTheme.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Cambiar a tema claro" })).toBeVisible();
    await page.getByRole("button", { name: "Oscuro" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Cambiar a tema oscuro" })).toBeVisible();
  });

  test("creates and deletes a shared event in local mode", async ({ page }) => {
    await page.goto("/");
    if ((await page.getByTestId("auth-local-status").count()) === 0) test.skip(true, "La prueba usa el fallback local");
    await page.getByRole("button", { name: "Eventos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Eventos" })).toBeVisible();
    await page.getByRole("button", { name: "Nuevo evento" }).click();
    const title = `Evento E2E ${await page.evaluate(() => crypto.randomUUID())}`;
    await page.getByLabel("Título").fill(title);
    await page.getByLabel("Fecha").fill("2099-05-20");
    await page.getByRole("button", { name: "Crear evento" }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const card = page.locator("article").filter({ hasText: title });
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  });

  test("hides event mutation controls from a signed-out remote visitor", async ({ page }) => {
    await page.goto("/");
    if ((await page.getByTestId("auth-local-status").count()) > 0) test.skip(true, "La prueba requiere el modo remoto sin sesión");
    await page.getByRole("button", { name: "Eventos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Eventos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo evento" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Eliminar" })).toHaveCount(0);
  });

  test("opens the local notes view, searches subjects, and selects one", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("horarium:notes:subject:ASI"));

    await page.getByRole("button", { name: "Notas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Notas" })).toBeVisible();
    await expect(page.getByText("Todavía no hay notas.")).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Buscar materias" });
    await search.fill("Administración");
    await expect(page.getByRole("button", { name: /Administración de Sistemas de Información/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Redes de Datos/ })).toBeHidden();
    await page.getByRole("button", { name: /Administración de Sistemas de Información/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("selects a Redes session and uses the accessible block menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    if ((await page.getByTestId("auth-local-status").count()) === 0) test.skip(true, "La prueba usa el fallback local");
    await page.evaluate(() => localStorage.removeItem("horarium:notes:subject:RED"));
    await page.getByRole("button", { name: "Notas", exact: true }).click();
    await page.getByRole("button", { name: /Redes de Datos/ }).click();

    const dialog = page.getByRole("dialog");
    const sessionSelect = dialog.getByRole("combobox", { name: "Horario usado como contexto" });
    await expect(sessionSelect).toHaveValue("");
    await sessionSelect.selectOption("redes-thursday-practice");
    await expect(dialog).toContainText("Jue · 19:00 – 21:15");

    await dialog.getByRole("button", { name: "Cambiar tipo del bloque 1" }).click();
    await expect(dialog.getByRole("menu")).toBeVisible();
    await dialog.getByRole("menuitem", { name: "Checklist" }).click();
    await expect(dialog.getByRole("menu")).toBeHidden();
    await dialog.getByRole("textbox", { name: "Texto del bloque 1" }).fill("Apuntes de práctica");
    await dialog.getByRole("button", { name: "Agregar nota", exact: true }).click();
    await expect(dialog).toContainText("Contexto: Jue · 19:00 – 21:15 · Práctica");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("horarium:notes:subject:RED"))).toContain("redes-thursday-practice");
  });

  test("opens and closes Monday subject details", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page
      .getByRole("button", { name: /Administración de Sistemas de Información/ })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Administración de Sistemas de Información" })).toBeVisible();

    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test("shows one Redes de Datos subject with all weekly sessions", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Materias", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Materias" })).toBeVisible();
    await expect(page.getByText("Redes de Datos", { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: /Redes de Datos/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Sesiones semanales", { exact: true })).toBeVisible();
    for (const session of ["Lun · 19:00 – 21:15", "Mar · 19:00 – 20:30", "Jue · 19:00 – 21:15"]) {
      await expect(dialog.getByText(session, { exact: true })).toBeVisible();
    }
  });

  test("uses Spanish day labels in the rooms catalog", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Aulas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Aulas" })).toBeVisible();
    await expect(page.getByText(/^(Lunes|Martes|Miércoles|Jueves|Viernes) ·/).first()).toBeVisible();
  });

  test("uses the selected previous-week class date in the modal", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Semana anterior" }).click();
    await page.getByRole("button", { name: /Administración de Sistemas de Información/ }).first().click();

    const expectedDate = await page.evaluate(() => {
      const today = new Date();
      const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) - 7);
      return monday.toLocaleDateString("es-AR", { day: "numeric", month: "long", weekday: "long", year: "numeric" });
    });
    await expect(page.getByRole("dialog")).toContainText(expectedDate);
  });

  test("persists local notes through edit and delete", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("horarium:notes:")) localStorage.removeItem(key);
      }
    });

    const subject = "Administración de Sistemas de Información";
    const noteText = `Nota local ${await page.evaluate(() => crypto.randomUUID())}`;
    const updatedNoteText = `${noteText} editada`;

    await page.getByRole("button", { name: subject }).first().click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill(noteText);
    await dialog.getByRole("button", { name: "Agregar nota", exact: true }).click();
    await expect(dialog.getByText(noteText, { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: subject }).first().click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByText(noteText, { exact: true })).toBeVisible();

    const noteCard = dialog.locator("article").filter({ hasText: noteText });
    await noteCard.getByRole("button", { name: "Editar", exact: true }).click();
    await dialog.getByRole("textbox").fill(updatedNoteText);
    await dialog.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(dialog.getByText(updatedNoteText, { exact: true })).toBeVisible();
    await expect(dialog.getByText(noteText, { exact: true })).toBeHidden();

    const updatedNoteCard = dialog.locator("article").filter({ hasText: updatedNoteText });
    await updatedNoteCard.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(dialog.getByText(updatedNoteText, { exact: true })).toBeHidden();
  });

  test("migrates legacy entry notes to the canonical subject key", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("horarium:notes:asi-monday-theory", JSON.stringify([{ id: "legacy-note", content: "Nota migrada", created_at: new Date().toISOString() }]));
    });
    await page.getByRole("button", { name: /Administración de Sistemas de Información/ }).first().click();
    await expect(page.getByRole("dialog")).toContainText("Nota migrada");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("horarium:notes:subject:ASI"))).toContain("Nota migrada");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("horarium:notes:asi-monday-theory"))).toBeNull();
  });
});
