import * as THREE from 'three';
import {
  scene, getBoxGeo, getCylGeo,
  resolveCollision, distXZ, camera, youDiedEl,
} from './world.js';

// ============================================================
//  敵メッシュ（共有ジオメトリ）
// ============================================================
const enemyBodyGeo = getCylGeo(0.45, 1.4, 10);
const enemyTopGeo = new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const enemyBotGeo = new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
const enemyEyeGeo = new THREE.SphereGeometry(0.08, 6, 6);

export function createEnemy(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const eMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5, emissive: 0x000000 });
  const eBody = new THREE.Mesh(enemyBodyGeo, eMat); eBody.position.y = 1.0; eBody.castShadow = true; group.add(eBody);
  const topS = new THREE.Mesh(enemyTopGeo, eMat); topS.position.y = 1.7; topS.castShadow = true; group.add(topS);
  const botS = new THREE.Mesh(enemyBotGeo, eMat); botS.position.y = 0.3; group.add(botS);
  const eyMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 });
  const eyL = new THREE.Mesh(enemyEyeGeo, eyMat); eyL.position.set(-0.15, 1.5, -0.4); group.add(eyL);
  const eyR = new THREE.Mesh(enemyEyeGeo, eyMat); eyR.position.set(0.15, 1.5, -0.4); group.add(eyR);
  const wg = new THREE.Group(); wg.position.set(0.5, 1.0, -0.2); group.add(wg);
  const clubMat = new THREE.MeshStandardMaterial({ color: 0x553311, roughness: 0.8 });
  const club = new THREE.Mesh(getBoxGeo(0.15, 1.0, 0.15), clubMat); club.position.y = 0.5; club.castShadow = true; wg.add(club);
  const cHead = new THREE.Mesh(getBoxGeo(0.25, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 })); cHead.position.y = 1.0; wg.add(cHead);
  const hpBgGeo = new THREE.PlaneGeometry(1.2, 0.12);
  const hpFillGeo = new THREE.PlaneGeometry(1.1, 0.08);
  const hpBg = new THREE.Mesh(hpBgGeo, new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide })); hpBg.position.y = 2.5; group.add(hpBg);
  const hpFill = new THREE.Mesh(hpFillGeo, new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide })); hpFill.position.y = 2.5; hpFill.position.z = -0.001; group.add(hpFill);
  scene.add(group);
  return {
    group, bodyMat: eMat, hpBarFill: hpFill, hpBarBg: hpBg, weaponGroup: wg,
    hp: 100, maxHp: 100, hitTimer: 0, shakeTimer: 0,
    shakeOriginX: x, shakeOriginZ: z, baseX: x, baseZ: z, hitThisSwing: false,
    aiState: 'idle', aiTimer: 0, aiSpeed: 2.5, aiDetectRange: 20, aiAttackRange: 3,
    aiWindupDuration: 0.5, aiAttackDuration: 0.3, aiCooldownDuration: 2.0,
    aiDamage: 20, aiAttackHit: false, originalColor: 0xcc2222,
  };
}

export const enemy = createEnemy(0, -8);

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
const enemyAtkArc = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.5, 10, 1, 0, Math.PI * 0.7), enemyAtkArcMat);
enemyAtkArc.rotation.x = -Math.PI / 2; enemyAtkArc.position.y = 0.3; scene.add(enemyAtkArc);

// ============================================================
//  敵AI更新
// ============================================================
export function updateEnemyAI(dt, P) {
  if (enemy.hp <= 0 || P.isDead) { enemy.aiState = 'idle'; return; }
  const ex = enemy.group.position.x, ez = enemy.group.position.z;
  const dist = distXZ(ex, ez, P.x, P.z);
  const ang = Math.atan2(P.x - ex, P.z - ez);

  switch (enemy.aiState) {
    case 'idle':
      enemy.weaponGroup.rotation.z = 0; enemy.weaponGroup.rotation.x = 0;
      if (dist < enemy.aiDetectRange) enemy.aiState = 'chase';
      break;
    case 'chase':
      enemy.group.rotation.y = ang;
      if (dist > enemy.aiAttackRange) {
        const spd = enemy.aiSpeed * dt;
        let nx = ex + Math.sin(ang) * spd, nz = ez + Math.cos(ang) * spd;
        const c = resolveCollision(nx, nz, 0.45);
        enemy.group.position.x = c.x; enemy.group.position.z = c.z;
        enemy.baseX = c.x; enemy.baseZ = c.z; enemy.shakeOriginX = c.x; enemy.shakeOriginZ = c.z;
      } else {
        enemy.aiState = 'windup'; enemy.aiTimer = enemy.aiWindupDuration; enemy.aiAttackHit = false;
      }
      if (dist > enemy.aiDetectRange + 5) enemy.aiState = 'idle';
      break;
    case 'windup':
      enemy.group.rotation.y = ang; enemy.aiTimer -= dt;
      const wp = 1 - enemy.aiTimer / enemy.aiWindupDuration;
      enemy.bodyMat.emissive.setRGB(wp * 0.8, wp * 0.6, 0);
      enemy.weaponGroup.rotation.z = wp * 1.5;
      if (enemy.aiTimer <= 0) { enemy.aiState = 'attack'; enemy.aiTimer = enemy.aiAttackDuration; enemy.bodyMat.emissive.setRGB(0, 0, 0); }
      break;
    case 'attack':
      enemy.aiTimer -= dt;
      const ap = 1 - enemy.aiTimer / enemy.aiAttackDuration;
      enemy.weaponGroup.rotation.z = 1.5 - ap * 3; enemy.weaponGroup.rotation.x = -ap;
      enemyAtkArc.position.set(ex + Math.sin(ang) * 1.2, 0.3, ez + Math.cos(ang) * 1.2);
      enemyAtkArc.rotation.z = -ang; enemyAtkArcMat.opacity = ap < 0.7 ? 0.6 * (1 - ap / 0.7) : 0;
      if (!enemy.aiAttackHit && ap > 0.2 && ap < 0.7) {
        const hx = ex + Math.sin(ang) * 1.5, hz = ez + Math.cos(ang) * 1.5;
        if (distXZ(hx, hz, P.x, P.z) < 1.3) {
          if (P.isInvincible) {
            enemy.aiAttackHit = true;
          } else {
            enemy.aiAttackHit = true;
            P.hp = Math.max(0, P.hp - enemy.aiDamage);
            P.hitFlashTimer = 0.2;
            const ka = Math.atan2(P.x - ex, P.z - ez);
            P.knockbackVX = Math.sin(ka) * 8; P.knockbackVZ = Math.cos(ka) * 8;
            if (P.hp <= 0) { P.hp = 0; P.isDead = true; youDiedEl.classList.add('active'); }
          }
        }
      }
      if (enemy.aiTimer <= 0) {
        enemy.aiState = 'cooldown'; enemy.aiTimer = enemy.aiCooldownDuration;
        enemy.weaponGroup.rotation.z = 0; enemy.weaponGroup.rotation.x = 0; enemyAtkArcMat.opacity = 0;
      }
      break;
    case 'cooldown':
      enemy.group.rotation.y = ang; enemy.aiTimer -= dt; enemy.bodyMat.color.setHex(0x993333);
      if (enemy.aiTimer <= 0) { enemy.bodyMat.color.setHex(enemy.originalColor); enemy.aiState = 'chase'; }
      break;
  }
}

// ============================================================
//  敵ビジュアル更新
// ============================================================
let enemyVisualFrame = 0;
export function updateEnemyVisuals(dt) {
  enemyVisualFrame++;
  if (enemy.hitTimer > 0) { enemy.hitTimer -= dt; const f = enemy.hitTimer / 0.15; enemy.bodyMat.emissive.setRGB(f, f, f); }
  if (enemy.shakeTimer > 0) {
    enemy.shakeTimer -= dt; const s = enemy.shakeTimer / 0.2;
    enemy.group.position.x = enemy.shakeOriginX + (Math.random() - 0.5) * 0.1 * s;
    enemy.group.position.z = enemy.shakeOriginZ + (Math.random() - 0.5) * 0.1 * s;
  } else if (enemy.aiState !== 'chase' && enemy.aiState !== 'windup' && enemy.aiState !== 'attack') {
    if (enemy.shakeOriginX !== enemy.baseX || enemy.shakeOriginZ !== enemy.baseZ) {
      enemy.baseX = enemy.shakeOriginX; enemy.baseZ = enemy.shakeOriginZ;
    }
    enemy.group.position.x = enemy.baseX; enemy.group.position.z = enemy.baseZ;
  }
  const r = enemy.hp / enemy.maxHp;
  enemy.hpBarFill.scale.x = Math.max(r, 0);
  enemy.hpBarFill.position.x = -(1.1 * (1 - r)) / 2;
  enemy.hpBarFill.material.color.setHex(r > 0.5 ? 0x44cc44 : r > 0.25 ? 0xcccc22 : 0xff3333);
  if (enemyVisualFrame % 2 === 0) {
    enemy.hpBarBg.lookAt(camera.position);
    enemy.hpBarFill.lookAt(camera.position);
  }
  if (enemy.hp <= 0) {
    enemy.group.rotation.z = THREE.MathUtils.lerp(enemy.group.rotation.z, Math.PI / 2, 0.05);
    enemy.group.position.y = THREE.MathUtils.lerp(enemy.group.position.y, -0.5, 0.03);
  }
}
