# Horarium E2E tests

Run the headless suite with:

```bash
npm run test:e2e
```

This command starts the local Next.js development server when needed without opening a visible browser window. By default, the configuration uses installed Google Chrome when it is available.

Use Playwright's inspector with:

```bash
npm run test:e2e:debug
```

If Google Chrome is unavailable, Playwright automatically uses bundled Chromium. To select it explicitly, set `PLAYWRIGHT_CHANNEL=chromium`. For an explicit visible run, set `PLAYWRIGHT_HEADLESS=false`.
