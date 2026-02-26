import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:5174');
await page.waitForTimeout(3000);

// クリックしてポインターロック取得
await page.mouse.click(960, 540);
await page.waitForTimeout(500);

// ゲーム画面のスクリーンショット（メニュー前）
await page.screenshot({ path: 'ss-game.png' });

// ESC でポーズメニューを開く
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);

// ポーズメニューのスクリーンショット
await page.screenshot({ path: 'ss-menu-open.png' });

// 「右手武器」スロットをクリック
const slot = await page.$('.pm-slot[data-slot="rightHand"]');
if (slot) {
  await slot.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'ss-slot-selected.png' });
}

// アイテムリストから「骨の大剣」を選択
const items = await page.$$('.pm-item');
if (items.length >= 2) {
  await items[1].click(); // 2番目（骨の大剣）
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'ss-equip-greatsword.png' });
}

// 「鎧」スロットをクリック
const armorSlot = await page.$('.pm-slot[data-slot="armor"]');
if (armorSlot) {
  await armorSlot.click();
  await page.waitForTimeout(500);
  // 「獣骨の重鎧」を選択
  const armorItems = await page.$$('.pm-item');
  if (armorItems.length >= 2) {
    await armorItems[1].click(); // 2番目（獣骨の重鎧）
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'ss-equip-heavy-armor.png' });
  }
}

// プレビューキャンバスをドラッグして回転
const canvas = await page.$('#pmPreviewCanvas');
if (canvas) {
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(cx + i * 15, cy);
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'ss-preview-rotated.png' });
}

// ESC でメニューを閉じる
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.screenshot({ path: 'ss-menu-closed.png' });

// コンソールエラーチェック
const errors = [];
page.on('pageerror', err => errors.push(err.message));
await page.waitForTimeout(1000);
if (errors.length > 0) console.log('Errors:', errors);
else console.log('No console errors detected.');

console.log('Menu test screenshots saved!');
await browser.close();
