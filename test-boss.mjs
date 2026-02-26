import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:5173');

// ゲームのロード待ち
await page.waitForTimeout(3000);

// クリックしてポインターロック取得
await page.mouse.click(960, 540);
await page.waitForTimeout(500);

// ボスエリアまで移動（前進: W キー長押し）
// まず前方に進んでフォグゲートへ
await page.keyboard.down('w');
await page.waitForTimeout(6000);
await page.keyboard.up('w');

// スクリーンショット1: フォグゲート付近
await page.screenshot({ path: 'screenshot-foggate.png' });

// Eキーでフォグゲートに入る
await page.keyboard.press('e');
await page.waitForTimeout(3000);

// スクリーンショット2: ボスエリア入場
await page.screenshot({ path: 'screenshot-boss-entrance.png' });

// ボスに近づく
await page.keyboard.down('w');
await page.waitForTimeout(3000);
await page.keyboard.up('w');

// ロックオン（Tab）
await page.keyboard.press('Tab');
await page.waitForTimeout(500);

// スクリーンショット3: ボスの全身（ロックオン状態）
await page.screenshot({ path: 'screenshot-boss-lockon.png' });

// さらに近づく
await page.keyboard.down('w');
await page.waitForTimeout(2000);
await page.keyboard.up('w');

// スクリーンショット4: ボス近接
await page.screenshot({ path: 'screenshot-boss-close.png' });

// ボスが攻撃してくるのを待つ
await page.waitForTimeout(3000);

// スクリーンショット5: ボス攻撃中（デバッグヒットボックス可視化確認）
await page.screenshot({ path: 'screenshot-boss-attack.png' });

console.log('Screenshots saved!');
await browser.close();
