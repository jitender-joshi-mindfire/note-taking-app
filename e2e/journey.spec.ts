import { expect, test } from "@playwright/test";
import { getAccessToken, seedTagOnNote, seedUntaggedNote, uniqueEmail } from "./helpers";

function runToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

test("register, note, tag, search, share, version history", async ({ page, request }) => {
  const token = runToken();
  const email = uniqueEmail();
  const password = "correct-horse-battery-staple-1";
  const tagName = `journey-tag-${token}`;
  const firstTitle = `Journey first revision ${token}`;
  const firstBody = `First revision body ${token}`;
  const secondTitle = `Journey second revision ${token}`;
  const secondBody = `Second revision body ${token}`;

  // Step 1: Register.
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`Logged in as ${email}`)).toBeVisible();

  // Step 2: Create and edit a note twice, accumulating retained versions.
  await page.getByRole("link", { name: "New note" }).click();
  const titleInput = page.getByLabel("Title");
  await expect(titleInput).toHaveValue("Untitled");
  const noteId = new URL(page.url()).pathname.split("/").pop() as string;
  const editorBody = page.locator(".ProseMirror");

  function waitForSave() {
    return page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().endsWith(`/notes/${noteId}`) &&
        response.ok(),
    );
  }

  await titleInput.fill(firstTitle);
  await editorBody.click();
  await page.keyboard.type(firstBody);
  await waitForSave();

  await titleInput.fill(secondTitle);
  await editorBody.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(secondBody);
  await waitForSave();

  // Step 3: Tag filtering — seed a tag (and a throwaway untagged note) via the API,
  // since no frontend UI creates or attaches tags, then verify filtering in the real UI.
  const accessToken = await getAccessToken(page);
  await seedTagOnNote(request, accessToken, noteId, tagName);
  const untagged = await seedUntaggedNote(request, accessToken);
  void untagged;

  await page.goto("/notes");
  await page.getByRole("button", { name: tagName }).click();
  await expect(page.getByText(secondTitle)).toBeVisible();
  await expect(page.getByText("Untagged fixture note")).not.toBeVisible();

  // Step 4: Search finds the note by a distinctive word from its current content.
  await page.getByRole("link", { name: "Search" }).click();
  await page.getByLabel("Search notes").fill(token);
  await expect(page.getByText(secondTitle)).toBeVisible();

  // Step 5: Share — generate a link through the UI, then verify public access
  // via an unauthenticated HTTP request (the share link is a backend JSON endpoint,
  // there is no frontend page that renders it).
  await page.goto(`/notes/${noteId}`);
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("button", { name: "Generate" }).click();
  const shareUrl = await page.locator("p.break-all").innerText();
  const shareResponse = await request.get(shareUrl);
  expect(shareResponse.ok()).toBe(true);
  const sharedNote = (await shareResponse.json()) as { title: string; content: string };
  expect(sharedNote.title).toBe(secondTitle);
  expect(sharedNote.content).toContain(secondBody);

  // Step 6: Version history restore — select the version matching the first edit's
  // distinctive title (not by list position/count, see design.md Decision 6), restore it,
  // and confirm the live editor updates in place.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "History" }).click();
  await page.getByText(firstTitle, { exact: true }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(titleInput).toHaveValue(firstTitle);
  await expect(editorBody).toContainText(firstBody);
});
