import * as THREE from 'three';
import {
  scene, renderer, getBoxGeo, getCylGeo,
  resolveCollision, getTerrainY, distXZ,
  dmgOL, youDiedEl,
} from './world.js';

// ============================================================
//  プレイヤーメッシュ
// ============================================================
export const player = new THREE.Group();
scene.add(player);

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.6, emissive: 0x000000 });
const body = new THREE.Mesh(getBoxGeo(0.8, 1.6, 0.5), bodyMat);
body.position.y = 0.8; body.castShadow = true; player.add(body);

const headMesh = new THREE.Mesh(getBoxGeo(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.7 }));
headMesh.position.y = 1.85; headMesh.castShadow = true; player.add(headMesh);

const marker = new THREE.Mesh(getBoxGeo(0.3, 0.3, 0.15), new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 0.3 }));
marker.position.set(0, 1.2, -0.32); player.add(marker);

const swordGroup = new THREE.Group();
swordGroup.position.set(0.55, 0.9, -0.1); player.add(swordGroup);
const blade = new THREE.Mesh(getBoxGeo(0.08, 1.2, 0.04), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.2 }));
blade.position.y = 0.6; blade.castShadow = true; swordGroup.add(blade);
swordGroup.add(new THREE.Mesh(getBoxGeo(0.12, 0.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x553311 })));

const flaskGroup = new THREE.Group();
flaskGroup.position.set(-0.5, 0.7, -0.1); flaskGroup.visible = false; player.add(flaskGroup);
const flaskMat = new THREE.MeshStandardMaterial({ color: 0xdd8822, emissive: 0xff6600, emissiveIntensity: 0.4 });
flaskGroup.add(new THREE.Mesh(getCylGeo(0.06, 0.3, 6), flaskMat));
const flaskNeck = new THREE.Mesh(getCylGeo(0.03, 0.12, 6), flaskMat);
flaskNeck.position.y = 0.2; flaskGroup.add(flaskNeck);

// ============================================================
//  エフェクト
// ============================================================
const attackArcMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0, side: THREE.DoubleSide });
const attackArc = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.8, 12, 1, 0, Math.PI * 0.6), attackArcMat);
attackArc.rotation.x = -Math.PI / 2; attackArc.position.y = 0.3; scene.add(attackArc);

const hitFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
const hitFlash = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), hitFlashMat);
scene.add(hitFlash);

const healAuraMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0, side: THREE.DoubleSide });
const healAura = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 10, 1, true), healAuraMat);
healAura.position.y = 1.0; player.add(healAura);

// ============================================================
//  入力
// ============================================================
export const input = {
  keys: {},
  mouseDX: 0,
  mouseDY: 0,
  attackRequest: false,
  lockOnRequest: false,
  healRequest: false,
  interactRequest: false,
};

export function initInput() {
  window.addEventListener('keydown', (e) => { input.keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  renderer.domElement.addEventListener('click', () => {
    if (!document.pointerLockElement) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement) {
      if (e.button === 0) input.attackRequest = true;
      if (e.button === 1) input.lockOnRequest = true;
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') input.lockOnRequest = true;
    if (e.code === 'KeyR') input.healRequest = true;
    if (e.code === 'KeyE') input.interactRequest = true;
  });
}

// ============================================================
//  プレイヤー状態
// ============================================================
export const P = {
  hp: 100, maxHp: 100, x: 0, y: 0, z: 8, vy: 0, facing: 0,
  rolling: false, rollTimer: 0, rollDuration: 0.4, rollSpeed: 12, rollDirX: 0, rollDirZ: 0,
  get isInvincible() { return this.rolling && this.rollTimer > this.rollDuration * 0.3; },
  attacking: false, attackTimer: 0, attackDuration: 0.5, attackLunged: false,
  stamina: 100, maxStamina: 100, staminaRegenRate: 18,
  staminaRegenDelay: 0.5, staminaDelayCurrent: 0,
  staminaCostAttack: 20, staminaCostRoll: 30, isExhausted: false,
  isHealing: false, healTimer: 0, healDuration: 1.5, healAmount: 40,
  estusCount: 5, estusMax: 5,
  hitFlashTimer: 0, knockbackVX: 0, knockbackVZ: 0, isDead: false,
  groundY: 0,
};

const GRAVITY = -25;
const MOVE_SPEED = 4;
export const PLAYER_RADIUS = 0.4;
export const LOCK_ON_RANGE = 20;

export function isPlayerBusy(extraCondition = false) {
  return P.attacking || P.rolling || P.isHealing || extraCondition;
}

// ============================================================
//  プレイヤー更新（メインループから呼ばれる）
//  戻り値: { hitStop: number } — ヒットストップ時間（0なら無し）
// ============================================================
export function updatePlayer(dt, cameraYaw, lockedOn, enemy) {
  let hitStopResult = 0;

  // --- 入力方向 ---
  const keys = input.keys;
  let inX = 0, inZ = 0;
  if (keys['KeyW'] || keys['ArrowUp']) inZ -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) inZ += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) inX -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) inX += 1;
  const hasIn = inX !== 0 || inZ !== 0;
  let mX = 0, mZ = 0;
  if (hasIn) {
    const l = Math.sqrt(inX * inX + inZ * inZ);
    mX = (inX / l) * Math.cos(cameraYaw) + (inZ / l) * Math.sin(cameraYaw);
    mZ = (inX / l) * -Math.sin(cameraYaw) + (inZ / l) * Math.cos(cameraYaw);
  }

  // --- スタミナ ---
  if (P.staminaDelayCurrent > 0) P.staminaDelayCurrent -= dt;
  else if (P.stamina < P.maxStamina) P.stamina = Math.min(P.maxStamina, P.stamina + P.staminaRegenRate * dt);
  if (P.isExhausted && P.stamina >= P.maxStamina * 0.2) P.isExhausted = false;

  // --- 回復 ---
  if (input.healRequest) {
    input.healRequest = false;
    if (!isPlayerBusy() && P.estusCount > 0 && P.hp < P.maxHp) {
      P.isHealing = true; P.healTimer = P.healDuration; P.estusCount--; flaskGroup.visible = true;
    }
  }
  if (P.isHealing) {
    P.healTimer -= dt;
    const pg = 1 - P.healTimer / P.healDuration;
    flaskGroup.position.y = pg < 0.4 ? 0.7 + pg * 2.5 : pg < 0.7 ? 1.7 : 1.7 - (pg - 0.7) * 3.3;
    healAuraMat.opacity = (pg > 0.35 && pg < 0.75) ? Math.sin(((pg - 0.35) / 0.4) * Math.PI) * 0.3 : 0;
    if (pg >= 0.6 && pg < 0.65) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * (P.healAmount / 100));
    if (P.healTimer <= 0) { P.isHealing = false; flaskGroup.visible = false; flaskGroup.position.y = 0.7; healAuraMat.opacity = 0; }
  }

  // --- ローリング ---
  if (keys['Space'] && !isPlayerBusy() && hasIn && !P.isExhausted && P.stamina >= P.staminaCostRoll) {
    P.stamina -= P.staminaCostRoll; P.staminaDelayCurrent = P.staminaRegenDelay;
    if (P.stamina <= 0) { P.stamina = 0; P.isExhausted = true; }
    P.rolling = true; P.rollTimer = P.rollDuration; P.rollDirX = mX; P.rollDirZ = mZ; keys['Space'] = false;
  }
  if (P.rolling) {
    P.rollTimer -= dt;
    let nx = P.x + P.rollDirX * P.rollSpeed * dt, nz = P.z + P.rollDirZ * P.rollSpeed * dt;
    const c = resolveCollision(nx, nz, PLAYER_RADIUS);
    P.x = c.x; P.z = c.z;
    const rp = 1 - P.rollTimer / P.rollDuration;
    body.rotation.x = rp * Math.PI * 2; headMesh.visible = false; marker.visible = false;
    if (P.rollTimer <= 0) { P.rolling = false; body.rotation.x = 0; headMesh.visible = true; marker.visible = true; }
  }

  // --- 攻撃 ---
  if (input.attackRequest) {
    input.attackRequest = false;
    if (!isPlayerBusy() && !P.isExhausted && P.stamina >= P.staminaCostAttack) {
      P.stamina -= P.staminaCostAttack; P.staminaDelayCurrent = P.staminaRegenDelay;
      if (P.stamina <= 0) { P.stamina = 0; P.isExhausted = true; }
      P.attacking = true; P.attackTimer = P.attackDuration; P.attackLunged = false; enemy.hitThisSwing = false;
      if (lockedOn) P.facing = Math.atan2(-(enemy.group.position.x - P.x), -(enemy.group.position.z - P.z));
    }
  }
  if (P.attacking) {
    P.attackTimer -= dt;
    const pg = 1 - P.attackTimer / P.attackDuration;
    if (pg < 0.3 && !P.attackLunged) {
      let nx = P.x - Math.sin(P.facing) * 6 * dt, nz = P.z - Math.cos(P.facing) * 6 * dt;
      const c = resolveCollision(nx, nz, PLAYER_RADIUS); P.x = c.x; P.z = c.z;
    }
    if (pg >= 0.3) P.attackLunged = true;
    swordGroup.rotation.z = Math.sin(pg * Math.PI) * -1.8;
    swordGroup.rotation.x = Math.sin(pg * Math.PI) * -0.5;
    attackArc.position.set(P.x - Math.sin(P.facing) * 1.2, 0.3, P.z - Math.cos(P.facing) * 1.2);
    attackArc.rotation.z = -P.facing;
    attackArcMat.opacity = pg < 0.6 ? 0.5 * (1 - pg / 0.6) : 0;

    // ヒット判定（敵へのダメージ）
    if (pg > 0.2 && pg < 0.65 && !enemy.hitThisSwing && enemy.hp > 0) {
      const ax = P.x - Math.sin(P.facing) * 1.5, az = P.z - Math.cos(P.facing) * 1.5;
      if (distXZ(ax, az, enemy.group.position.x, enemy.group.position.z) < 1.3) {
        enemy.hitThisSwing = true;
        enemy.hp = Math.max(0, enemy.hp - 12);
        enemy.hitTimer = 0.15;
        enemy.shakeTimer = 0.2;
        const kx = enemy.group.position.x - P.x, kz = enemy.group.position.z - P.z;
        const kl = Math.sqrt(kx * kx + kz * kz) || 1;
        enemy.shakeOriginX = enemy.group.position.x + (kx / kl) * 0.3;
        enemy.shakeOriginZ = enemy.group.position.z + (kz / kl) * 0.3;
        hitStopResult = 0.07;
        hitFlash.position.set((P.x + enemy.group.position.x) / 2, 1.2, (P.z + enemy.group.position.z) / 2);
        hitFlashMat.opacity = 1;
      }
    }
    if (P.attackTimer <= 0) {
      P.attacking = false; swordGroup.rotation.z = 0; swordGroup.rotation.x = 0; attackArcMat.opacity = 0;
    }
  }

  // --- 通常移動 ---
  if (!isPlayerBusy() && hasIn) {
    let nx = P.x + mX * MOVE_SPEED * dt, nz = P.z + mZ * MOVE_SPEED * dt;
    const c = resolveCollision(nx, nz, PLAYER_RADIUS); P.x = c.x; P.z = c.z;
    P.facing = lockedOn ? Math.atan2(-(enemy.group.position.x - P.x), -(enemy.group.position.z - P.z)) : Math.atan2(-mX, -mZ);
  } else if (!P.rolling && !P.attacking && lockedOn && enemy.hp > 0) {
    P.facing = Math.atan2(-(enemy.group.position.x - P.x), -(enemy.group.position.z - P.z));
  }

  // --- ノックバック ---
  if (P.knockbackVX !== 0 || P.knockbackVZ !== 0) {
    let nx = P.x + P.knockbackVX * dt, nz = P.z + P.knockbackVZ * dt;
    const c = resolveCollision(nx, nz, PLAYER_RADIUS); P.x = c.x; P.z = c.z;
    P.knockbackVX *= Math.max(0, 1 - 8 * dt); P.knockbackVZ *= Math.max(0, 1 - 8 * dt);
    if (Math.abs(P.knockbackVX) < 0.1 && Math.abs(P.knockbackVZ) < 0.1) { P.knockbackVX = 0; P.knockbackVZ = 0; }
  }

  // --- 地形 + 重力 ---
  const terrY = getTerrainY(P.x, P.z);
  if (terrY <= -10) { P.hp = 0; P.isDead = true; youDiedEl.classList.add('active'); }
  P.groundY = terrY;
  P.vy += GRAVITY * dt;
  P.y += P.vy * dt;
  if (P.y <= P.groundY) { P.y = P.groundY; P.vy = 0; }

  // --- 位置反映 ---
  player.position.set(P.x, P.y, P.z);
  player.rotation.y = P.facing;

  return { hitStop: hitStopResult };
}

// ============================================================
//  プレイヤービジュアル更新
// ============================================================
export function updatePlayerVisuals(dt) {
  if (P.hitFlashTimer > 0) {
    P.hitFlashTimer -= dt;
    const f = P.hitFlashTimer / 0.2;
    bodyMat.emissive.setRGB(f * 0.8, f * 0.1, f * 0.1);
    dmgOL.classList.add('active');
  } else {
    bodyMat.emissive.setRGB(0, 0, 0);
    dmgOL.classList.remove('active');
  }
  // ヒットフラッシュ（白い球）のフェード
  if (hitFlashMat.opacity > 0) {
    hitFlashMat.opacity -= dt * 8;
    if (hitFlashMat.opacity < 0) hitFlashMat.opacity = 0;
  }
}
