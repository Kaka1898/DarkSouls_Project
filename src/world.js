import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass }        from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment }  from 'three/addons/environments/RoomEnvironment.js';

// ============================================================
//  シーン・レンダラー
// ============================================================
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e0e1a);
scene.fog = new THREE.Fog(0x0e0e1a, 20, 65);

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ============================================================
//  環境マップ — PBRマテリアル共有用 (PMREMGenerator)
// ============================================================
const _pmrem = new THREE.PMREMGenerator(renderer);
_pmrem.compileEquirectangularShader();
export const envMap = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
_pmrem.dispose();

// ============================================================
//  カメラ
// ============================================================
export const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);

// ============================================================
//  オーディオリスナー — ボス3D音声用
// ============================================================
export const audioListener = new THREE.AudioListener();
camera.add(audioListener);

// ============================================================
//  ポストプロセッシングチェーン
//  RenderPass → UnrealBloom → BokehPass(DOF) → OutputPass
// ============================================================
export const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.4, 0.85
);
export const bokehPass = new BokehPass(scene, camera, {
  focus: 10.0, aperture: 0.00001, maxblur: 0.01,
});
const _renderPass = new RenderPass(scene, camera);
const _outputPass = new OutputPass();
export const composer = new EffectComposer(renderer);
composer.addPass(_renderPass);
composer.addPass(bloomPass);
composer.addPass(bokehPass);
composer.addPass(_outputPass);

// ============================================================
//  ライティング
// ============================================================
const hemiLight = new THREE.HemisphereLight(0xb0c4de, 0x444422, 0.6);
scene.add(hemiLight);

export const dirLight = new THREE.DirectionalLight(0x8899bb, 1.4);
dirLight.position.set(-8, 15, -10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(4096, 4096);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
scene.add(dirLight);

export const spotLight = new THREE.SpotLight(0xffaa44, 3, 25, Math.PI / 6, 0.5, 1);
spotLight.castShadow = true;
spotLight.shadow.mapSize.set(2048, 2048);
scene.add(spotLight);

function addTorchLight(x, y, z, color = 0xff6622) {
  const pl = new THREE.PointLight(color, 2, 12, 2);
  pl.position.set(x, y, z);
  pl.castShadow = false;
  scene.add(pl);
  return pl;
}

export const torchLights = [];
export const torchFlames = [];

// ============================================================
//  共有ジオメトリ・マテリアル
// ============================================================
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95, metalness: 0.05 });
const floorMat2 = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.1 });
const floorMatDark = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.95 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.85, metalness: 0.1 });
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7, metalness: 0.15 });
const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.8, metalness: 0.2 });

const geoCache = {};
export function getBoxGeo(w, h, d) {
  const key = `b_${w}_${h}_${d}`;
  if (!geoCache[key]) geoCache[key] = new THREE.BoxGeometry(w, h, d);
  return geoCache[key];
}
export function getCylGeo(r, h, seg) {
  const key = `c_${r}_${h}_${seg}`;
  if (!geoCache[key]) geoCache[key] = new THREE.CylinderGeometry(r, r, h, seg);
  return geoCache[key];
}

// ============================================================
//  プロシージャル骨テクスチャ
//  boneTex: 512px キャンバス生成（斑点ノイズ＋繊維ライン）
//  boneNormal: Sobel エッジ検出による法線マップ
//  hrBone: { map, normalMap, roughnessMap, aoMap } — PBRマテリアル用テクスチャセット
// ============================================================
function _makeBoneTex() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8aa84';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = Math.random() * 5 + 1;
    const v = (Math.random() * 40 - 20) | 0;
    ctx.fillStyle = `rgb(${(180 + v + 20) | 0},${(160 + v) | 0},${(120 + v - 20) | 0})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 35; i++) {
    ctx.strokeStyle = `rgba(90,70,50,${(Math.random() * 0.15 + 0.04).toFixed(2)})`;
    ctx.lineWidth = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * S, 0); ctx.lineTo(Math.random() * S, S);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return { canvas: c, tex };
}
function _makeSobelNormal(srcCanvas) {
  const S = srcCanvas.width;
  const sd = srcCanvas.getContext('2d').getImageData(0, 0, S, S).data;
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const nctx = nc.getContext('2d');
  const dst = nctx.createImageData(S, S); const o = dst.data;
  const g = (x, y) => sd[((y * S + x) * 4)]; // R チャンネルを輝度として使用
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      const gx = (-g(x-1,y-1) - 2*g(x-1,y) - g(x-1,y+1) + g(x+1,y-1) + 2*g(x+1,y) + g(x+1,y+1)) / 8;
      const gy = (-g(x-1,y-1) - 2*g(x,y-1) - g(x+1,y-1) + g(x-1,y+1) + 2*g(x,y+1) + g(x+1,y+1)) / 8;
      const idx = (y * S + x) * 4;
      o[idx]   = Math.min(255, Math.max(0, (gx * 0.5 + 0.5) * 255));
      o[idx+1] = Math.min(255, Math.max(0, (gy * 0.5 + 0.5) * 255));
      o[idx+2] = 255; o[idx+3] = 255;
    }
  }
  nctx.putImageData(dst, 0, 0);
  const tex = new THREE.CanvasTexture(nc);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const _bt = _makeBoneTex();
export const boneTex    = _bt.tex;
export const boneNormal = _makeSobelNormal(_bt.canvas);
// hrBone: PBRマテリアル生成時に spread するテクスチャセット
export const hrBone = {
  map:          boneTex,
  normalMap:    boneNormal,
  roughnessMap: boneTex, // 骨の明暗を粗さとして流用
  aoMap:        boneTex, // 暗部をAOとして流用
};

// ============================================================
//  地形・障害物データ収集 → InstancedMesh 一括生成
// ============================================================
const TERRAIN = [];
const OBSTACLES = [];

const _floorBuf = new Map();   // mat → [{x,y,z,w,h,d}]
const _boxBuf   = new Map();   // mat → [{x,y,z,w,h,d}]
const _cylBuf   = new Map();   // "r_h" → {geo,mat,list:[{x,y,z}]}

function addFloorTile(x, z, w, d, y = 0, mat) {
  const m = mat || floorMat;
  if (!_floorBuf.has(m)) _floorBuf.set(m, []);
  _floorBuf.get(m).push({ x, y: y - 0.2, z, w, h: 0.4, d });
  TERRAIN.push({ x, z, y, hw: w / 2, hd: d / 2 });
}

function addBox(x, y, z, w, h, d, mat) {
  const m = mat || wallMat;
  if (!_boxBuf.has(m)) _boxBuf.set(m, []);
  _boxBuf.get(m).push({ x, y: y + h / 2, z, w, h, d });
  OBSTACLES.push({ type: 'box', x, z, hw: w / 2, hd: d / 2 });
}

function addCylinder(x, y, z, r, h, mat) {
  const m = mat || pillarMat;
  const key = `${r}_${h}`;
  if (!_cylBuf.has(key)) _cylBuf.set(key, { geo: getCylGeo(r, h, 10), mat: m, list: [] });
  _cylBuf.get(key).list.push({ x, y: y + h / 2, z });
  OBSTACLES.push({ type: 'cylinder', x, z, r });
}

// --- 床タイル定義 ---
addFloorTile(0, 0, 30, 30, 0, floorMat);
addFloorTile(-18, -5, 8, 20, 0.6, floorMat2);
addFloorTile(18, -8, 10, 14, 1.2, floorMat2);
addFloorTile(0, -22, 20, 14, 0.4, floorMatDark);
addFloorTile(0, -38, 24, 12, 0, floorMatDark);
addFloorTile(-14.5, -5, 1, 20, 0.3, floorMat);
addFloorTile(13.5, -8, 1, 14, 0.6, floorMat);
addFloorTile(0, -15.5, 20, 1, 0.2, floorMat);

// --- 外壁 ---
addBox(0, 0, 15.5, 32, 3, 1, darkStoneMat);
addBox(0, 0, -45, 26, 4, 1, darkStoneMat);
addBox(-15.5, 0, 0, 1, 3, 30, darkStoneMat);
addBox(15.5, 0, 0, 1, 3, 30, darkStoneMat);

// --- 石柱 ---
addCylinder(-5, 0, -3, 0.7, 4, pillarMat);
addCylinder(5, 0, -3, 0.7, 4, pillarMat);
addCylinder(-5, 0, 5, 0.7, 4, pillarMat);
addCylinder(5, 0, 5, 0.7, 4, pillarMat);

// --- 壊れた壁・瓦礫 ---
addBox(-2, 0, 1, 4, 1.8, 0.5, wallMat);
addBox(3, 0, -6, 0.5, 2.2, 3, wallMat);
addBox(-22.5, 0.6, -5, 1, 3, 20, darkStoneMat);
addBox(-14, 0.6, -14.5, 8, 2.5, 1, wallMat);
addBox(16, 1.2, -3, 2, 1.5, 2, wallMat);
addBox(20, 1.2, -12, 2, 2, 2, darkStoneMat);
addBox(-10.5, 0.4, -22, 1, 3.5, 14, darkStoneMat);
addBox(10.5, 0.4, -22, 1, 3.5, 14, darkStoneMat);
addBox(-7, 0, 8, 1.5, 0.8, 1, wallMat);
addBox(8, 0, 7, 1, 0.6, 1.5, wallMat);
addBox(0, 0, 10, 2, 0.5, 0.8, wallMat);

// ============================================================
//  InstancedMesh 一括生成
// ============================================================
const _unitBox = new THREE.BoxGeometry(1, 1, 1);
const _dummy = new THREE.Object3D();

function buildBoxInstances(buf, castShadow) {
  for (const [mat, list] of buf) {
    const im = new THREE.InstancedMesh(_unitBox, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      _dummy.position.set(o.x, o.y, o.z);
      _dummy.scale.set(o.w, o.h, o.d);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      im.setMatrixAt(i, _dummy.matrix);
    }
    im.castShadow = castShadow;
    im.receiveShadow = true;
    scene.add(im);
  }
}

// 床タイル: 3マテリアル → 3 Draw Calls
buildBoxInstances(_floorBuf, false);
// 壁・障害物ボックス: 2マテリアル → 2 Draw Calls
buildBoxInstances(_boxBuf, true);

// 石柱: 1ジオメトリ×1マテリアル → 1 Draw Call
for (const [, data] of _cylBuf) {
  const im = new THREE.InstancedMesh(data.geo, data.mat, data.list.length);
  for (let i = 0; i < data.list.length; i++) {
    _dummy.position.set(data.list[i].x, data.list[i].y, data.list[i].z);
    _dummy.scale.set(1, 1, 1);
    _dummy.rotation.set(0, 0, 0);
    _dummy.updateMatrix();
    im.setMatrixAt(i, _dummy.matrix);
  }
  im.castShadow = true;
  im.receiveShadow = true;
  scene.add(im);
}

// 松明
torchLights.push(addTorchLight(-5, 4.5, -3));
torchLights.push(addTorchLight(5, 4.5, -3));
torchLights.push(addTorchLight(-5, 4.5, 5));
torchLights.push(addTorchLight(5, 4.5, 5));
torchLights.push(addTorchLight(0, 3, -30, 0x4488ff));

const flameGeo = new THREE.ConeGeometry(0.15, 0.4, 6);
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6622 });
function addTorchVisual(x, y, z) {
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(x, y, z);
  scene.add(flame);
  return flame;
}
torchFlames.push(addTorchVisual(-5, 4.3, -3));
torchFlames.push(addTorchVisual(5, 4.3, -3));
torchFlames.push(addTorchVisual(-5, 4.3, 5));
torchFlames.push(addTorchVisual(5, 4.3, 5));

// ============================================================
//  焚き火（セーブポイント）
//  bonfireGroup/bonfire2Group: メッシュグループ
//  bonfireRingMat/bonfire2RingMat: 地面リングエフェクト用マテリアル（main.jsでアニメーション）
// ============================================================
function _makeBonfire(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // 台座（骨素材の円柱）
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.9, metalness: 0.1 });
  const base = new THREE.Mesh(getCylGeo(0.35, 0.25, 8), baseMat);
  base.position.y = 0.125; base.castShadow = true; g.add(base);
  // 薪（交差する細いボックス）
  const logMat = new THREE.MeshStandardMaterial({ color: 0x553322, roughness: 1.0 });
  const logGeo = getBoxGeo(0.5, 0.08, 0.08);
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(logGeo, logMat);
    log.position.set(0, 0.28, 0); log.rotation.y = (i / 3) * Math.PI; g.add(log);
  }
  // 炎コア
  const bfFlameMat = new THREE.MeshBasicMaterial({ color: 0xff7700 });
  const bfFlame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), bfFlameMat);
  bfFlame.position.y = 0.55; g.add(bfFlame);
  // ポイントライト
  const bfLight = new THREE.PointLight(0xff6600, 2.5, 8, 2);
  bfLight.position.set(0, 0.7, 0); g.add(bfLight);
  // 地面リングインジケーター
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.35 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.0, 24), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
  scene.add(g);
  return { group: g, ringMat };
}

const _bf1 = _makeBonfire(0, 8);
export const bonfireGroup    = _bf1.group;
export const bonfireRingMat  = _bf1.ringMat;

const _bf2 = _makeBonfire(0, -40);
export const bonfire2Group   = _bf2.group;
export const bonfire2RingMat = _bf2.ringMat;

// ============================================================
//  衝突判定
// ============================================================
export function resolveCollision(px, pz, radius) {
  let rx = px, rz = pz;
  for (let i = 0; i < OBSTACLES.length; i++) {
    const ob = OBSTACLES[i];
    const cdx = rx - ob.x, cdz = rz - ob.z;
    // 早期棄却: オブジェクトの半幅+余裕を超えていればスキップ
    const reach = (ob.type === 'box' ? Math.max(ob.hw, ob.hd) : ob.r) + radius + 1;
    if (cdx * cdx + cdz * cdz > reach * reach) continue;

    if (ob.type === 'box') {
      const nearX = Math.max(ob.x - ob.hw, Math.min(rx, ob.x + ob.hw));
      const nearZ = Math.max(ob.z - ob.hd, Math.min(rz, ob.z + ob.hd));
      const dx = rx - nearX, dz = rz - nearZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius && dist > 0) {
        rx = nearX + (dx / dist) * radius;
        rz = nearZ + (dz / dist) * radius;
      } else if (dist === 0) {
        const cx = rx - ob.x, cz = rz - ob.z;
        const ax = ob.hw - Math.abs(cx), az = ob.hd - Math.abs(cz);
        if (ax < az) rx = ob.x + (cx >= 0 ? ob.hw + radius : -ob.hw - radius);
        else rz = ob.z + (cz >= 0 ? ob.hd + radius : -ob.hd - radius);
      }
    } else {
      const dx = rx - ob.x, dz = rz - ob.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = ob.r + radius;
      if (dist < minDist && dist > 0) {
        rx = ob.x + (dx / dist) * minDist;
        rz = ob.z + (dz / dist) * minDist;
      }
    }
  }
  return { x: rx, z: rz };
}

export function getTerrainY(px, pz) {
  let best = -Infinity;
  for (let i = 0; i < TERRAIN.length; i++) {
    const t = TERRAIN[i];
    if (px >= t.x - t.hw && px <= t.x + t.hw && pz >= t.z - t.hd && pz <= t.z + t.hd) {
      if (t.y > best) best = t.y;
    }
  }
  return best === -Infinity ? -10 : best;
}

// ============================================================
//  フォグゲート
// ============================================================
export const fogGateGroup = new THREE.Group();
fogGateGroup.position.set(0, 0, -30);
scene.add(fogGateGroup);

const fogPlaneMats = [
  new THREE.MeshBasicMaterial({ color: 0xccccff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide }),
];
const fogPlaneGeo = new THREE.PlaneGeometry(8, 4);
for (let i = 0; i < 3; i++) {
  const fp = new THREE.Mesh(fogPlaneGeo, fogPlaneMats[i % 2]);
  fp.position.set(0, 2, i * 0.15);
  fogGateGroup.add(fp);
}

const frameMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.8, metalness: 0.3 });
const frameGeoV = getBoxGeo(0.5, 4.5, 0.5);
const frameGeoH = getBoxGeo(8.9, 0.5, 0.5);
const fL = new THREE.Mesh(frameGeoV, frameMat); fL.position.set(-4.2, 2.25, 0); fL.castShadow = true; fogGateGroup.add(fL);
const fR = new THREE.Mesh(frameGeoV, frameMat); fR.position.set(4.2, 2.25, 0); fR.castShadow = true; fogGateGroup.add(fR);
const fT = new THREE.Mesh(frameGeoH, frameMat); fT.position.set(0, 4.5, 0); fT.castShadow = true; fogGateGroup.add(fT);

// フォグゲート衝突判定（プレイヤーがゲートをすり抜けられないようにする）
const _fogGateObs = { type: 'box', x: 0, z: -30, hw: 4.5, hd: 0.4 };
OBSTACLES.push(_fogGateObs);

export function disableFogGateCollision() {
  const idx = OBSTACLES.indexOf(_fogGateObs);
  if (idx !== -1) OBSTACLES.splice(idx, 1);
}
export function enableFogGateCollision() {
  if (!OBSTACLES.includes(_fogGateObs)) OBSTACLES.push(_fogGateObs);
}

// ============================================================
//  ユーティリティ
// ============================================================
export function distXZ(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// ============================================================
//  ワールドエフェクト更新
// ============================================================
export function updateWorldEffects(time, frameCount) {
  // 松明ゆらぎ
  const tIdx = Math.floor(time * 10) % torchLights.length;
  torchLights[tIdx].intensity = 2 + Math.sin(time * 3 + tIdx * 1.5) * 0.6;
  if (tIdx < torchFlames.length) torchFlames[tIdx].scale.y = 1 + Math.sin(time * 5 + tIdx) * 0.3;

  // 霧ゲートゆらぎ（3フレームに1回）
  if (frameCount % 3 === 0) {
    fogGateGroup.children.forEach((c, i) => {
      if (c.material && c.material.transparent) {
        c.position.x = Math.sin(time * 1.5 + i * 2) * 0.15;
        c.material.opacity = 0.15 + Math.sin(time * 2 + i) * 0.08;
      }
    });
  }
}

// ============================================================
//  HUD
// ============================================================
const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `
  <div class="hud-bars">
    <div class="bar-container"><div class="bar-label">HP</div><div class="bar-bg"><div class="bar-fill hp-bar" id="hpBar"></div></div><div class="bar-text" id="hpText">100/100</div></div>
    <div class="bar-container"><div class="bar-label">ST</div><div class="bar-bg"><div class="bar-fill st-bar" id="stBar"></div></div><div class="bar-text" id="stText">100/100</div></div>
  </div>
  <div class="estus-display"><div class="estus-icon">&#x1F9EA;</div><div class="estus-count" id="estusCount">5</div></div>
  <div class="lock-on-indicator" id="lockOnUI">LOCK ON</div>
  <div class="healing-overlay" id="healOL"></div>
  <div class="damage-overlay" id="dmgOL"></div>
  <div class="you-died" id="youDied">YOU DIED</div>
  <div class="interact-prompt" id="interactPrompt">霧の中に入る [E]</div>
  <div class="boss-text" id="bossText">BOSS ENCOUNTER</div>
  <div class="fps-counter" id="fpsCounter">FPS: --</div>
  <div class="saved-text" id="savedText">GAME SAVED</div>
  <div class="fade-overlay" id="fadeOverlay"></div>
  <div class="boss-hp-container" id="bossHpContainer">
    <div class="boss-hp-name">GATE KNIGHT</div>
    <div class="boss-hp-bg"><div class="boss-hp-fill" id="bossHpBar"></div></div>
  </div>
  <div class="victory-text" id="victoryText">VICTORY</div>
`;
document.body.appendChild(hud);

// ============================================================
//  設定メニュー
// ============================================================
const optionsOL = document.createElement('div');
optionsOL.id = 'optionsOverlay';
optionsOL.innerHTML = `
  <div id="optionsPanel">
    <h2>OPTIONS</h2>
    <div class="opt-row">
      <label>Brightness</label>
      <input type="range" id="optBrightness" min="0.5" max="2.0" step="0.05" value="1.2">
      <span class="opt-val" id="optBrightVal">1.20</span>
    </div>
    <div class="opt-row">
      <label>Resolution</label>
      <input type="range" id="optResolution" min="0.5" max="2.0" step="0.25" value="${window.devicePixelRatio}">
      <span class="opt-val" id="optResVal">${window.devicePixelRatio.toFixed(2)}</span>
    </div>
    <div class="opt-row">
      <label>Shadow Quality</label>
      <div class="opt-btns">
        <button class="opt-btn" data-shadow="low">Low</button>
        <button class="opt-btn" data-shadow="med">Med</button>
        <button class="opt-btn active" data-shadow="high">High</button>
      </div>
    </div>
    <div class="opt-hint">Press ESC to close</div>
  </div>
`;
document.body.appendChild(optionsOL);

export const optionsOverlay = document.getElementById('optionsOverlay');
export const optBrightness = document.getElementById('optBrightness');
export const optBrightVal = document.getElementById('optBrightVal');
export const optResolution = document.getElementById('optResolution');
export const optResVal = document.getElementById('optResVal');
export const optShadowBtns = document.querySelectorAll('.opt-btn[data-shadow]');

const style = document.createElement('style');
style.textContent = `
  #hud{pointer-events:none;position:fixed;inset:0;z-index:10}
  .hud-bars{position:absolute;top:24px;left:24px;display:flex;flex-direction:column;gap:6px}
  .bar-container{display:flex;align-items:center;gap:8px}
  .bar-label{color:#999;font:bold 13px monospace;width:22px;text-align:right}
  .bar-bg{width:220px;height:16px;background:#1a1a1a;border:1px solid #444;border-radius:2px;overflow:hidden;box-shadow:inset 0 0 6px rgba(0,0,0,.8)}
  .bar-fill{height:100%;transition:width .15s ease-out;border-radius:1px}
  .hp-bar{background:linear-gradient(180deg,#cc3333,#881111);box-shadow:0 0 6px rgba(200,50,50,.4);width:100%}
  .st-bar{background:linear-gradient(180deg,#33aa55,#116633);box-shadow:0 0 6px rgba(50,170,80,.4);width:100%}
  .bar-text{color:#aaa;font:11px monospace;min-width:60px}
  .st-bar.exhausted{animation:stF .3s infinite alternate}
  @keyframes stF{from{opacity:.4}to{opacity:1}}
  .estus-display{position:absolute;bottom:28px;right:32px;display:flex;align-items:center;gap:8px;background:rgba(10,10,10,.75);border:1px solid #553300;border-radius:6px;padding:8px 16px;box-shadow:0 0 12px rgba(255,120,0,.15)}
  .estus-icon{font-size:28px;filter:saturate(1.5)}.estus-count{color:#ffaa33;font:bold 24px monospace;text-shadow:0 0 8px rgba(255,140,0,.5)}
  .estus-count.empty{color:#555;text-shadow:none}
  .lock-on-indicator{position:absolute;top:22px;left:50%;transform:translateX(-50%);color:#ffaa00;font:bold 18px monospace;text-shadow:0 0 10px rgba(255,170,0,.6);opacity:0;transition:opacity .2s}
  .lock-on-indicator.active{opacity:1}
  .healing-overlay{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(255,140,0,.08) 0%,transparent 70%);opacity:0;transition:opacity .3s}
  .healing-overlay.active{opacity:1}
  .damage-overlay{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(255,0,0,.15) 0%,transparent 60%);opacity:0;transition:opacity .15s}
  .damage-overlay.active{opacity:1}
  .you-died{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#cc2222;font:bold 72px 'Times New Roman',serif;letter-spacing:12px;text-shadow:0 0 40px rgba(200,0,0,.6),0 0 80px rgba(200,0,0,.3);opacity:0;transition:opacity 2s ease-in}
  .you-died.active{opacity:1}
  .interact-prompt{position:absolute;top:60%;left:50%;transform:translateX(-50%);color:#ccccff;font:bold 20px monospace;text-shadow:0 0 15px rgba(180,180,255,.6);opacity:0;transition:opacity .3s}
  .interact-prompt.active{opacity:1}
  .boss-text{position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);color:#ffcc44;font:bold 56px 'Times New Roman',serif;letter-spacing:8px;text-shadow:0 0 30px rgba(255,200,50,.5),0 0 60px rgba(255,150,0,.3);opacity:0;transition:opacity 1.5s ease-in}
  .boss-text.active{opacity:1}
  .fps-counter{position:absolute;top:24px;right:24px;color:#4a4;font:bold 14px monospace;text-shadow:0 0 4px rgba(0,0,0,.8)}
  #optionsOverlay{display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);justify-content:center;align-items:center}
  #optionsOverlay.active{display:flex}
  #optionsPanel{background:rgba(20,20,28,.95);border:1px solid #555;border-radius:10px;padding:32px 40px;min-width:340px;box-shadow:0 0 40px rgba(0,0,0,.8)}
  #optionsPanel h2{margin:0 0 24px;text-align:center;color:#ddc;font:bold 32px 'Times New Roman',serif;letter-spacing:6px;text-shadow:0 0 12px rgba(255,220,180,.3)}
  .opt-row{display:flex;align-items:center;gap:12px;margin-bottom:18px}
  .opt-row label{color:#aaa;font:bold 13px monospace;min-width:110px}
  .opt-row input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:6px;background:#333;border-radius:3px;outline:none;cursor:pointer}
  .opt-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#dda;border:2px solid #886;cursor:pointer;box-shadow:0 0 6px rgba(200,180,100,.4)}
  .opt-val{color:#dda;font:bold 13px monospace;min-width:36px;text-align:right}
  .opt-btns{display:flex;gap:6px;flex:1}
  .opt-btn{flex:1;padding:6px 0;background:#2a2a2a;color:#888;font:bold 12px monospace;border:1px solid #444;border-radius:4px;cursor:pointer;transition:all .15s}
  .opt-btn:hover{background:#3a3a3a;color:#ccc;border-color:#666}
  .opt-btn.active{background:#554411;color:#ffcc66;border-color:#aa8833;box-shadow:0 0 8px rgba(255,180,50,.2)}
  .opt-hint{text-align:center;color:#555;font:12px monospace;margin-top:20px}
  .saved-text{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);color:#aaffcc;font:bold 36px 'Times New Roman',serif;letter-spacing:8px;text-shadow:0 0 20px rgba(100,255,150,.6);opacity:0;transition:opacity 1.5s ease-in}
  .saved-text.active{opacity:1}
  .fade-overlay{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 0.8s ease}
  .fade-overlay.active{opacity:1}
  .boss-hp-container{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);width:480px;opacity:0;transition:opacity .5s}
  .boss-hp-container.active{opacity:1}
  .boss-hp-name{color:#ffcc44;font:bold 18px 'Times New Roman',serif;letter-spacing:4px;text-align:center;margin-bottom:6px;text-shadow:0 0 10px rgba(255,200,50,.4)}
  .boss-hp-bg{width:100%;height:14px;background:#1a0a0a;border:1px solid #552200;border-radius:2px;overflow:hidden;box-shadow:inset 0 0 8px rgba(0,0,0,.9),0 0 12px rgba(200,50,0,.2)}
  .boss-hp-fill{height:100%;width:100%;background:linear-gradient(180deg,#cc3300,#881100);box-shadow:0 0 8px rgba(255,60,0,.4);transition:width .25s ease-out}
  .victory-text{position:absolute;top:45%;left:50%;transform:translate(-50%,-50%);color:#ffdd88;font:bold 72px 'Times New Roman',serif;letter-spacing:12px;text-shadow:0 0 40px rgba(255,200,50,.7),0 0 80px rgba(255,150,0,.4);opacity:0;transition:opacity 2s ease-in}
  .victory-text.active{opacity:1}
`;
document.body.appendChild(style);

export const hpBarEl = document.getElementById('hpBar');
export const stBarEl = document.getElementById('stBar');
export const hpTextEl = document.getElementById('hpText');
export const stTextEl = document.getElementById('stText');
export const estusCountEl = document.getElementById('estusCount');
export const lockOnUI = document.getElementById('lockOnUI');
export const healOL = document.getElementById('healOL');
export const dmgOL = document.getElementById('dmgOL');
export const youDiedEl = document.getElementById('youDied');
export const interactPrompt = document.getElementById('interactPrompt');
export const bossTextEl = document.getElementById('bossText');
export const fpsCounter      = document.getElementById('fpsCounter');
export const savedTextEl     = document.getElementById('savedText');
export const fadeOverlay     = document.getElementById('fadeOverlay');
export const bossHpContainer = document.getElementById('bossHpContainer');
export const bossHpBar       = document.getElementById('bossHpBar');
export const victoryTextEl   = document.getElementById('victoryText');

// ============================================================
//  リサイズ
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
//  操作ヒント
// ============================================================
const hint = document.createElement('div');
hint.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);color:#555;font:12px monospace;text-align:center;pointer-events:none';
hint.innerHTML = 'WASD:移動 ｜ マウス:視点 ｜ Space:回避 ｜ 左クリック:攻撃 ｜ F:ロックオン ｜ R:回復 ｜ E:調べる';
document.body.appendChild(hint);
