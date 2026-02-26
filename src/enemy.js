import * as THREE from 'three';
import {
  scene, getBoxGeo, getCylGeo,
  resolveCollision, distXZ, camera, youDiedEl,
  envMap, boneTex, boneNormal, hrBone,
} from './world.js';
import { playPlayerHitSound } from './player.js';

// ============================================================
//  骨の衛兵 (Skeletal Sentinel)
// ============================================================
const enemyEyeGeo = new THREE.SphereGeometry(0.07, 6, 6);

export function createEnemy(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  // 骨マテリアル（古びた暗い骨）
  const eMat = new THREE.MeshStandardMaterial({
    map: hrBone.map, normalMap: hrBone.normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: hrBone.roughnessMap, roughness: 0.92,
    aoMap: hrBone.aoMap, aoMapIntensity: 0.7,
    color: 0xaa9978, metalness: 0.02, emissive: 0x000000,
    envMap, envMapIntensity: 0.25,
  });

  // 胴体（細身 — プレイヤーより幅狭）
  const torso = new THREE.Mesh(getBoxGeo(0.4, 1.0, 0.3), eMat);
  torso.position.y = 1.0; torso.castShadow = true; bodyGroup.add(torso);
  // 肋骨ライン
  const ribLine = new THREE.Mesh(getBoxGeo(0.42, 0.06, 0.32), eMat);
  ribLine.position.y = 1.15; bodyGroup.add(ribLine);
  const ribLine2 = new THREE.Mesh(getBoxGeo(0.41, 0.06, 0.31), eMat);
  ribLine2.position.y = 0.95; bodyGroup.add(ribLine2);
  // 脊椎（猫背を表現 — 背中側に突出）
  const spine = new THREE.Mesh(getCylGeo(0.06, 0.8, 5), eMat);
  spine.position.set(0, 1.15, 0.2); spine.rotation.x = -0.3;
  spine.castShadow = true; bodyGroup.add(spine);
  // 腰（細い）
  const pelvis = new THREE.Mesh(getBoxGeo(0.35, 0.2, 0.25), eMat);
  pelvis.position.y = 0.45; bodyGroup.add(pelvis);

  // 頭（小さめ + 前傾で猫背感）
  const head = new THREE.Mesh(getBoxGeo(0.3, 0.32, 0.3), eMat);
  head.position.set(0, 1.6, -0.1); head.rotation.x = 0.15;
  head.castShadow = true; bodyGroup.add(head);
  // 顎
  const jaw = new THREE.Mesh(getBoxGeo(0.25, 0.08, 0.15), eMat);
  jaw.position.set(0, 1.42, -0.18); bodyGroup.add(jaw);

  // 目（発光苔色 — 青緑エミッシブ）
  const eyMat = new THREE.MeshStandardMaterial({
    color: 0x22cc88, emissive: 0x22cc88, emissiveIntensity: 2.0,
  });
  const eyL = new THREE.Mesh(enemyEyeGeo, eyMat); eyL.position.set(-0.1, 1.62, -0.24); bodyGroup.add(eyL);
  const eyR = new THREE.Mesh(enemyEyeGeo, eyMat); eyR.position.set(0.1, 1.62, -0.24); bodyGroup.add(eyR);

  // 腕（長い — プレイヤーより1.3倍長）
  const armL = new THREE.Mesh(getCylGeo(0.05, 1.1, 5), eMat);
  armL.position.set(-0.32, 0.85, 0); armL.castShadow = true; bodyGroup.add(armL);
  const armR = new THREE.Mesh(getCylGeo(0.05, 1.1, 5), eMat);
  armR.position.set(0.32, 0.85, 0); armR.castShadow = true; bodyGroup.add(armR);
  // 脚
  const legL = new THREE.Mesh(getCylGeo(0.07, 0.65, 5), eMat);
  legL.position.set(-0.12, 0.05, 0); legL.castShadow = true; bodyGroup.add(legL);
  const legR = new THREE.Mesh(getCylGeo(0.07, 0.65, 5), eMat);
  legR.position.set(0.12, 0.05, 0); legR.castShadow = true; bodyGroup.add(legR);

  // 猫背の前傾ポーズ
  bodyGroup.rotation.x = 0.12;

  // 武器
  const wg = new THREE.Group(); wg.position.set(0.35, 1.0, -0.2); bodyGroup.add(wg);
  const clubMat = new THREE.MeshStandardMaterial({
    map: hrBone.map, normalMap: hrBone.normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: hrBone.roughnessMap, roughness: 0.9,
    color: 0x998877, metalness: 0.02,
    envMap, envMapIntensity: 0.25,
  });
  const club = new THREE.Mesh(getBoxGeo(0.1, 1.0, 0.1), clubMat); club.position.y = 0.5; club.castShadow = true; wg.add(club);
  const cHead = new THREE.Mesh(getBoxGeo(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({
    color: 0x555555, metalness: 0.5, roughness: 0.4, envMap, envMapIntensity: 0.6,
  })); cHead.position.y = 1.0; wg.add(cHead);

  const hpGroup = new THREE.Group();
  hpGroup.position.y = 2.5;
  group.add(hpGroup);
  const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.12), new THREE.MeshBasicMaterial({ color: 0x333333 }));
  hpGroup.add(hpBg);
  const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
  hpFill.position.z = 0.001;
  hpGroup.add(hpFill);
  scene.add(group);
  return {
    group, bodyGroup, bodyMat: eMat, hpGroup, hpBarFill: hpFill, hpBarBg: hpBg, weaponGroup: wg,
    hp: 100, maxHp: 100, hitTimer: 0, shakeTimer: 0,
    shakeOriginX: x, shakeOriginZ: z, baseX: x, baseZ: z, hitThisSwing: false,
    originalColor: 0x998870,
    // AI
    aiState: 'idle', aiTimer: 0, aiSpeed: 2.5, aiDetectRange: 20,
    aiAttackType: 'none',
    aiAttackHit1: false, aiAttackHit2: false,
    aiStrafeDir: 1, aiStrafeTimer: 0,
    aiWindupAng: 0,
    // Poise
    poise: 40, maxPoise: 40, poiseRegenDelay: 0, poiseRegenRate: 8,
    // Stagger
    staggered: false, staggerTimer: 0, staggerDuration: 1.0,
    // Knockback
    kbVX: 0, kbVZ: 0,
  };
}

const ENEMY_SPAWN_X = 0, ENEMY_SPAWN_Z = -8;
export const enemy = createEnemy(ENEMY_SPAWN_X, ENEMY_SPAWN_Z);

// ============================================================
//  敵リセット（復活時に呼ばれる）
// ============================================================
export function resetEnemy() {
  enemy.hp = enemy.maxHp;
  enemy.hitTimer = 0;
  enemy.shakeTimer = 0;
  enemy.hitThisSwing = false;
  enemy.aiState = 'idle';
  enemy.aiTimer = 0;
  enemy.aiAttackType = 'none';
  enemy.aiAttackHit1 = false;
  enemy.aiAttackHit2 = false;
  enemy.poise = enemy.maxPoise;
  enemy.poiseRegenDelay = 0;
  enemy.staggered = false;
  enemy.staggerTimer = 0;
  enemy.kbVX = 0;
  enemy.kbVZ = 0;
  // 位置リセット
  enemy.group.position.set(ENEMY_SPAWN_X, 0, ENEMY_SPAWN_Z);
  enemy.group.rotation.y = 0;
  enemy.baseX = ENEMY_SPAWN_X;
  enemy.baseZ = ENEMY_SPAWN_Z;
  enemy.shakeOriginX = ENEMY_SPAWN_X;
  enemy.shakeOriginZ = ENEMY_SPAWN_Z;
  // ビジュアルリセット
  enemy.bodyGroup.rotation.set(0.12, 0, 0); // 猫背の基本姿勢
  enemy.bodyGroup.position.set(0, 0, 0);
  enemy.bodyMat.color.setHex(enemy.originalColor);
  enemy.bodyMat.emissive.setRGB(0, 0, 0);
  enemy.weaponGroup.rotation.set(0, 0, 0);
  enemy.hpGroup.visible = true;
  enemy.group.position.y = 0;
}

// ============================================================
//  ロックオンリング
// ============================================================
export const lockOnRingMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0, side: THREE.DoubleSide });
export const lockOnRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 16), lockOnRingMat);
lockOnRing.rotation.x = -Math.PI / 2; lockOnRing.position.y = 0.05; scene.add(lockOnRing);

// ============================================================
//  敵攻撃エフェクト
// ============================================================
const enemyAtkArcMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0, side: THREE.DoubleSide });
const enemyAtkArcGeo = new THREE.PlaneGeometry(1.8, 1.8);
enemyAtkArcGeo.rotateX(-Math.PI / 2);
const enemyAtkArc = new THREE.Mesh(enemyAtkArcGeo, enemyAtkArcMat);
enemyAtkArc.position.y = 0.3; scene.add(enemyAtkArc);

// 回転攻撃用リングエフェクト
const enemySpinArcMat = new THREE.MeshBasicMaterial({ color: 0xaa22ff, transparent: true, opacity: 0, side: THREE.DoubleSide });
const enemySpinArcGeo = new THREE.RingGeometry(0.5, 2.0, 16);
enemySpinArcGeo.rotateX(-Math.PI / 2);
const enemySpinArc = new THREE.Mesh(enemySpinArcGeo, enemySpinArcMat);
enemySpinArc.position.y = 0.3; scene.add(enemySpinArc);

// ============================================================
//  攻撃選択
// ============================================================
function pickAttack(dist) {
  const r = Math.random();
  if (dist < 1.8) {
    if (r < 0.35) return 'spin';
    if (r < 0.70) return 'combo';
    return 'heavy';
  }
  if (dist < 2.8) {
    if (r < 0.50) return 'combo';
    if (r < 0.80) return 'heavy';
    return 'spin';
  }
  // dist < 3.5
  if (r < 0.20) return 'combo';
  if (r < 0.80) return 'heavy';
  return 'spin';
}

// ダメージ適用ヘルパー
function applyDamageToPlayer(P, ex, ez, damage, kbMul) {
  if (P.isInvincible || enemy.hp <= 0) return;
  P.hp = Math.max(0, P.hp - damage);
  P.hitFlashTimer = 0.2;
  playPlayerHitSound();
  // 回復中断
  if (P.isHealing) { P.isHealing = false; P.healTimer = 0; }
  const ka = Math.atan2(P.x - ex, P.z - ez);
  P.knockbackVX = Math.sin(ka) * 8 * kbMul;
  P.knockbackVZ = Math.cos(ka) * 8 * kbMul;
  if (P.hp <= 0) { P.hp = 0; P.isDead = true; youDiedEl.classList.add('active'); }
}

// 移動ヘルパー
function moveEnemy(ex, ez, ang, speed, dt) {
  const nx = ex + Math.sin(ang) * speed * dt;
  const nz = ez + Math.cos(ang) * speed * dt;
  const c = resolveCollision(nx, nz, 0.45);
  enemy.group.position.x = c.x; enemy.group.position.z = c.z;
  enemy.baseX = c.x; enemy.baseZ = c.z;
  enemy.shakeOriginX = c.x; enemy.shakeOriginZ = c.z;
}

// ============================================================
//  敵AI更新（ステートマシン）
// ============================================================
let aiTime = 0;

export function updateEnemyAI(dt, P) {
  if (enemy.hp <= 0 || P.isDead) {
    enemy.aiState = 'idle';
    enemy.aiAttackHit1 = false;
    enemy.aiAttackHit2 = false;
    // 攻撃エフェクトを即座に消去
    enemyAtkArcMat.opacity = 0;
    enemySpinArcMat.opacity = 0;
    enemy.weaponGroup.rotation.z = 0;
    enemy.weaponGroup.rotation.x = 0;
    return;
  }
  aiTime += dt;

  // --- 慣性ノックバック（常時処理） ---
  if (enemy.kbVX !== 0 || enemy.kbVZ !== 0) {
    const nx = enemy.group.position.x + enemy.kbVX * dt;
    const nz = enemy.group.position.z + enemy.kbVZ * dt;
    const c = resolveCollision(nx, nz, 0.45);
    enemy.group.position.x = c.x; enemy.group.position.z = c.z;
    enemy.baseX = c.x; enemy.baseZ = c.z;
    enemy.shakeOriginX = c.x; enemy.shakeOriginZ = c.z;
    const friction = 1 - 6 * dt;
    enemy.kbVX *= Math.max(0, friction);
    enemy.kbVZ *= Math.max(0, friction);
    if (Math.abs(enemy.kbVX) < 0.05 && Math.abs(enemy.kbVZ) < 0.05) {
      enemy.kbVX = 0; enemy.kbVZ = 0;
    }
  }

  // --- Poise 回復 ---
  if (enemy.poiseRegenDelay > 0) {
    enemy.poiseRegenDelay -= dt;
  } else if (enemy.poise < enemy.maxPoise) {
    enemy.poise = Math.min(enemy.maxPoise, enemy.poise + enemy.poiseRegenRate * dt);
  }

  // --- スタガー中（大怯み） ---
  if (enemy.staggered) {
    enemy.staggerTimer -= dt;
    enemy.weaponGroup.rotation.z = 0.3;
    enemy.weaponGroup.rotation.x = -0.5;
    if (enemy.staggerTimer <= 0) {
      enemy.staggered = false;
      enemy.poise = enemy.maxPoise;
      enemy.weaponGroup.rotation.z = 0;
      enemy.weaponGroup.rotation.x = 0;
      enemy.aiState = 'chase';
    }
  }

  // --- プレイヤーとの重なり防止 ---
  {
    const ox = enemy.group.position.x, oz = enemy.group.position.z;
    const overD = distXZ(ox, oz, P.x, P.z);
    const minD = 0.85; // 敵半径0.45 + プレイヤー半径0.4
    if (overD < minD && overD > 0.01) {
      const px = (ox - P.x) / overD, pz = (oz - P.z) / overD;
      const push = (minD - overD) * 0.6;
      const c = resolveCollision(ox + px * push, oz + pz * push, 0.45);
      enemy.group.position.x = c.x; enemy.group.position.z = c.z;
      enemy.baseX = c.x; enemy.baseZ = c.z;
      enemy.shakeOriginX = c.x; enemy.shakeOriginZ = c.z;
    }
  }

  if (enemy.staggered) return;

  const ex = enemy.group.position.x, ez = enemy.group.position.z;
  const dist = distXZ(ex, ez, P.x, P.z);
  const ang = Math.atan2(P.x - ex, P.z - ez);

  switch (enemy.aiState) {

    // ========== IDLE ==========
    case 'idle':
      enemy.weaponGroup.rotation.z = 0; enemy.weaponGroup.rotation.x = 0;
      enemy.bodyMat.emissive.setRGB(0, 0, 0);
      if (dist < enemy.aiDetectRange) enemy.aiState = 'chase';
      break;

    // ========== CHASE ==========
    case 'chase':
      enemy.group.rotation.y = ang;
      if (dist > 3.5) {
        moveEnemy(ex, ez, ang, enemy.aiSpeed, dt);
      } else {
        // 攻撃範囲内: 40%でstrafe、60%で即攻撃
        if (Math.random() < 0.4) {
          enemy.aiState = 'strafe';
          enemy.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
          enemy.aiStrafeTimer = 1.0 + Math.random();
        } else {
          const atk = pickAttack(dist);
          enemy.aiAttackType = atk;
          enemy.aiAttackHit1 = false; enemy.aiAttackHit2 = false;
          enemy.aiWindupAng = ang;
          if (atk === 'combo') { enemy.aiState = 'windup_combo'; enemy.aiTimer = 0.3; }
          else if (atk === 'heavy') { enemy.aiState = 'windup_heavy'; enemy.aiTimer = 0.7; }
          else { enemy.aiState = 'windup_spin'; enemy.aiTimer = 0.5; }
        }
      }
      if (dist > enemy.aiDetectRange + 5) enemy.aiState = 'idle';
      break;

    // ========== STRAFE（回り込み） ==========
    case 'strafe': {
      enemy.group.rotation.y = ang;
      enemy.aiStrafeTimer -= dt;
      // プレイヤーを中心に弧を描く
      const strafeAng = ang + Math.PI / 2 * enemy.aiStrafeDir;
      moveEnemy(ex, ez, strafeAng, enemy.aiSpeed * 0.8, dt);
      if (enemy.aiStrafeTimer <= 0 || dist > 4) {
        const atk = pickAttack(dist);
        enemy.aiAttackType = atk;
        enemy.aiAttackHit1 = false; enemy.aiAttackHit2 = false;
        enemy.aiWindupAng = ang;
        if (atk === 'combo') { enemy.aiState = 'windup_combo'; enemy.aiTimer = 0.3; }
        else if (atk === 'heavy') { enemy.aiState = 'windup_heavy'; enemy.aiTimer = 0.7; }
        else { enemy.aiState = 'windup_spin'; enemy.aiTimer = 0.5; }
      }
      break;
    }

    // ========== WINDUP: COMBO（速い2連撃の予兆） ==========
    case 'windup_combo': {
      enemy.group.rotation.y = ang; enemy.aiTimer -= dt;
      const wp = 1 - enemy.aiTimer / 0.3;
      enemy.bodyMat.emissive.setRGB(wp * 0.6, wp * 0.4, 0);
      enemy.bodyGroup.rotation.x = -0.15 * wp;
      enemy.weaponGroup.rotation.z = wp * 1.2;
      // にじり寄り（予兆中もプレイヤーに接近）
      if (dist > 1.5) moveEnemy(ex, ez, ang, enemy.aiSpeed * 0.6, dt);
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'attack_combo1'; enemy.aiTimer = 0.25;
        enemy.bodyMat.emissive.setRGB(0, 0, 0);
        enemy.bodyGroup.rotation.x = 0;
        enemy.aiWindupAng = ang;
      }
      break;
    }

    // ========== WINDUP: HEAVY（重い1撃の予兆） ==========
    case 'windup_heavy': {
      enemy.group.rotation.y = ang; enemy.aiTimer -= dt;
      const wp = 1 - enemy.aiTimer / 0.7;
      enemy.bodyMat.emissive.setRGB(wp * 0.8, wp * 0.1, 0);
      enemy.bodyGroup.rotation.x = 0.2 * wp;
      enemy.bodyGroup.position.x = Math.sin(aiTime * 60) * 0.02 * wp;
      enemy.bodyGroup.position.z = Math.sin(aiTime * 47) * 0.02 * wp;
      enemy.weaponGroup.rotation.z = wp * 2.0;
      enemy.weaponGroup.rotation.x = wp * 0.5;
      // にじり寄り（溜め前半のみ接近）
      if (wp < 0.6 && dist > 1.5) moveEnemy(ex, ez, ang, enemy.aiSpeed * 0.4, dt);
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'attack_heavy'; enemy.aiTimer = 0.35;
        enemy.bodyMat.emissive.setRGB(0, 0, 0);
        enemy.bodyGroup.rotation.x = 0;
        enemy.aiWindupAng = ang;
      }
      break;
    }

    // ========== WINDUP: SPIN（回転攻撃の予兆） ==========
    case 'windup_spin': {
      enemy.group.rotation.y = ang; enemy.aiTimer -= dt;
      const wp = 1 - enemy.aiTimer / 0.5;
      enemy.bodyMat.emissive.setRGB(wp * 0.3, 0, wp * 0.5); // 紫
      // 一歩後退
      moveEnemy(ex, ez, ang + Math.PI, 2.0 * (1 - wp), dt);
      // ゆっくり回転開始
      enemy.group.rotation.y += wp * 2;
      enemy.weaponGroup.rotation.z = wp * 1.0;
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'attack_spin'; enemy.aiTimer = 0.4;
        enemy.bodyMat.emissive.setRGB(0, 0, 0);
      }
      break;
    }

    // ========== ATTACK: COMBO 1撃目 ==========
    case 'attack_combo1': {
      enemy.aiTimer -= dt;
      const ap = 1 - enemy.aiTimer / 0.25;
      const atkAng = enemy.aiWindupAng;
      // 踏み込み（序盤にプレイヤー方向へスライド）
      if (ap < 0.4) moveEnemy(ex, ez, atkAng, 8.0 * (1 - ap / 0.4), dt);
      // 横振り
      enemy.weaponGroup.rotation.z = 1.2 - ap * 2.8;
      enemy.weaponGroup.rotation.x = -ap * 0.6;
      // エフェクト
      enemyAtkArc.position.set(ex + Math.sin(atkAng) * 1.3, 0.3, ez + Math.cos(atkAng) * 1.3);
      enemyAtkArcMat.opacity = ap < 0.7 ? 0.5 * (1 - ap / 0.7) : 0;
      // ヒット判定
      if (!enemy.aiAttackHit1 && ap > 0.2 && ap < 0.7) {
        const hx = ex + Math.sin(atkAng) * 1.5, hz = ez + Math.cos(atkAng) * 1.5;
        if (distXZ(hx, hz, P.x, P.z) < 1.3) {
          enemy.aiAttackHit1 = true;
          if (!P.isInvincible) applyDamageToPlayer(P, ex, ez, 12, 0.8);
        }
      }
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'attack_combo2'; enemy.aiTimer = 0.25;
        enemy.aiWindupAng = Math.atan2(P.x - ex, P.z - ez); // 2撃目はリトラック
        enemy.group.rotation.y = enemy.aiWindupAng;
        enemyAtkArcMat.opacity = 0;
      }
      break;
    }

    // ========== ATTACK: COMBO 2撃目 ==========
    case 'attack_combo2': {
      enemy.aiTimer -= dt;
      const ap = 1 - enemy.aiTimer / 0.25;
      const atkAng = enemy.aiWindupAng;
      // 踏み込み（2撃目もリトラック方向へスライド）
      if (ap < 0.35) moveEnemy(ex, ez, atkAng, 6.0 * (1 - ap / 0.35), dt);
      // 逆方向振り
      enemy.weaponGroup.rotation.z = -1.5 + ap * 3.0;
      enemy.weaponGroup.rotation.x = -ap * 0.8;
      // エフェクト
      enemyAtkArc.position.set(ex + Math.sin(atkAng) * 1.3, 0.3, ez + Math.cos(atkAng) * 1.3);
      enemyAtkArcMat.opacity = ap < 0.7 ? 0.6 * (1 - ap / 0.7) : 0;
      // ヒット判定
      if (!enemy.aiAttackHit2 && ap > 0.2 && ap < 0.7) {
        const hx = ex + Math.sin(atkAng) * 1.5, hz = ez + Math.cos(atkAng) * 1.5;
        if (distXZ(hx, hz, P.x, P.z) < 1.3) {
          enemy.aiAttackHit2 = true;
          if (!P.isInvincible) applyDamageToPlayer(P, ex, ez, 15, 1.0);
        }
      }
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'recovery'; enemy.aiTimer = 0.8;
        enemy.weaponGroup.rotation.z = 0; enemy.weaponGroup.rotation.x = 0;
        enemyAtkArcMat.opacity = 0;
      }
      break;
    }

    // ========== ATTACK: HEAVY ==========
    case 'attack_heavy': {
      enemy.aiTimer -= dt;
      const ap = 1 - enemy.aiTimer / 0.35;
      const atkAng = enemy.aiWindupAng;
      // windup時の震え位置をスムーズに戻す
      const posDecay = Math.max(0, 1 - ap * 5);
      enemy.bodyGroup.position.x *= posDecay;
      enemy.bodyGroup.position.z *= posDecay;
      // 大きな踏み込み（重い一撃は深く踏み込む）
      if (ap < 0.5) moveEnemy(ex, ez, atkAng, 10.0 * (1 - ap / 0.5), dt);
      // 叩きつけ
      enemy.weaponGroup.rotation.z = 2.0 - ap * 4.0;
      enemy.weaponGroup.rotation.x = -ap * 1.5;
      // エフェクト
      enemyAtkArc.position.set(ex + Math.sin(atkAng) * 1.3, 0.3, ez + Math.cos(atkAng) * 1.3);
      enemyAtkArcMat.opacity = ap < 0.7 ? 0.7 * (1 - ap / 0.7) : 0;
      // ヒット判定
      if (!enemy.aiAttackHit1 && ap > 0.25 && ap < 0.65) {
        const hx = ex + Math.sin(atkAng) * 1.5, hz = ez + Math.cos(atkAng) * 1.5;
        if (distXZ(hx, hz, P.x, P.z) < 1.5) {
          enemy.aiAttackHit1 = true;
          if (!P.isInvincible) applyDamageToPlayer(P, ex, ez, 30, 1.5);
        }
      }
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'recovery'; enemy.aiTimer = 1.5; // 大きな隙
        enemy.weaponGroup.rotation.z = 0; enemy.weaponGroup.rotation.x = 0;
        enemyAtkArcMat.opacity = 0;
      }
      break;
    }

    // ========== ATTACK: SPIN ==========
    case 'attack_spin': {
      enemy.aiTimer -= dt;
      const ap = 1 - enemy.aiTimer / 0.4;
      // 360°回転
      enemy.group.rotation.y += Math.PI * 2 * dt / 0.4;
      enemy.weaponGroup.rotation.z = -1.5;
      enemy.weaponGroup.rotation.x = -0.3;
      // リングエフェクト
      enemySpinArc.position.set(ex, 0.3, ez);
      enemySpinArcMat.opacity = ap < 0.8 ? 0.5 * (1 - ap / 0.8) : 0;
      // 全方位ヒット判定
      if (!enemy.aiAttackHit1 && ap > 0.15 && ap < 0.85) {
        if (distXZ(ex, ez, P.x, P.z) < 2.0) {
          enemy.aiAttackHit1 = true;
          if (!P.isInvincible) applyDamageToPlayer(P, ex, ez, 18, 1.2);
        }
      }
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'recovery'; enemy.aiTimer = 1.2;
        enemy.weaponGroup.rotation.z = 0; enemy.weaponGroup.rotation.x = 0;
        enemySpinArcMat.opacity = 0;
      }
      break;
    }

    // ========== RECOVERY（隙 = 反撃チャンス） ==========
    case 'recovery':
      enemy.group.rotation.y = ang;
      enemy.aiTimer -= dt;
      // 疲れた姿勢
      enemy.weaponGroup.rotation.z = -0.5;
      enemy.weaponGroup.rotation.x = 0.3;
      enemy.bodyMat.color.setHex(0x993333);
      if (enemy.aiTimer <= 0) {
        enemy.bodyMat.color.setHex(enemy.originalColor);
        enemy.weaponGroup.rotation.z = 0;
        enemy.weaponGroup.rotation.x = 0;
        enemy.aiState = Math.random() < 0.5 ? 'chase' : 'strafe';
        if (enemy.aiState === 'strafe') {
          enemy.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
          enemy.aiStrafeTimer = 1.0 + Math.random();
        }
      }
      break;
  }
}

// ============================================================
//  敵ビジュアル更新
// ============================================================
let enemyVisualFrame = 0;
// 移動系ステート（shake後にpositionをロックしないステート）
const MOVING_STATES = new Set([
  'chase', 'strafe',
  'windup_combo', 'windup_heavy', 'windup_spin',
  'attack_combo1', 'attack_combo2', 'attack_heavy', 'attack_spin',
]);

export function updateEnemyVisuals(dt) {
  enemyVisualFrame++;
  if (enemy.hitTimer > 0) { enemy.hitTimer -= dt; const f = enemy.hitTimer / 0.15; enemy.bodyMat.emissive.setRGB(f, f, f); }

  // スタガー中の大きな仰け反りアニメーション
  if (enemy.staggered) {
    const sp = enemy.staggerTimer / enemy.staggerDuration;
    const lean = sp > 0.5 ? (1 - sp) * 0.6 : sp * 0.6;
    enemy.bodyGroup.rotation.x = lean;
  } else if (enemy.aiState !== 'windup_heavy' && enemy.aiState !== 'windup_combo' && Math.abs(enemy.bodyGroup.rotation.x - 0.12) > 0.01) {
    enemy.bodyGroup.rotation.x = 0.12; // 猫背の基本姿勢に戻す
  }

  if (enemy.shakeTimer > 0) {
    enemy.shakeTimer -= dt; const s = enemy.shakeTimer / 0.2;
    enemy.group.position.x = enemy.shakeOriginX + (Math.random() - 0.5) * 0.15 * s;
    enemy.group.position.z = enemy.shakeOriginZ + (Math.random() - 0.5) * 0.15 * s;
  } else if (!MOVING_STATES.has(enemy.aiState)) {
    if (enemy.shakeOriginX !== enemy.baseX || enemy.shakeOriginZ !== enemy.baseZ) {
      enemy.baseX = enemy.shakeOriginX; enemy.baseZ = enemy.shakeOriginZ;
    }
    enemy.group.position.x = enemy.baseX; enemy.group.position.z = enemy.baseZ;
  }

  const r = enemy.hp / enemy.maxHp;
  enemy.hpBarFill.scale.x = Math.max(r, 0.001);
  enemy.hpBarFill.position.x = -(1.1 * (1 - r)) / 2;
  enemy.hpBarFill.material.color.setHex(r > 0.5 ? 0x44cc44 : r > 0.25 ? 0xcccc22 : 0xff3333);
  if (enemyVisualFrame % 2 === 0) {
    enemy.hpGroup.lookAt(camera.position);
  }
  if (enemy.hp <= 0) {
    enemy.bodyGroup.rotation.z = THREE.MathUtils.lerp(enemy.bodyGroup.rotation.z, Math.PI / 2, 0.05);
    enemy.group.position.y = THREE.MathUtils.lerp(enemy.group.position.y, -0.5, 0.03);
    enemy.hpGroup.visible = false;
  }
}
