// ============================================================
//  ui.js — ダークソウル風ポーズメニュー（装備・ステータス・3Dプレビュー）
// ============================================================
import * as THREE from 'three';
import { scene, renderer, camera, envMap, boneTex, boneNormal, getBoxGeo, getCylGeo } from './world.js';

// ============================================================
//  Google Fonts 動的読み込み（Cinzel — 中世セリフ体）
// ============================================================
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap';
document.head.appendChild(fontLink);

// ============================================================
//  装備データ定義 — 骨の武器・防具
// ============================================================
export const EQUIPMENT_DB = {
  // 右手武器
  rightHand: [
    { id: 'bone_sword',     name: '骨の直剣',   attack: 10, weight: 3,  desc: '巨獣の脛骨から削り出された直剣' },
    { id: 'bone_greatsword',name: '骨の大剣',   attack: 22, weight: 8,  desc: '脊椎の残骸を束ねた重厚な大剣' },
    { id: 'bone_dagger',    name: '骨の短剣',   attack: 6,  weight: 1,  desc: '指骨を研いだ素早い短剣' },
    { id: 'bone_mace',      name: '骨の棍棒',   attack: 16, weight: 6,  desc: '大腿骨そのものを武器にした棍棒' },
  ],
  // 左手武器
  leftHand: [
    { id: 'none',           name: 'なし',       defense: 0,  weight: 0, desc: '' },
    { id: 'bone_shield',    name: '骨の盾',     defense: 15, weight: 4, desc: '肩甲骨を加工した小盾' },
    { id: 'bone_greatshield',name:'骨の大盾',   defense: 30, weight: 10,desc: '骨盤を丸ごと用いた大盾' },
  ],
  // 兜
  helmet: [
    { id: 'none',           name: 'なし',       defense: 0,  poise: 0, weight: 0, desc: '' },
    { id: 'bone_helm',      name: '骨の兜',     defense: 5,  poise: 5, weight: 3, desc: '頭蓋骨を被る原始的な兜' },
    { id: 'beast_skull',    name: '獣の頭蓋',   defense: 8,  poise: 10,weight: 5, desc: '巨獣の頭蓋を模した威圧的な兜' },
  ],
  // 鎧
  armor: [
    { id: 'bone_armor',     name: '骨の鎧',     defense: 10, poise: 8,  weight: 6,  desc: '肋骨を編み込んだ軽鎧' },
    { id: 'beast_armor',    name: '獣骨の重鎧', defense: 20, poise: 20, weight: 14, desc: '巨獣の骨で全身を覆う重鎧' },
    { id: 'moss_robe',      name: '苔むす法衣', defense: 4,  poise: 2,  weight: 2,  desc: '発光苔に覆われた古い法衣' },
  ],
  // 手甲
  gauntlets: [
    { id: 'none',           name: 'なし',       defense: 0, poise: 0, weight: 0, desc: '' },
    { id: 'bone_gauntlets', name: '骨の手甲',   defense: 3, poise: 3, weight: 2, desc: '指骨を連結した手甲' },
    { id: 'beast_gauntlets',name: '獣骨の手甲', defense: 6, poise: 6, weight: 4, desc: '爪付きの獣骨手甲' },
  ],
  // 足甲
  leggings: [
    { id: 'none',           name: 'なし',       defense: 0, poise: 0, weight: 0, desc: '' },
    { id: 'bone_leggings',  name: '骨の足甲',   defense: 3, poise: 2, weight: 2, desc: '脛骨を当てた足甲' },
    { id: 'beast_leggings', name: '獣骨の足甲', defense: 5, poise: 5, weight: 4, desc: '分厚い獣骨の脛当て' },
  ],
  // 指輪
  ring: [
    { id: 'none',         name: 'なし',       effect: '', bonus: {}, desc: '' },
    { id: 'poise_ring',   name: '強靭の指輪', effect: '強靭+10', bonus: { poise: 10 }, desc: '古の獣の爪から削り出した指輪' },
    { id: 'hp_ring',      name: '生命の指輪', effect: 'HP+20',   bonus: { hp: 20 },    desc: '脈打つ苔が巻き付いた指輪' },
    { id: 'stamina_ring', name: '緑花の指輪', effect: 'ST回復+5',bonus: { stRegen: 5 },desc: '緑の胞子を放つ不思議な指輪' },
    { id: 'attack_ring',  name: '獣の爪輪',   effect: '攻撃+5',  bonus: { attack: 5 }, desc: '装備者に獣の力を与える' },
  ],
};

// 現在の装備状態
export const equipped = {
  rightHand: 0,  // EQUIPMENT_DB.rightHand のインデックス
  leftHand:  0,
  helmet:    1,
  armor:     0,
  gauntlets: 1,
  leggings:  1,
  ring1:     0,
  ring2:     0,
};

// ステータス計算
export function calcStats(baseStats) {
  const rh = EQUIPMENT_DB.rightHand[equipped.rightHand];
  const lh = EQUIPMENT_DB.leftHand[equipped.leftHand];
  const hm = EQUIPMENT_DB.helmet[equipped.helmet];
  const ar = EQUIPMENT_DB.armor[equipped.armor];
  const ga = EQUIPMENT_DB.gauntlets[equipped.gauntlets];
  const lg = EQUIPMENT_DB.leggings[equipped.leggings];
  const r1 = EQUIPMENT_DB.ring[equipped.ring1];
  const r2 = EQUIPMENT_DB.ring[equipped.ring2];

  let attack = (rh?.attack || 0) + (r1?.bonus?.attack || 0) + (r2?.bonus?.attack || 0);
  let defense = (lh?.defense || 0) + (hm?.defense || 0) + (ar?.defense || 0) + (ga?.defense || 0) + (lg?.defense || 0);
  let poise = (hm?.poise || 0) + (ar?.poise || 0) + (ga?.poise || 0) + (lg?.poise || 0) + (r1?.bonus?.poise || 0) + (r2?.bonus?.poise || 0);
  let bonusHp = (r1?.bonus?.hp || 0) + (r2?.bonus?.hp || 0);
  let bonusStRegen = (r1?.bonus?.stRegen || 0) + (r2?.bonus?.stRegen || 0);

  return {
    attack, defense, poise, bonusHp, bonusStRegen,
    totalWeight: (rh?.weight||0) + (lh?.weight||0) + (hm?.weight||0) + (ar?.weight||0) + (ga?.weight||0) + (lg?.weight||0),
  };
}

// ============================================================
//  3D プレビュー用サブカメラ + RenderTarget
// ============================================================
const PREVIEW_SIZE = 320;
const previewRT = new THREE.WebGLRenderTarget(PREVIEW_SIZE, PREVIEW_SIZE * 1.4, {
  samples: 4, // MSAAアンチエイリアス
});
const previewCamera = new THREE.PerspectiveCamera(35, PREVIEW_SIZE / (PREVIEW_SIZE * 1.4), 0.1, 50);
previewCamera.position.set(0, 1.2, 4.5);
previewCamera.lookAt(0, 1.0, 0);

// プレビュー用ライト（メインシーンとは別に制御）
const previewLight = new THREE.DirectionalLight(0xfff8e0, 7.0);
previewLight.position.set(3, 5, 4);

let previewRotation = 0;
let previewDragging = false;
let previewLastX = 0;

export function renderPreview(playerGroup) {
  // プレビューライトをシーンに一時追加
  scene.add(previewLight);

  // カメラ位置をプレイヤー周辺に設定（回転対応）
  const cx = playerGroup.position.x + Math.sin(previewRotation) * 4.5;
  const cz = playerGroup.position.z + Math.cos(previewRotation) * 4.5;
  previewCamera.position.set(cx, playerGroup.position.y + 1.2, cz);
  previewCamera.lookAt(playerGroup.position.x, playerGroup.position.y + 1.0, playerGroup.position.z);

  // RTへ描画
  const oldTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(previewRT);
  renderer.render(scene, previewCamera);
  renderer.setRenderTarget(oldTarget);

  // ライト撤去
  scene.remove(previewLight);

  // Canvas へコピー
  if (previewCanvas) {
    const pCtx = previewCanvas.getContext('2d');
    // WebGLRenderTarget → readPixels → ImageData
    const w = previewRT.width, h = previewRT.height;
    const pixels = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(previewRT, 0, 0, w, h, pixels);
    const imgData = pCtx.createImageData(w, h);
    // WebGL の Y 軸反転を修正
    for (let y = 0; y < h; y++) {
      const srcRow = (h - 1 - y) * w * 4;
      const dstRow = y * w * 4;
      for (let x = 0; x < w * 4; x++) {
        imgData.data[dstRow + x] = pixels[srcRow + x];
      }
    }
    pCtx.putImageData(imgData, 0, 0);
  }
}

// ============================================================
//  Web Audio サウンド（メニュー操作音）
// ============================================================
let menuAudioCtx = null;
function getMenuAudio() {
  if (!menuAudioCtx) menuAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (menuAudioCtx.state === 'suspended') menuAudioCtx.resume();
  return menuAudioCtx;
}

// メニュー開閉：低音の石板が開くような「ズオッ」音
export function playMenuOpenSound() {
  const ctx = getMenuAudio(); const now = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.15, now + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.3);
  // ノイズ層
  const bufSize = Math.floor(ctx.sampleRate * 0.15);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
  const ns = ctx.createBufferSource(); ns.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.08, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  ns.connect(lp).connect(ng).connect(ctx.destination);
  ns.start(now); ns.stop(now + 0.2);
}

// メニュー閉じ：逆の上昇音
export function playMenuCloseSound() {
  const ctx = getMenuAudio(); const now = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(60, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.25);
}

// 項目選択：「カチッ」
export function playMenuSelectSound() {
  const ctx = getMenuAudio(); const now = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = 'square';
  osc.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.06, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.04);
}

// 装備変更：重厚な金属音「ガチャッ」
export function playEquipSound() {
  const ctx = getMenuAudio(); const now = ctx.currentTime;
  // 金属衝撃
  const osc1 = ctx.createOscillator(); osc1.type = 'square'; osc1.frequency.value = 400;
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.15, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc1.connect(g1).connect(ctx.destination);
  osc1.start(now); osc1.stop(now + 0.08);
  // 低音の残響
  const osc2 = ctx.createOscillator(); osc2.type = 'sine';
  osc2.frequency.setValueAtTime(200, now);
  osc2.frequency.exponentialRampToValueAtTime(80, now + 0.15);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.1, now + 0.02);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(now); osc2.stop(now + 0.2);
  // ノイズ
  const bufSize = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const ns = ctx.createBufferSource(); ns.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.1, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  ns.connect(bp).connect(ng).connect(ctx.destination);
  ns.start(now); ns.stop(now + 0.06);
}

// ============================================================
//  DOM 構築 — ポーズメニュー
// ============================================================
const SLOT_LABELS = {
  rightHand: '右手武器', leftHand: '左手武器',
  helmet: '兜', armor: '鎧', gauntlets: '手甲', leggings: '足甲',
  ring1: '指輪1', ring2: '指輪2',
};
const SLOT_ICONS = {
  rightHand: '\u2694', leftHand: '\u{1F6E1}',
  helmet: '\u{1FA96}', armor: '\u{1F6E1}', gauntlets: '\u270B', leggings: '\u{1F462}',
  ring1: '\u{1F48D}', ring2: '\u{1F48D}',
};

const pauseOverlay = document.createElement('div');
pauseOverlay.id = 'pauseMenu';
pauseOverlay.innerHTML = `
  <div class="pm-backdrop"></div>

  <!-- メインポーズメニュー -->
  <div class="pm-main-menu" id="pmMainMenu">
    <h2 class="pm-main-title">PAUSE</h2>
    <div class="pm-main-buttons">
      <button class="pm-main-btn" data-view="equipment">
        <span class="pm-main-btn-icon">\u2694</span>
        <span class="pm-main-btn-label">装備</span>
        <span class="pm-main-btn-sub">Equipment</span>
      </button>
      <button class="pm-main-btn" data-view="options">
        <span class="pm-main-btn-icon">\u2699</span>
        <span class="pm-main-btn-label">設定</span>
        <span class="pm-main-btn-sub">Options</span>
      </button>
      <button class="pm-main-btn" data-view="resume">
        <span class="pm-main-btn-icon">\u25B6</span>
        <span class="pm-main-btn-label">ゲームに戻る</span>
        <span class="pm-main-btn-sub">Resume</span>
      </button>
    </div>
    <div class="pm-hint">ESC で閉じる</div>
  </div>

  <!-- 装備サブメニュー -->
  <div class="pm-panel pm-sub-view" id="pmEquipmentView" style="display:none">
    <div class="pm-left">
      <div class="pm-sub-header">
        <button class="pm-back-btn" id="pmEquipBack">\u25C0 戻る</button>
        <h2 class="pm-title">EQUIPMENT</h2>
      </div>
      <div class="pm-slots" id="pmSlots"></div>
      <div class="pm-item-list" id="pmItemList"></div>
    </div>
    <div class="pm-right">
      <div class="pm-preview-wrap">
        <canvas id="pmPreviewCanvas" width="${PREVIEW_SIZE}" height="${Math.floor(PREVIEW_SIZE * 1.4)}"></canvas>
      </div>
      <div class="pm-stats" id="pmStats"></div>
    </div>
  </div>

  <!-- 設定サブメニュー -->
  <div class="pm-options-panel pm-sub-view" id="pmOptionsView" style="display:none">
    <div class="pm-sub-header">
      <button class="pm-back-btn" id="pmOptionsBack">\u25C0 戻る</button>
      <h2 class="pm-title">OPTIONS</h2>
    </div>
    <div class="pm-options-content">
      <div class="pm-option-row">
        <label class="pm-option-label">明るさ (Brightness)</label>
        <div class="pm-option-control">
          <input type="range" id="pmBrightness" class="pm-slider" min="0.5" max="6.0" step="0.1" value="4.5">
          <span class="pm-option-value" id="pmBrightnessVal">4.50</span>
        </div>
      </div>
      <div class="pm-option-row">
        <label class="pm-option-label">BGM 音量</label>
        <div class="pm-option-control">
          <input type="range" id="pmBgmVol" class="pm-slider" min="0" max="1.0" step="0.05" value="0.5">
          <span class="pm-option-value" id="pmBgmVolVal">0.50</span>
        </div>
      </div>
      <div class="pm-option-row">
        <label class="pm-option-label">SE 音量</label>
        <div class="pm-option-control">
          <input type="range" id="pmSeVol" class="pm-slider" min="0" max="1.0" step="0.05" value="0.8">
          <span class="pm-option-value" id="pmSeVolVal">0.80</span>
        </div>
      </div>
    </div>
  </div>
`;
document.body.appendChild(pauseOverlay);

const previewCanvas = document.getElementById('pmPreviewCanvas');

// スロットボタン生成
const slotsContainer = document.getElementById('pmSlots');
const slotKeys = ['rightHand', 'leftHand', 'helmet', 'armor', 'gauntlets', 'leggings', 'ring1', 'ring2'];
slotKeys.forEach(key => {
  const btn = document.createElement('button');
  btn.className = 'pm-slot';
  btn.dataset.slot = key;
  btn.innerHTML = `<span class="pm-slot-icon">${SLOT_ICONS[key]}</span><span class="pm-slot-label">${SLOT_LABELS[key]}</span><span class="pm-slot-name" id="slotName_${key}">---</span>`;
  slotsContainer.appendChild(btn);
});

// ============================================================
//  スタイル
// ============================================================
const pmStyle = document.createElement('style');
pmStyle.textContent = `
  #pauseMenu{display:none;position:fixed;inset:0;z-index:200;font-family:'Cinzel',Georgia,'Times New Roman',serif}
  #pauseMenu.active{display:flex;justify-content:center;align-items:center}
  .pm-backdrop{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,rgba(0,0,0,.65) 0%,rgba(0,0,0,.88) 100%)}

  /* メインポーズメニュー */
  .pm-main-menu{position:relative;display:flex;flex-direction:column;align-items:center;gap:24px;z-index:1}
  .pm-main-title{color:rgba(210,185,120,.85);font-size:28px;font-weight:700;letter-spacing:10px;margin:0;
    text-shadow:0 0 20px rgba(200,170,80,.3)}
  .pm-main-buttons{display:flex;flex-direction:column;gap:8px;min-width:320px}
  .pm-main-btn{display:flex;align-items:center;gap:14px;padding:16px 24px;
    background:linear-gradient(135deg,rgba(28,22,16,.95) 0%,rgba(18,14,10,.97) 100%);
    border:1px solid rgba(140,110,60,.2);border-radius:3px;cursor:pointer;
    transition:all .2s;font-family:inherit;text-align:left;
    box-shadow:0 0 20px rgba(0,0,0,.4),inset 0 0 30px rgba(0,0,0,.2)}
  .pm-main-btn:hover{background:linear-gradient(135deg,rgba(50,40,25,.95) 0%,rgba(35,28,18,.97) 100%);
    border-color:rgba(210,185,120,.45);box-shadow:0 0 30px rgba(180,150,90,.15),inset 0 0 20px rgba(180,150,90,.05)}
  .pm-main-btn-icon{font-size:24px;min-width:32px;text-align:center;filter:grayscale(.2)}
  .pm-main-btn-label{color:rgba(210,195,150,.9);font-size:16px;font-weight:600;flex:1}
  .pm-main-btn-sub{color:rgba(140,120,80,.4);font-size:11px;letter-spacing:2px}

  /* 戻るボタン */
  .pm-sub-header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
  .pm-sub-header .pm-title{margin-bottom:0;border-bottom:none;padding-bottom:0;flex:1}
  .pm-back-btn{padding:6px 14px;background:rgba(40,32,20,.7);border:1px solid rgba(120,95,50,.25);
    border-radius:3px;color:rgba(200,180,130,.8);font-size:12px;font-family:inherit;
    cursor:pointer;transition:all .15s;letter-spacing:1px}
  .pm-back-btn:hover{background:rgba(60,48,28,.8);border-color:rgba(180,150,90,.4);color:rgba(220,200,150,.95)}

  .pm-sub-view{z-index:1}

  /* 装備パネル（既存） */
  .pm-panel{position:relative;display:flex;gap:0;width:900px;max-width:94vw;max-height:86vh;
    background:linear-gradient(135deg,rgba(28,22,16,.97) 0%,rgba(18,14,10,.98) 100%);
    border:1px solid rgba(180,150,90,.25);border-radius:4px;
    box-shadow:0 0 60px rgba(0,0,0,.8),inset 0 0 80px rgba(0,0,0,.3),0 0 2px rgba(180,150,90,.3);overflow:hidden}
  .pm-panel::before{content:'';position:absolute;inset:4px;border:1px solid rgba(140,110,60,.12);border-radius:2px;pointer-events:none}
  .pm-panel::after{content:'';position:absolute;inset:0;opacity:.04;
    background-image:url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.8' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)'/%3E%3C/svg%3E");
    pointer-events:none}

  /* 設定パネル */
  .pm-options-panel{position:relative;width:500px;max-width:90vw;
    background:linear-gradient(135deg,rgba(28,22,16,.97) 0%,rgba(18,14,10,.98) 100%);
    border:1px solid rgba(180,150,90,.25);border-radius:4px;padding:28px 32px;
    box-shadow:0 0 60px rgba(0,0,0,.8),inset 0 0 80px rgba(0,0,0,.3),0 0 2px rgba(180,150,90,.3)}
  .pm-options-content{display:flex;flex-direction:column;gap:20px;margin-top:8px}
  .pm-option-row{display:flex;flex-direction:column;gap:6px}
  .pm-option-label{color:rgba(200,180,130,.8);font-size:13px;letter-spacing:2px}
  .pm-option-control{display:flex;align-items:center;gap:12px}
  .pm-slider{flex:1;-webkit-appearance:none;appearance:none;height:4px;
    background:rgba(80,65,35,.5);border-radius:2px;outline:none}
  .pm-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;
    background:rgba(210,185,120,.9);border-radius:50%;cursor:pointer;
    box-shadow:0 0 8px rgba(200,170,80,.4)}
  .pm-slider::-moz-range-thumb{width:16px;height:16px;background:rgba(210,185,120,.9);
    border-radius:50%;cursor:pointer;border:none;box-shadow:0 0 8px rgba(200,170,80,.4)}
  .pm-option-value{color:rgba(210,195,150,.85);font-size:13px;min-width:36px;text-align:right}
  .pm-left{flex:1;padding:28px 24px;border-right:1px solid rgba(140,110,60,.15);display:flex;flex-direction:column;overflow-y:auto}
  .pm-right{width:340px;padding:24px;display:flex;flex-direction:column;align-items:center;gap:16px}
  .pm-title{color:rgba(210,185,120,.9);font-size:22px;font-weight:700;letter-spacing:6px;margin:0 0 20px;
    text-shadow:0 0 12px rgba(200,170,80,.3);text-align:center;
    border-bottom:1px solid rgba(140,110,60,.2);padding-bottom:12px}

  /* 装備スロット */
  .pm-slots{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px}
  .pm-slot{display:flex;align-items:center;gap:8px;padding:8px 10px;
    background:rgba(40,32,20,.6);border:1px solid rgba(120,95,50,.2);border-radius:3px;
    cursor:pointer;transition:all .15s;text-align:left;font-family:inherit}
  .pm-slot:hover{background:rgba(60,48,28,.7);border-color:rgba(180,150,90,.35);
    box-shadow:0 0 12px rgba(180,150,90,.1)}
  .pm-slot.selected{background:rgba(80,65,35,.6);border-color:rgba(210,185,120,.5);
    box-shadow:0 0 20px rgba(210,185,120,.15),inset 0 0 15px rgba(210,185,120,.05)}
  .pm-slot-icon{font-size:20px;min-width:28px;text-align:center;filter:grayscale(.3)}
  .pm-slot-label{color:rgba(160,140,100,.7);font-size:10px;letter-spacing:1px;min-width:48px}
  .pm-slot-name{color:rgba(210,195,150,.85);font-size:12px;flex:1;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  /* アイテムリスト */
  .pm-item-list{flex:1;overflow-y:auto;min-height:120px}
  .pm-item-list:empty::after{content:'スロットを選択してください';color:rgba(120,100,70,.4);font-size:13px;display:block;text-align:center;padding:30px 0}
  .pm-item{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;
    border-bottom:1px solid rgba(100,80,40,.1);cursor:pointer;transition:all .12s}
  .pm-item:hover{background:rgba(60,48,28,.5)}
  .pm-item.equipped-item{color:rgba(210,185,120,.95);background:rgba(80,65,35,.3)}
  .pm-item-name{font-size:13px;color:rgba(200,185,140,.85)}
  .pm-item-stat{font-size:11px;color:rgba(160,140,100,.6)}
  .pm-item-desc{font-size:10px;color:rgba(120,105,70,.5);margin-top:2px}

  /* プレビュー */
  .pm-preview-wrap{width:${PREVIEW_SIZE}px;height:${Math.floor(PREVIEW_SIZE * 1.4)}px;
    border:1px solid rgba(120,95,50,.2);border-radius:3px;overflow:hidden;
    box-shadow:inset 0 0 20px rgba(0,0,0,.6);cursor:grab;background:#0a0806}
  .pm-preview-wrap:active{cursor:grabbing}
  #pmPreviewCanvas{width:100%;height:100%;display:block}

  /* ステータス */
  .pm-stats{width:100%;background:rgba(30,24,16,.5);border:1px solid rgba(120,95,50,.15);border-radius:3px;padding:14px 18px}
  .pm-stat-title{color:rgba(210,185,120,.7);font-size:12px;letter-spacing:3px;margin-bottom:10px;
    border-bottom:1px solid rgba(140,110,60,.15);padding-bottom:6px}
  .pm-stat-row{display:flex;justify-content:space-between;padding:3px 0}
  .pm-stat-label{color:rgba(160,140,100,.6);font-size:12px}
  .pm-stat-value{color:rgba(220,205,165,.9);font-size:13px;font-weight:600}

  .pm-hint{color:rgba(120,100,70,.35);font-size:11px;letter-spacing:2px;font-family:'Cinzel',serif;
    margin-top:8px;text-align:center}

  /* スクロールバー */
  .pm-left::-webkit-scrollbar,.pm-item-list::-webkit-scrollbar{width:4px}
  .pm-left::-webkit-scrollbar-track,.pm-item-list::-webkit-scrollbar-track{background:rgba(20,16,10,.5)}
  .pm-left::-webkit-scrollbar-thumb,.pm-item-list::-webkit-scrollbar-thumb{background:rgba(140,110,60,.3);border-radius:2px}
`;
document.body.appendChild(pmStyle);

// ============================================================
//  メニュー状態管理（メイン → サブメニュー遷移対応）
// ============================================================
let menuOpen = false;
let currentView = 'main'; // 'main' | 'equipment' | 'options'
let selectedSlot = null;
let onEquipChange = null; // コールバック（main.jsが設定）

const mainMenuEl = document.getElementById('pmMainMenu');
const equipViewEl = document.getElementById('pmEquipmentView');
const optionsViewEl = document.getElementById('pmOptionsView');

export function isMenuOpen() { return menuOpen; }

export function setOnEquipChange(cb) { onEquipChange = cb; }

// ビュー切り替え
function showView(view) {
  currentView = view;
  mainMenuEl.style.display = view === 'main' ? '' : 'none';
  equipViewEl.style.display = view === 'equipment' ? '' : 'none';
  optionsViewEl.style.display = view === 'options' ? '' : 'none';
  if (view === 'equipment') {
    updateSlotNames();
    updateStats();
    selectedSlot = null;
    clearItemList();
    document.querySelectorAll('.pm-slot').forEach(s => s.classList.remove('selected'));
  }
}

export function openMenu() {
  if (menuOpen) return; // 二重呼び出し防止
  menuOpen = true;
  pauseOverlay.classList.add('active');
  playMenuOpenSound();
  showView('main'); // 常にメインメニューから開始
}

export function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  pauseOverlay.classList.remove('active');
  playMenuCloseSound();
  selectedSlot = null;
  currentView = 'main';
  // Pointer Lock を再取得してゲームに復帰
  setTimeout(() => {
    const canvas = document.querySelector('canvas');
    if (canvas && !document.pointerLockElement) {
      canvas.requestPointerLock();
    }
  }, 100);
}

export function toggleMenu() {
  if (menuOpen) closeMenu(); else openMenu();
}

// --- メインメニューのボタンイベント ---
mainMenuEl.querySelectorAll('.pm-main-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    playMenuSelectSound();
    if (view === 'resume') {
      closeMenu();
    } else {
      showView(view);
    }
  });
  btn.addEventListener('mouseenter', () => playMenuSelectSound());
});

// --- 戻るボタン ---
document.getElementById('pmEquipBack').addEventListener('click', () => {
  playMenuSelectSound();
  showView('main');
});
document.getElementById('pmOptionsBack').addEventListener('click', () => {
  playMenuSelectSound();
  showView('main');
});

// --- ESC キー: サブメニューではメインに戻る、メインでは閉じる ---
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && menuOpen) {
    e.preventDefault();
    if (currentView !== 'main') {
      playMenuSelectSound();
      showView('main');
    } else {
      closeMenu();
    }
  }
});

// 背景クリックで閉じる（メインメニュー表示時のみ）
pauseOverlay.querySelector('.pm-backdrop')?.addEventListener('click', () => {
  if (menuOpen) {
    if (currentView !== 'main') {
      showView('main');
    } else {
      closeMenu();
    }
  }
});

// --- 設定: 明るさスライダー → renderer.toneMappingExposure ---
const brightnessSlider = document.getElementById('pmBrightness');
const brightnessVal = document.getElementById('pmBrightnessVal');
brightnessSlider.addEventListener('input', () => {
  const v = parseFloat(brightnessSlider.value);
  brightnessVal.textContent = v.toFixed(2);
  renderer.toneMappingExposure = v;
});

// --- 設定: BGM 音量（将来用、値保持のみ） ---
const bgmVolSlider = document.getElementById('pmBgmVol');
const bgmVolVal = document.getElementById('pmBgmVolVal');
bgmVolSlider.addEventListener('input', () => {
  bgmVolVal.textContent = parseFloat(bgmVolSlider.value).toFixed(2);
});

// --- 設定: SE 音量（将来用、値保持のみ） ---
const seVolSlider = document.getElementById('pmSeVol');
const seVolVal = document.getElementById('pmSeVolVal');
seVolSlider.addEventListener('input', () => {
  seVolVal.textContent = parseFloat(seVolSlider.value).toFixed(2);
});

// スロット名を更新
function updateSlotNames() {
  slotKeys.forEach(key => {
    const el = document.getElementById(`slotName_${key}`);
    if (!el) return;
    const dbKey = key === 'ring1' || key === 'ring2' ? 'ring' : key;
    const idx = equipped[key];
    const item = EQUIPMENT_DB[dbKey]?.[idx];
    el.textContent = item?.name || 'なし';
  });
}

// ステータス表示更新
function updateStats() {
  const stats = calcStats();
  const el = document.getElementById('pmStats');
  if (!el) return;
  el.innerHTML = `
    <div class="pm-stat-title">STATUS</div>
    <div class="pm-stat-row"><span class="pm-stat-label">レベル</span><span class="pm-stat-value">1</span></div>
    <div class="pm-stat-row"><span class="pm-stat-label">HP</span><span class="pm-stat-value">${100 + stats.bonusHp}</span></div>
    <div class="pm-stat-row"><span class="pm-stat-label">スタミナ</span><span class="pm-stat-value">${100}</span></div>
    <div class="pm-stat-row"><span class="pm-stat-label">攻撃力</span><span class="pm-stat-value">${stats.attack}</span></div>
    <div class="pm-stat-row"><span class="pm-stat-label">防御力</span><span class="pm-stat-value">${stats.defense}</span></div>
    <div class="pm-stat-row"><span class="pm-stat-label">強靭度</span><span class="pm-stat-value">${stats.poise}</span></div>
    <div class="pm-stat-row"><span class="pm-stat-label">装備重量</span><span class="pm-stat-value">${stats.totalWeight}</span></div>
  `;
}

// アイテムリスト表示
function showItemList(slotKey) {
  const listEl = document.getElementById('pmItemList');
  if (!listEl) return;
  listEl.innerHTML = '';
  const dbKey = slotKey === 'ring1' || slotKey === 'ring2' ? 'ring' : slotKey;
  const items = EQUIPMENT_DB[dbKey];
  if (!items) return;
  const currentIdx = equipped[slotKey];

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'pm-item' + (idx === currentIdx ? ' equipped-item' : '');
    const statText = item.attack != null ? `攻撃: ${item.attack}`
                   : item.defense != null ? `防御: ${item.defense}`
                   : item.effect || '';
    div.innerHTML = `
      <div>
        <div class="pm-item-name">${item.name}${idx === currentIdx ? ' [装備中]' : ''}</div>
        ${item.desc ? `<div class="pm-item-desc">${item.desc}</div>` : ''}
      </div>
      <div class="pm-item-stat">${statText}</div>
    `;
    div.addEventListener('click', () => {
      equipped[slotKey] = idx;
      playEquipSound();
      updateSlotNames();
      updateStats();
      showItemList(slotKey); // リスト再描画
      if (onEquipChange) onEquipChange(slotKey, idx);
    });
    div.addEventListener('mouseenter', () => playMenuSelectSound());
    listEl.appendChild(div);
  });
}

function clearItemList() {
  const listEl = document.getElementById('pmItemList');
  if (listEl) listEl.innerHTML = '';
}

// スロットクリックイベント
slotsContainer.addEventListener('click', (e) => {
  const slotBtn = e.target.closest('.pm-slot');
  if (!slotBtn) return;
  playMenuSelectSound();
  document.querySelectorAll('.pm-slot').forEach(s => s.classList.remove('selected'));
  slotBtn.classList.add('selected');
  selectedSlot = slotBtn.dataset.slot;
  showItemList(selectedSlot);
});

// プレビューキャンバスのドラッグ回転
const previewWrap = pauseOverlay.querySelector('.pm-preview-wrap');
if (previewWrap) {
  previewWrap.addEventListener('mousedown', (e) => {
    previewDragging = true;
    previewLastX = e.clientX;
  });
  window.addEventListener('mousemove', (e) => {
    if (!previewDragging) return;
    const dx = e.clientX - previewLastX;
    previewRotation += dx * 0.01;
    previewLastX = e.clientX;
  });
  window.addEventListener('mouseup', () => { previewDragging = false; });
}
