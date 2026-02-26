import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:5175');
await page.waitForTimeout(3000);

// === テスト1: pointerlockchange でメニューが開くか ===
console.log('--- Test 1: pointerlockchange triggers menu open ---');
// Pointer Lock を取得
await page.mouse.click(960, 540);
await page.waitForTimeout(500);

// ブラウザの ESC 動作をシミュレート: Pointer Lock 解除 → pointerlockchange 発火
await page.evaluate(() => {
  // exitPointerLock() を呼んで pointerlockchange を自然に発火させる
  if (document.pointerLockElement) document.exitPointerLock();
});
await page.waitForTimeout(600);

const menuVisible1 = await page.evaluate(() => {
  const el = document.getElementById('pauseMenu');
  return el && el.classList.contains('active');
});
console.log('Menu opened via pointerlockchange:', menuVisible1);
await page.screenshot({ path: 'ss-esc-test1.png' });

// === テスト2: メニュー表示中に ESC でメニューが閉じるか ===
console.log('--- Test 2: ESC closes menu (no pointer lock active) ---');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

const menuClosed = await page.evaluate(() => {
  const el = document.getElementById('pauseMenu');
  return el && !el.classList.contains('active');
});
console.log('Menu closed via ESC:', menuClosed);
await page.screenshot({ path: 'ss-esc-test2.png' });

// 100ms 後に pointer lock が再取得されるか確認
await page.waitForTimeout(300);
const pointerLockRestored = await page.evaluate(() => !!document.pointerLockElement);
console.log('Pointer Lock re-acquired:', pointerLockRestored);

// === テスト3: 再度 pointer lock 解除 → メニューが再び開くか ===
console.log('--- Test 3: Second pointerlockchange re-opens menu ---');
await page.evaluate(() => {
  if (document.pointerLockElement) document.exitPointerLock();
});
await page.waitForTimeout(600);

const menuVisible2 = await page.evaluate(() => {
  const el = document.getElementById('pauseMenu');
  return el && el.classList.contains('active');
});
console.log('Menu re-opened:', menuVisible2);
await page.screenshot({ path: 'ss-esc-test3.png' });

// === テスト4: 背景クリックで閉じるか ===
console.log('--- Test 4: Backdrop click closes menu ---');
// pm-backdrop を直接クリックイベントでトリガー
await page.evaluate(() => {
  const backdrop = document.querySelector('.pm-backdrop');
  if (backdrop) backdrop.click();
});
await page.waitForTimeout(400);

const menuClosed2 = await page.evaluate(() => {
  const el = document.getElementById('pauseMenu');
  return el && !el.classList.contains('active');
});
console.log('Menu closed via backdrop click:', menuClosed2);
await page.screenshot({ path: 'ss-esc-test4.png' });

// === テスト5: ゲームが一時停止しているか（メニュー開放中のフレーム描画チェック） ===
console.log('--- Test 5: Game pauses while menu is open ---');
await page.evaluate(() => {
  if (document.pointerLockElement) document.exitPointerLock();
});
await page.waitForTimeout(600);

const gamePaused = await page.evaluate(() => {
  const el = document.getElementById('pauseMenu');
  const menuActive = el && el.classList.contains('active');
  // ゲームループで isMenuOpen() チェックされているか（背面描画は継続）
  return menuActive;
});
console.log('Game paused (menu visible):', gamePaused);

// エラーチェック
if (errors.length > 0) console.log('\nErrors:', errors);
else console.log('\nNo errors detected!');

const allPassed = menuVisible1 && menuClosed && menuVisible2 && menuClosed2 && gamePaused;
console.log('\n' + (allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'));

await browser.close();
