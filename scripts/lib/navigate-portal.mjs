/** Drive the same visible navigation that a keyboard/touch user can access. */
export async function navigatePortal(page, role, section) {
  const target = `/${role}/${section}`;
  const direct = page.locator(`nav.app-section-nav a[href="${target}"]`);
  if (await direct.isVisible()) await direct.click();
  else {
    const menu = page.locator('.portal-more-menu');
    if (await menu.getAttribute('open') === null) await menu.locator('summary').click();
    await menu.locator(`a[href="${target}"]`).click();
  }
  await page.waitForURL(url => url.pathname === target);
}
