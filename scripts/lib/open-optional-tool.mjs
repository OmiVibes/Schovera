// Exercise the same disclosure control as a person; retain all data/RLS assertions.
export async function openOptionalTool(page, id = 'school-entry-tools') {
  const disclosure = page.locator(`#${id}`);
  await disclosure.waitFor({ state: 'visible' });
  if (await disclosure.getAttribute('open') === null) {
    await disclosure.locator(':scope > summary').click();
  }
}
