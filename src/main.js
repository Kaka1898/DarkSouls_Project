import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import {
  scene, renderer, camera, spotLight, dirLight,
  fogGateGroup, distXZ, updateWorldEffects,
  hpBarEl, stBarEl, hpTextEl, stTextEl,
  estusCountEl, lockOnUI, healOL,
  interactPrompt, bossTextEl, fpsCounter,
  optionsOverlay, optBrightness, optBrightVal,
  optResolution, optResVal, optShadowBtns,
} from './world.js';
import {
  player, P, input, initInput,
  isPlayerBusy, updatePlayer, updatePlayerVisuals,
  LOCK_ON_RANGE,
} from './player.js';
import {
  enemy, updateEnemyAI, updateEnemyVisuals,
  lockOnRing, lockOnRingMat,
} from './enemy.js';

// ============================================================
//  初期化
// ============================================================
const stats = new Stats();
document.body.appendChild(stats.dom);

initInput();

// ============================================================
//  設定メニュー・ポーズ
// ============================================================
let paused = false;

function toggleMenu() {
  paused = !paused;
  optionsOverlay.classList.toggle('active', paused);
  if (paused && document.pointerLockElement) {
    document.exitPointerLock();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    e.preventDefault();
    toggleMenu();
  }
});

// Brightness スライダー
optBrightness.addEventListener('input', () => {
  const v = parseFloat(optBrightness.value);
  renderer.toneMappingExposure = v;
  optBrightVal.textContent = v.toFixed(2);
});

// Resolution スライダー
optResolution.addEventListener('input', () => {
  const v = parseFloat(optResolution.value);
  renderer.setPixelRatio(v);
  renderer.setSize(window.innerWidth, window.innerHeight);
  optResVal.textContent = v.toFixed(2);
});

// Shadow Quality ボタン
optShadowBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    optShadowBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const level = btn.dataset.shadow;
    if (level === 'low') {
      renderer.shadowMap.enabled = false;
    } else if (level === 'med') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.BasicShadowMap;
      dirLight.shadow.mapSize.set(1024, 1024);
      dirLight.shadow.map?.dispose();
      dirLight.shadow.map = null;
      spotLight.shadow.mapSize.set(512, 512);
      spotLight.shadow.map?.dispose();
      spotLight.shadow.map = null;
    } else {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      dirLight.shadow.mapSize.set(4096, 4096);
      dirLight.shadow.map?.dispose();
      dirLight.shadow.map = null;
      spotLight.shadow.mapSize.set(2048, 2048);
      spotLight.shadow.map?.dispose();
      spotLight.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;
  });
});

// ============================================================
//  カメラ状態
// ============================================================
let cameraYaw = Math.PI;
let cameraPitch = 0.3;
const cameraDistance = 6;
const cameraSmoothness = 0.08;
const cameraTarget = new THREE.Vector3();

// ============================================================
//  ロックオン
// ============================================================
let lockedOn = false;

// ============================================================
//  フォグゲート状態
// ============================================================
let fogGateActive = true;
let nearFogGate = false;
let enteringFogGate = false;
let fogEnterTimer = 0;
const FOG_ENTER_DURATION = 1.5;
let bossEncounterShown = false;

// ============================================================
//  ヒットストップ
// ============================================================
let hitStopTimer = 0;

// ============================================================
//  FPSカウンター
// ============================================================
let fpsFrames = 0, fpsTime = 0;

// ============================================================
//  ゲームループ
// ============================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  stats.begin();

  // ポーズ中: 時間を消費しつつ描画だけして返る
  if (paused) {
    clock.getDelta();
    renderer.render(scene, camera);
    stats.end();
    return;
  }

  const rawDt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  // FPS計測
  fpsFrames++;
  fpsTime += rawDt;
  if (fpsTime >= 0.5) {
    fpsCounter.textContent = `FPS: ${Math.round(fpsFrames / fpsTime)}`;
    fpsFrames = 0; fpsTime = 0;
  }

  // ワールドエフェクト
  updateWorldEffects(time, fpsFrames);

  // ヒットストップ中
  if (hitStopTimer > 0) {
    hitStopTimer -= rawDt;
    updateEnemyVisuals(rawDt);
    updatePlayerVisuals(rawDt);
    renderer.render(scene, camera);
    stats.end();
    return;
  }
  const dt = rawDt;

  // 死亡中
  if (P.isDead) {
    updateEnemyVisuals(dt);
    updatePlayerVisuals(dt);
    renderer.render(scene, camera);
    return;
  }

  // === フォグゲート進入中 ===
  if (enteringFogGate) {
    fogEnterTimer -= dt;
    P.z -= 3 * dt;
    P.facing = Math.PI;
    player.position.set(P.x, P.y, P.z);
    player.rotation.y = P.facing;
    const prog = 1 - fogEnterTimer / FOG_ENTER_DURATION;
    scene.fog.far = 65 - prog * 50;
    if (fogEnterTimer <= 0) {
      enteringFogGate = false;
      scene.fog.far = 65;
      if (!bossEncounterShown) {
        bossEncounterShown = true;
        bossTextEl.classList.add('active');
        setTimeout(() => bossTextEl.classList.remove('active'), 3000);
      }
    }
    updateEnemyVisuals(dt);
    updatePlayerVisuals(dt);
    updateHUD();
    renderer.render(scene, camera);
    stats.end();
    return;
  }

  // === ロックオン ===
  if (input.lockOnRequest) {
    input.lockOnRequest = false;
    if (lockedOn) {
      lockedOn = false;
    } else {
      const d = distXZ(P.x, P.z, enemy.group.position.x, enemy.group.position.z);
      if (d < LOCK_ON_RANGE && enemy.hp > 0) lockedOn = true;
    }
  }
  if (enemy.hp <= 0) lockedOn = false;

  // === カメラ回転 ===
  if (!lockedOn) {
    cameraYaw -= input.mouseDX * 0.003;
    cameraPitch += input.mouseDY * 0.003;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch, -0.5, 1.2);
  }
  input.mouseDX = 0; input.mouseDY = 0;
  if (lockedOn) {
    const dx = enemy.group.position.x - P.x, dz = enemy.group.position.z - P.z;
    let d = Math.atan2(dx, dz) - cameraYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cameraYaw += d * 0.12;
    cameraPitch = THREE.MathUtils.lerp(cameraPitch, 0.35, 0.05);
  }

  // === プレイヤー更新 ===
  const result = updatePlayer(dt, cameraYaw, lockedOn, enemy);
  if (result.hitStop > 0) hitStopTimer = result.hitStop;

  // スポットライト追従
  spotLight.position.set(P.x, P.y + 8, P.z + 2);
  spotLight.target = player;

  // === フォグゲート ===
  if (fogGateActive) {
    const fogDist = distXZ(P.x, P.z, fogGateGroup.position.x, fogGateGroup.position.z);
    nearFogGate = fogDist < 4;
    interactPrompt.classList.toggle('active', nearFogGate);
    if (input.interactRequest && nearFogGate && !isPlayerBusy(enteringFogGate)) {
      input.interactRequest = false;
      enteringFogGate = true;
      fogEnterTimer = FOG_ENTER_DURATION;
      fogGateActive = false;
      interactPrompt.classList.remove('active');
    }
  }
  input.interactRequest = false;

  // === 敵AI ===
  updateEnemyAI(dt, P);
  updateEnemyVisuals(dt);
  updatePlayerVisuals(dt);

  // === ロックオンマーカー ===
  if (lockedOn && enemy.hp > 0) {
    lockOnRingMat.opacity = 0.7 + Math.sin(time * 5) * 0.3;
    lockOnRing.position.x = enemy.group.position.x;
    lockOnRing.position.z = enemy.group.position.z;
  } else {
    lockOnRingMat.opacity = 0;
  }

  // === カメラ位置 ===
  let clX, clZ, clY;
  if (lockedOn && enemy.hp > 0) {
    clX = (P.x + enemy.group.position.x) / 2;
    clZ = (P.z + enemy.group.position.z) / 2;
    clY = P.y + 1.2;
  } else {
    clX = P.x; clZ = P.z; clY = P.y + 1.2;
  }
  const iX = P.x + Math.sin(cameraYaw) * cameraDistance * Math.cos(cameraPitch);
  const iY = P.y + 2 + cameraDistance * Math.sin(cameraPitch);
  const iZ = P.z + Math.cos(cameraYaw) * cameraDistance * Math.cos(cameraPitch);
  camera.position.x += (iX - camera.position.x) * cameraSmoothness;
  camera.position.y += (iY - camera.position.y) * cameraSmoothness;
  camera.position.z += (iZ - camera.position.z) * cameraSmoothness;
  cameraTarget.set(clX, clY, clZ);
  camera.lookAt(cameraTarget);

  updateHUD();
  renderer.render(scene, camera);
  stats.end();
}

// ============================================================
//  HUD更新
// ============================================================
function updateHUD() {
  hpBarEl.style.width = (P.hp / P.maxHp * 100) + '%';
  stBarEl.style.width = (P.stamina / P.maxStamina * 100) + '%';
  hpTextEl.textContent = `${Math.ceil(P.hp)}/${P.maxHp}`;
  stTextEl.textContent = `${Math.ceil(P.stamina)}/${P.maxStamina}`;
  stBarEl.classList.toggle('exhausted', P.isExhausted);
  estusCountEl.textContent = P.estusCount;
  estusCountEl.classList.toggle('empty', P.estusCount <= 0);
  lockOnUI.classList.toggle('active', lockedOn);
  healOL.classList.toggle('active', P.isHealing);
}

// ============================================================
//  開始
// ============================================================
animate();
