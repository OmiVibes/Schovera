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

/** Select through the actual compact picker or the desktop roster, never hidden controls. */
export async function selectTeacherStudent(page, name) {
  await page.locator('.teacher-class-panel .chips button.active').waitFor();
  const picker = page.locator('.mobile-student-picker select');
  if (await picker.isVisible()) {
    await page.waitForFunction(() => document.querySelectorAll('.mobile-student-picker select option').length > 1);
    const options = await picker.locator('option').evaluateAll(nodes => nodes.filter(n => n.value).map(n => ({value:n.value,text:n.textContent})));
    const option = name ? options.find(n => n.text.includes(name)) : options[0];
    if (!option) throw new Error('Expected authorized student is absent from the mobile picker.');
    await picker.selectOption(option.value);
  } else {
    const rows = page.locator('#teacher-students button.student');
    await (name ? rows.filter({hasText:name}).first() : rows.first()).click();
  }
}
