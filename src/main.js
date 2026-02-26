import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import {
  scene, renderer, camera, spotLight, dirLight, composer,
  fogGateGroup, distXZ, updateWorldEffects,
  disableFogGateCollision, enableFogGateCollision,
  hpBarEl, stBarEl, hpTextEl, stTextEl,
  estusCountEl, lockOnUI, healOL,
  interactPrompt, bossTextEl, fpsCounter,
  bonfireGroup, bonfireRingMat,
  bonfire2Group, bonfire2RingMat,
  savedTextEl, fadeOverlay, youDiedEl,
  bossHpContainer, bossHpBar, victoryTextEl,
  bokehPass, bloomPass,
} from './world.js';
import {
  player, P, input, initInput,
  isPlayerBusy, updatePlayer, updatePlayerVisuals,
  LOCK_ON_RANGE, respawn, playVictorySound, playHitImpact,
  spawnHitParticles, hitFlash, hitFlashMat,
  spawnDamageNumber, updateDamageNumbers,
  playPlayerHitSound, playLockOnSound, playLockOffSound,
  playFogGateSound, playSaveSound,
  applyWeaponVisual, applyShieldVisual, applyHelmetVisual, applyArmorVisual,
} from './player.js';
import {
  enemy, updateEnemyAI, updateEnemyVisuals,
  lockOnRing, lockOnRingMat, resetEnemy,
} from './enemy.js';
import {
  boss, updateBossAI, updateBossVisuals, resetBoss,
  updateFirePillars, setBossPlayerVelocity,
} from './boss.js';
import {
  isMenuOpen, openMenu, closeMenu, toggleMenu, renderPreview, setOnEquipChange,
  equipped, EQUIPMENT_DB, calcStats,
  initMobileControls, mobileInput,
} from './ui.js';

// ============================================================
//  初期化
// ============================================================
const stats = new Stats();
document.body.appendChild(stats.dom);

initInput();

// モバイルコントロール初期化（タッチ端末のみ UI が生成される）
initMobileControls({
  onAttack: () => { input.attackRequest = true; },
  // Space キーを1フレームだけ仮想押下してロールを発火
  onRoll: () => {
    input.keys['Space'] = true;
    requestAnimationFrame(() => { input.keys['Space'] = false; });
  },
  onEstus: () => { input.healRequest = true; },
});

// ============================================================
//  ポーズメニュー（ダークソウル風装備画面）
//  ※ Pointer Lock 連携: ブラウザの ESC による強制解除を検知してメニューを開く
// ============================================================

// 装備変更コールバック
setOnEquipChange((slotKey, idx) => {
  const dbKey = slotKey === 'ring1' || slotKey === 'ring2' ? 'ring' : slotKey;
  const item = EQUIPMENT_DB[dbKey]?.[idx];
  if (!item) return;
  // ビジュアル反映
  if (slotKey === 'rightHand') applyWeaponVisual(item.id);
  if (slotKey === 'leftHand') applyShieldVisual(item.id);
  if (slotKey === 'helmet') applyHelmetVisual(item.id);
  if (slotKey === 'armor') applyArmorVisual(item.id);
  // パラメータ反映
  const stats = calcStats();
  P.weaponDamage = stats.attack || 10;
  P.maxHp = 100 + stats.bonusHp;
  P.hp = Math.min(P.hp, P.maxHp);
  P.staminaRegenRate = 18 + stats.bonusStRegen;
});

// --- Pointer Lock 解除 → メニュー自動表示 ---
// ブラウザは ESC で Pointer Lock を強制解除する。
// keydown('Escape') は Pointer Lock 解除時にブラウザに食われて発火しないため、
// pointerlockchange イベントを唯一のトリガーとして使用する。
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === null) {
    // Pointer Lock が解除された → メニューを開く（まだ開いていなければ）
    if (!isMenuOpen()) {
      openMenu();
    }
  }
});

// ============================================================
//  カメラ状態
// ============================================================
let cameraYaw = Math.PI;
let cameraPitch = 0.3;
const cameraDistance = 6;
const cameraSmoothness = 0.14;
const cameraTarget = new THREE.Vector3();

// カメラ壁貫通防止用 Raycaster
const cameraRaycaster = new THREE.Raycaster();
const CAM_COLLISION_MARGIN = 0.3; // 壁からのオフセット
const _camOrigin = new THREE.Vector3();
const _camIdeal = new THREE.Vector3();
const _camDir = new THREE.Vector3();

// ============================================================
//  ロックオン
// ============================================================
let lockedOn = false;

// ============================================================
//  篝火・チェックポイント
// ============================================================
let checkpointX = 0, checkpointZ = 7;
// localStorage からチェックポイントを復元
try {
  const saved = localStorage.getItem('darksouls_checkpoint');
  if (saved) { const cp = JSON.parse(saved); checkpointX = cp.x; checkpointZ = cp.z; }
} catch (e) { /* ignore */ }

let nearBonfire = false;

// ============================================================
//  死のループ状態
// ============================================================
let deathPhase = 'none'; // 'none' | 'wait' | 'fadeout' | 'fadein'
let deathTimer = 0;
const DEATH_WAIT = 3.0;   // YOU DIED 表示時間
const FADE_DURATION = 1.0; // フェードイン/アウト時間

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
//  ボス戦状態
// ============================================================
let bossActive = false;
let bossDefeated = false;
let victoryPhase = 'none'; // 'none' | 'slowmo' | 'text' | 'done'
let victoryTimer = 0;
let slowMoFactor = 1.0;
let lockOnTarget = 'enemy'; // 'enemy' | 'boss'
let bossPhaseHitStop = false; // Phase遷移ヒットストップ済み
let wasPlayerAttacking = false; // 攻撃開始エッジ検出用
let prevComboStep = 0; // コンボステップ変更検出用

// ============================================================
//  ヒットストップ
// ============================================================
let hitStopTimer = 0;

// ============================================================
//  カメラシェイク
// ============================================================
let cameraShakeTimer = 0;
let cameraShakeDuration = 0;
let cameraShakeIntensity = 0;

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

  // ポーズ中: タイムスケール0、背面シーン描画 + プレビュー描画
  if (isMenuOpen()) {
    clock.getDelta(); // 時間消費
    composer.render(); // 背面シーンも描画し続ける（AA有効）
    renderPreview(player); // 3Dキャラプレビュー
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
    if (bossActive) updateBossVisuals(rawDt);
    updatePlayerVisuals(rawDt);
    composer.render();
    stats.end();
    return;
  }
  const dt = rawDt;

  // === 死のループ制御 ===
  if (P.isDead) {
    if (deathPhase === 'none') {
      deathPhase = 'wait';
      deathTimer = DEATH_WAIT;
    }
    if (deathPhase === 'wait') {
      deathTimer -= rawDt;
      if (deathTimer <= 0) {
        deathPhase = 'fadeout';
        deathTimer = FADE_DURATION;
      }
    } else if (deathPhase === 'fadeout') {
      deathTimer -= rawDt;
      fadeOverlay.style.opacity = 1 - deathTimer / FADE_DURATION;
      if (deathTimer <= 0) {
        // フェードアウト完了 → リスポーン
        youDiedEl.classList.remove('active');
        respawn(checkpointX, checkpointZ);
        resetEnemy();
        resetBoss();
        bossActive = false;
        bossDefeated = false;
        victoryPhase = 'none';
        slowMoFactor = 1.0;
        bossPhaseHitStop = false;
        bossHpContainer.classList.remove('active');
        lockedOn = false;
        lockOnTarget = 'enemy';
        fogGateActive = true;
        enableFogGateCollision(); // 霧ゲートの衝突判定を復活
        bossEncounterShown = false;
        enteringFogGate = false;
        fadeOverlay.style.opacity = '1';
        deathPhase = 'fadein';
        deathTimer = FADE_DURATION;
      }
    } else if (deathPhase === 'fadein') {
      deathTimer -= rawDt;
      fadeOverlay.style.opacity = deathTimer / FADE_DURATION;
      if (deathTimer <= 0) {
        fadeOverlay.style.opacity = '0';
        deathPhase = 'none';
      }
      // フェードイン中も描画
      updateEnemyVisuals(rawDt);
      if (bossActive) updateBossVisuals(rawDt);
      updatePlayerVisuals(rawDt);
      updateHUD();
      composer.render();
      stats.end();
      return;
    }
    updateEnemyVisuals(rawDt);
    if (bossActive) updateBossVisuals(rawDt);
    updatePlayerVisuals(rawDt);
    composer.render();
    stats.end();
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
    scene.fog.density = 0.028 + prog * 0.08;
    if (fogEnterTimer <= 0) {
      enteringFogGate = false;
      scene.fog.density = 0.028;
      if (!bossEncounterShown) {
        bossEncounterShown = true;
        bossTextEl.textContent = '門衛の騎士';
        bossTextEl.classList.add('active');
        setTimeout(() => bossTextEl.classList.remove('active'), 3000);
        bossActive = true;
        bossHpContainer.classList.add('active');
      }
    }
    updateEnemyVisuals(dt);
    if (bossActive) updateBossVisuals(dt);
    updatePlayerVisuals(dt);
    updateHUD();
    composer.render();
    stats.end();
    return;
  }

  // === ロックオン（敵 or ボス） ===
  if (input.lockOnRequest) {
    input.lockOnRequest = false;
    if (lockedOn) {
      lockedOn = false;
      playLockOffSound();
    } else {
      const dEnemy = distXZ(P.x, P.z, enemy.group.position.x, enemy.group.position.z);
      const dBoss = distXZ(P.x, P.z, boss.group.position.x, boss.group.position.z);
      if (bossActive && !bossDefeated && boss.hp > 0 && dBoss < LOCK_ON_RANGE) {
        lockedOn = true; lockOnTarget = 'boss'; playLockOnSound();
      } else if (dEnemy < LOCK_ON_RANGE && enemy.hp > 0) {
        lockedOn = true; lockOnTarget = 'enemy'; playLockOnSound();
      }
    }
  }
  // ロックオンターゲットが死んだら解除
  if (lockedOn) {
    if (lockOnTarget === 'enemy' && enemy.hp <= 0) lockedOn = false;
    if (lockOnTarget === 'boss' && (boss.hp <= 0 || !bossActive)) lockedOn = false;
  }

  // === カメラ回転 ===
  if (!lockedOn) {
    cameraYaw -= input.mouseDX * 0.003;
    cameraPitch += input.mouseDY * 0.003;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch, -0.5, 1.2);
  }
  input.mouseDX = 0; input.mouseDY = 0;
  if (lockedOn) {
    const tgt = lockOnTarget === 'boss' ? boss.group : enemy.group;
    const dx = tgt.position.x - P.x, dz = tgt.position.z - P.z;
    let targetYaw = Math.atan2(dx, dz) + Math.PI;
    let d = targetYaw - cameraYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cameraYaw += d * 0.18;
    cameraPitch = THREE.MathUtils.lerp(cameraPitch, lockOnTarget === 'boss' ? 0.45 : 0.35, 0.05);
  }

  // === プレイヤー更新 ===
  const lockTgt = (lockedOn && lockOnTarget === 'boss') ? boss : enemy;
  const wasAtk = wasPlayerAttacking;
  const result = updatePlayer(dt * slowMoFactor, cameraYaw, lockedOn, enemy, lockTgt);
  // 攻撃開始 or コンボステップ変更 → ボスの被弾フラグリセット
  if ((P.attacking && !wasAtk) || (P.attacking && P.comboStep !== prevComboStep)) boss.hitThisSwing = false;
  wasPlayerAttacking = P.attacking;
  prevComboStep = P.comboStep;
  if (result.hitStop > 0) hitStopTimer = result.hitStop;
  if (result.cameraShake > 0) {
    cameraShakeTimer = result.cameraShake;
    cameraShakeDuration = result.cameraShake;
    cameraShakeIntensity = result.cameraShake > 0.1 ? 0.25 : 0.1; // Poise破壊は強め
  }

  // プレイヤー速度をボスAI予測に送信
  setBossPlayerVelocity(P.velX, P.velZ);

  // スポットライト追従
  spotLight.position.set(P.x, P.y + 8, P.z + 2);
  spotLight.target = player;

  // === 篝火インタラクション（第1・第2共通） ===
  {
    const bf1Dist = distXZ(P.x, P.z, bonfireGroup.position.x, bonfireGroup.position.z);
    const bf2Dist = distXZ(P.x, P.z, bonfire2Group.position.x, bonfire2Group.position.z);
    const nearBf1 = bf1Dist < 3, nearBf2 = bf2Dist < 3;
    nearBonfire = nearBf1 || nearBf2;
    bonfireRingMat.opacity = nearBf1 ? 0.4 + Math.sin(time * 3) * 0.15 : 0;
    bonfire2RingMat.opacity = nearBf2 ? 0.4 + Math.sin(time * 3) * 0.15 : 0;
    if (nearBonfire && !nearFogGate) {
      interactPrompt.textContent = '篝火で休む [E]';
      interactPrompt.classList.toggle('active', true);
    } else if (!nearFogGate) {
      interactPrompt.classList.remove('active');
    }
    if (input.interactRequest && nearBonfire && !isPlayerBusy(enteringFogGate)) {
      checkpointX = P.x; checkpointZ = P.z;
      P.hp = P.maxHp; P.stamina = P.maxStamina; P.estusCount = P.estusMax;
      try { localStorage.setItem('darksouls_checkpoint', JSON.stringify({ x: checkpointX, z: checkpointZ })); } catch (e) { /* ignore */ }
      savedTextEl.classList.add('active');
      setTimeout(() => savedTextEl.classList.remove('active'), 2000);
      playSaveSound();
      input.interactRequest = false;
    }
  }

  // === フォグゲート ===
  if (fogGateActive) {
    const fogDist = distXZ(P.x, P.z, fogGateGroup.position.x, fogGateGroup.position.z);
    nearFogGate = fogDist < 4;
    interactPrompt.textContent = '霧の中に入る [E]';
    interactPrompt.classList.toggle('active', nearFogGate);
    if (input.interactRequest && nearFogGate && !isPlayerBusy(enteringFogGate)) {
      input.interactRequest = false;
      disableFogGateCollision(); // 衝突判定を解除して通過可能にする
      enteringFogGate = true;
      fogEnterTimer = FOG_ENTER_DURATION;
      fogGateActive = false;
      interactPrompt.classList.remove('active');
      playFogGateSound();
    }
  }
  input.interactRequest = false;

  // === 敵AI ===
  updateEnemyAI(dt * slowMoFactor, P);
  updateEnemyVisuals(rawDt);

  // === ボスAI + ヒット判定 ===
  if (bossActive && !bossDefeated) {
    const bdt = dt * slowMoFactor;
    updateBossAI(bdt, P);
    updateBossVisuals(rawDt);
    updateFirePillars(bdt, P);

    // ボスHPバー更新
    bossHpBar.style.width = (boss.hp / boss.maxHp * 100) + '%';

    // Phase遷移ヒットストップ
    if (boss.phase === 2 && !bossPhaseHitStop) {
      bossPhaseHitStop = true;
      hitStopTimer = 0.5;
      cameraShakeTimer = 0.4;
      cameraShakeDuration = 0.4;
      cameraShakeIntensity = 0.3;
    }

    // プレイヤー攻撃 → ボスへのヒット判定
    if (P.attacking) {
      const pg = 1 - P.attackTimer / P.attackDuration;
      if (pg > 0.2 && pg < 0.65 && !boss.hitThisSwing && boss.hp > 0) {
        const ax = P.x - Math.sin(P.facing) * 1.8;
        const az = P.z - Math.cos(P.facing) * 1.8;
        if (distXZ(ax, az, boss.group.position.x, boss.group.position.z) < 2.2) {
          boss.hitThisSwing = true;
          boss.hp = Math.max(0, boss.hp - P.weaponDamage);
          boss.hitTimer = 0.15;
          boss.poise -= P.weaponImpact;
          boss.poiseRegenDelay = 2.0;
          const kx = boss.group.position.x - P.x, kz = boss.group.position.z - P.z;
          const kl = Math.sqrt(kx * kx + kz * kz) || 1;
          const hitX = (P.x + boss.group.position.x) / 2;
          const hitY = 1.8;
          const hitZ = (P.z + boss.group.position.z) / 2;
          playHitImpact();
          spawnDamageNumber(hitX, hitY + 0.5, hitZ, P.weaponDamage, boss.poise <= 0);
          if (boss.poise <= 0) {
            boss.staggered = true;
            boss.staggerTimer = boss.staggerDuration;
            boss.aiState = 'stagger';
            boss.kbVX = (kx / kl) * 3;
            boss.kbVZ = (kz / kl) * 3;
            boss.shakeTimer = 0.35;
            hitStopTimer = P.weaponHitStop * 2;
            cameraShakeTimer = 0.15;
            cameraShakeDuration = 0.15;
            cameraShakeIntensity = 0.25;
          } else {
            boss.shakeTimer = 0.15;
            boss.kbVX += (kx / kl) * 1;
            boss.kbVZ += (kz / kl) * 1;
            hitStopTimer = P.weaponHitStop;
            cameraShakeTimer = 0.06;
            cameraShakeDuration = 0.06;
            cameraShakeIntensity = 0.1;
          }
          boss.shakeOriginX = boss.group.position.x;
          boss.shakeOriginZ = boss.group.position.z;

          // ヒットフラッシュ + パーティクル
          hitFlash.position.set(hitX, hitY, hitZ);
          hitFlashMat.opacity = 1;
          if (boss.poise <= 0) {
            spawnHitParticles(hitX, hitY, hitZ, 30, 5, 10);
          } else {
            spawnHitParticles(hitX, hitY, hitZ, 15, 3, 6);
          }
        }
      }
    }

    // ボス撃破チェック
    if (boss.hp <= 0 && victoryPhase === 'none') {
      victoryPhase = 'slowmo';
      victoryTimer = 3.0;
      slowMoFactor = 0.15;
      playVictorySound();
      lockedOn = false;
    }
  }

  // === 勝利演出 ===
  if (victoryPhase === 'slowmo') {
    victoryTimer -= rawDt;
    if (victoryTimer <= 0) {
      victoryPhase = 'text';
      victoryTimer = 5.0;
      slowMoFactor = 1.0;
      victoryTextEl.classList.add('active');
      bossHpContainer.classList.remove('active');
    }
  } else if (victoryPhase === 'text') {
    victoryTimer -= rawDt;
    if (victoryTimer <= 0) {
      victoryPhase = 'done';
      victoryTextEl.classList.remove('active');
      bossDefeated = true;
    }
  }

  updatePlayerVisuals(dt);

  // === ロックオンマーカー ===
  if (lockedOn) {
    const tgt = lockOnTarget === 'boss' ? boss.group : enemy.group;
    lockOnRingMat.opacity = 0.7 + Math.sin(time * 5) * 0.3;
    lockOnRing.position.x = tgt.position.x;
    lockOnRing.position.z = tgt.position.z;
    lockOnRing.position.y = 0.05;
  } else {
    lockOnRingMat.opacity = 0;
  }

  // === モバイル簡易オートカメラ ===
  // スティック操作中かつロックオン中でない場合、カメラをプレイヤーの後方に緩やかに引き寄せる。
  // P.facing はプレイヤーが向いている方向 (atan2(-mX, -mZ))。
  // カメラがプレイヤーの真後ろにあるとき cameraYaw === P.facing。
  if (mobileInput.active && !lockedOn) {
    let diff = P.facing - cameraYaw;
    // 最短経路で補間（±PI 折り返し）
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // スティック強度に応じて追従速度を変える（力が弱いときは穏やかに）
    const stickMag = Math.sqrt(mobileInput.stickX ** 2 + mobileInput.stickZ ** 2);
    cameraYaw += diff * Math.min(1.0, 1.8 * dt) * stickMag;
  }

  // === カメラ位置（壁貫通防止付き） ===
  let clX, clZ, clY;
  if (lockedOn) {
    const tgt = lockOnTarget === 'boss' ? boss.group : enemy.group;
    clX = (P.x + tgt.position.x) / 2;
    clZ = (P.z + tgt.position.z) / 2;
    clY = P.y + 1.2;
  } else {
    clX = P.x; clZ = P.z; clY = P.y + 1.2;
  }
  const iX = P.x + Math.sin(cameraYaw) * cameraDistance * Math.cos(cameraPitch);
  const iY = P.y + 2 + cameraDistance * Math.sin(cameraPitch);
  const iZ = P.z + Math.cos(cameraYaw) * cameraDistance * Math.cos(cameraPitch);

  // Raycast: プレイヤー肩位置 → 理想カメラ位置の間に壁があるか判定
  _camOrigin.set(P.x, P.y + 1.5, P.z);
  _camIdeal.set(iX, iY, iZ);
  _camDir.subVectors(_camIdeal, _camOrigin);
  const camFullDist = _camDir.length();
  _camDir.normalize();
  const camOrigin = _camOrigin;
  const camDir = _camDir;
  cameraRaycaster.set(camOrigin, camDir);
  cameraRaycaster.far = camFullDist;
  cameraRaycaster.near = 0;
  const hits = cameraRaycaster.intersectObjects(scene.children, true);
  // プレイヤー自身・UI要素・透明物・パーティクルを除外して最初の壁ヒットを探す
  let wallDist = camFullDist;
  for (let hi = 0; hi < hits.length; hi++) {
    const h = hits[hi];
    // 透明・半透明メッシュ、Points、プレイヤーメッシュを除外
    if (h.object.type === 'Points') continue;
    if (h.object.material && h.object.material.transparent && h.object.material.opacity < 0.5) continue;
    // プレイヤーグループの子を除外
    let isPlayer = false;
    let obj = h.object;
    while (obj) {
      if (obj === player) { isPlayer = true; break; }
      obj = obj.parent;
    }
    if (isPlayer) continue;
    // 敵・ボスも除外（カメラがキャラに引っかからないように）
    let isCharacter = false;
    obj = h.object;
    while (obj) {
      if (obj === enemy.group || obj === boss.group) { isCharacter = true; break; }
      obj = obj.parent;
    }
    if (isCharacter) continue;
    wallDist = h.distance - CAM_COLLISION_MARGIN;
    break;
  }
  // 壁が近い場合、カメラをプレイヤーに寄せる
  const safeDist = Math.max(1.0, Math.min(wallDist, camFullDist));
  const safeRatio = safeDist / camFullDist;
  const safeX = camOrigin.x + camDir.x * safeDist;
  const safeY = camOrigin.y + camDir.y * safeDist;
  const safeZ = camOrigin.z + camDir.z * safeDist;
  // 壁に当たっている場合は即座に移動（めり込み防止）、そうでなければスムーズ補間
  const smooth = safeRatio < 0.95 ? 0.35 : cameraSmoothness;
  camera.position.x += (safeX - camera.position.x) * smooth;
  camera.position.y += (safeY - camera.position.y) * smooth;
  camera.position.z += (safeZ - camera.position.z) * smooth;
  cameraTarget.set(clX, clY, clZ);
  camera.lookAt(cameraTarget);

  // カメラシェイク
  if (cameraShakeTimer > 0) {
    cameraShakeTimer -= dt;
    const ratio = Math.max(0, cameraShakeTimer / cameraShakeDuration);
    const shakeX = (Math.random() - 0.5) * 2 * cameraShakeIntensity * ratio;
    const shakeY = (Math.random() - 0.5) * 2 * cameraShakeIntensity * ratio;
    camera.position.x += shakeX;
    camera.position.y += shakeY;
  }

  // === 被写界深度（BokehPass）フォーカス距離 ===
  if (lockedOn) {
    const tgt = lockOnTarget === 'boss' ? boss.group : enemy.group;
    const focusDist = camera.position.distanceTo(tgt.position);
    bokehPass.uniforms['focus'].value = THREE.MathUtils.lerp(
      bokehPass.uniforms['focus'].value, focusDist, 0.1
    );
  } else {
    bokehPass.uniforms['focus'].value = THREE.MathUtils.lerp(
      bokehPass.uniforms['focus'].value, 10.0, 0.05
    );
  }

  // === Bloom強度動的制御 ===
  if (bossActive && boss.phase === 2 && (boss.aiState === 'attack_fire_slam' || boss.aiState.startsWith('windup'))) {
    bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, 0.45, 0.1);
  } else {
    bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, 0.3, 0.05);
  }

  updateHUD();
  updateDamageNumbers(rawDt);
  composer.render();
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
