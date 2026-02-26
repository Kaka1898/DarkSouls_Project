import * as THREE from 'three';
import {
  scene, getBoxGeo, getCylGeo,
  resolveCollision, distXZ, camera, youDiedEl,
  envMap, audioListener,
  boneTex, boneNormal, hrBone,
} from './world.js';
import { playPlayerHitSound } from './player.js';

// ============================================================
//  ボスメッシュ — 巨獣の王（プレイヤーの3.5倍サイズ）
// ============================================================
const BOSS_SPAWN_X = 0, BOSS_SPAWN_Z = -70;
const BOSS_RADIUS = 1.4; // 衝突判定半径（旧0.9）

function createBoss(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  // 骨素材
  const boneNormScale = new THREE.Vector2(1.5, 1.5);
  const boneMat = new THREE.MeshStandardMaterial({
    map: hrBone.map, normalMap: hrBone.normalMap, normalScale: boneNormScale,
    roughnessMap: hrBone.roughnessMap, roughness: 0.9,
    aoMap: hrBone.aoMap, aoMapIntensity: 0.7,
    color: 0xc8b890, metalness: 0.02, emissive: 0x000000,
    envMap, envMapIntensity: 0.3,
  });
  const darkBoneMat = new THREE.MeshStandardMaterial({
    map: hrBone.map, normalMap: hrBone.normalMap, normalScale: boneNormScale,
    roughnessMap: hrBone.roughnessMap, roughness: 0.92,
    aoMap: hrBone.aoMap, aoMapIntensity: 0.8,
    color: 0x9a8a70, metalness: 0.02,
    envMap, envMapIntensity: 0.25,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x22cc88, emissive: 0x22cc88, emissiveIntensity: 2.5,
  });
  const heartMat = new THREE.MeshStandardMaterial({
    color: 0x22cc88, emissive: 0x22cc88, emissiveIntensity: 3.0,
    transparent: true, opacity: 0.85,
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: 0x2a3322, roughness: 0.8, envMap, envMapIntensity: 0.2,
  });
  const bladeMat = new THREE.MeshStandardMaterial({
    map: hrBone.map, normalMap: hrBone.normalMap, normalScale: boneNormScale,
    roughnessMap: hrBone.roughnessMap, roughness: 0.88,
    aoMap: hrBone.aoMap, aoMapIntensity: 0.6,
    color: 0xd0c0a0, metalness: 0.05,
    envMap, envMapIntensity: 0.3,
  });

  // === 脚 ===
  const legL = new THREE.Mesh(getCylGeo(0.25, 2.2, 8), darkBoneMat);
  legL.position.set(-0.5, 1.1, 0); legL.castShadow = true; bodyGroup.add(legL);
  const legR = new THREE.Mesh(getCylGeo(0.25, 2.2, 8), darkBoneMat);
  legR.position.set(0.5, 1.1, 0); legR.castShadow = true; bodyGroup.add(legR);

  // === 腰 ===
  const waist = new THREE.Mesh(getBoxGeo(1.6, 0.7, 1.0), darkBoneMat);
  waist.position.y = 2.3; waist.castShadow = true; bodyGroup.add(waist);

  // === 胴体（巨大な樽胸） ===
  const torso = new THREE.Mesh(getCylGeo(1.1, 3.2, 10), boneMat);
  torso.position.y = 4.2; torso.castShadow = true; bodyGroup.add(torso);

  // === 肋骨ケージ（前面） ===
  for (let i = 0; i < 5; i++) {
    const ribY = 3.0 + i * 0.55;
    const ribW = 1.0 - i * 0.06;
    const ribL = new THREE.Mesh(getBoxGeo(ribW, 0.08, 0.2), darkBoneMat);
    ribL.position.set(-0.3, ribY, -0.7); ribL.rotation.z = 0.3 + i * 0.05;
    bodyGroup.add(ribL);
    const ribR = new THREE.Mesh(getBoxGeo(ribW, 0.08, 0.2), darkBoneMat);
    ribR.position.set(0.3, ribY, -0.7); ribR.rotation.z = -(0.3 + i * 0.05);
    bodyGroup.add(ribR);
  }

  // === 苔の心臓（肋骨の奥で発光） ===
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), heartMat);
  heart.position.set(0, 4.0, -0.5); bodyGroup.add(heart);
  const heartLight = new THREE.PointLight(0x22cc88, 2.0, 6);
  heartLight.position.set(0, 4.0, -0.5); heartLight.castShadow = false;
  bodyGroup.add(heartLight);

  // === 背骨 ===
  for (let i = 0; i < 6; i++) {
    const vert = new THREE.Mesh(getBoxGeo(0.25, 0.35, 0.25), darkBoneMat);
    vert.position.set(0, 2.5 + i * 0.6, 0.6);
    bodyGroup.add(vert);
  }

  // === 肩当て ===
  const shoulderL = new THREE.Mesh(getBoxGeo(0.9, 0.5, 0.7), boneMat);
  shoulderL.position.set(-1.5, 5.3, 0); shoulderL.castShadow = true; bodyGroup.add(shoulderL);
  const shoulderR = new THREE.Mesh(getBoxGeo(0.9, 0.5, 0.7), boneMat);
  shoulderR.position.set(1.5, 5.3, 0); shoulderR.castShadow = true; bodyGroup.add(shoulderR);
  // 肩スパイク
  const spikeGeo = new THREE.ConeGeometry(0.12, 0.7, 5);
  const spikeL = new THREE.Mesh(spikeGeo, boneMat);
  spikeL.position.set(-1.7, 5.9, 0); spikeL.rotation.z = 0.4; spikeL.castShadow = true; bodyGroup.add(spikeL);
  const spikeR = new THREE.Mesh(spikeGeo, boneMat);
  spikeR.position.set(1.7, 5.9, 0); spikeR.rotation.z = -0.4; spikeR.castShadow = true; bodyGroup.add(spikeR);

  // === 腕 ===
  const armL = new THREE.Mesh(getCylGeo(0.18, 2.5, 6), darkBoneMat);
  armL.position.set(-1.5, 3.8, 0); armL.castShadow = true; bodyGroup.add(armL);
  const armR = new THREE.Mesh(getCylGeo(0.18, 2.5, 6), darkBoneMat);
  armR.position.set(1.5, 3.8, 0); armR.castShadow = true; bodyGroup.add(armR);

  // === 頭蓋骨 ===
  const skull = new THREE.Mesh(getBoxGeo(0.75, 0.65, 0.65), boneMat);
  skull.position.y = 6.3; skull.castShadow = true; bodyGroup.add(skull);
  const jaw = new THREE.Mesh(getBoxGeo(0.55, 0.2, 0.3), darkBoneMat);
  jaw.position.set(0, 5.85, -0.2); bodyGroup.add(jaw);
  // 目（緑の発光）
  const eyeL = new THREE.Mesh(getBoxGeo(0.12, 0.08, 0.05), eyeMat);
  eyeL.position.set(-0.18, 6.35, -0.35); bodyGroup.add(eyeL);
  const eyeR = new THREE.Mesh(getBoxGeo(0.12, 0.08, 0.05), eyeMat);
  eyeR.position.set(0.18, 6.35, -0.35); bodyGroup.add(eyeR);

  // === 角（巨獣の王の証） ===
  const hornGeo = new THREE.ConeGeometry(0.1, 1.2, 6);
  const hornL = new THREE.Mesh(hornGeo, boneMat);
  hornL.position.set(-0.35, 7.1, -0.1); hornL.rotation.z = 0.35; hornL.rotation.x = -0.15;
  hornL.castShadow = true; bodyGroup.add(hornL);
  const hornR = new THREE.Mesh(hornGeo, boneMat);
  hornR.position.set(0.35, 7.1, -0.1); hornR.rotation.z = -0.35; hornR.rotation.x = -0.15;
  hornR.castShadow = true; bodyGroup.add(hornR);

  // === マント（背面） ===
  const cape = new THREE.Mesh(getBoxGeo(2.2, 3.5, 0.12), capeMat);
  cape.position.set(0, 3.5, 0.8); bodyGroup.add(cape);

  // === 武器: 骨の大剣 ===
  const wg = new THREE.Group();
  wg.position.set(1.8, 3.5, -0.5); bodyGroup.add(wg);
  const handle = new THREE.Mesh(getBoxGeo(0.15, 2.8, 0.15), darkBoneMat);
  handle.position.y = 0.5; handle.castShadow = true; wg.add(handle);
  const bossBlade = new THREE.Mesh(getBoxGeo(0.5, 2.2, 0.1), bladeMat);
  bossBlade.position.y = 2.5; bossBlade.castShadow = true; wg.add(bossBlade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 4), bladeMat);
  tip.position.y = 3.8; tip.castShadow = true; wg.add(tip);

  // === HPバー（頭上） ===
  const hpGroup = new THREE.Group();
  hpGroup.position.y = 8.5;
  group.add(hpGroup);
  const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18), new THREE.MeshBasicMaterial({ color: 0x333333 }));
  hpGroup.add(hpBg);
  const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.13), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
  hpFill.position.z = 0.001; hpGroup.add(hpFill);

  scene.add(group);

  return {
    group, bodyGroup, bodyMat: boneMat, eyeMat, heartMat, heartLight,
    hpGroup, hpBarFill: hpFill, weaponGroup: wg,
    hp: 350, maxHp: 350, hitTimer: 0, shakeTimer: 0,
    shakeOriginX: x, shakeOriginZ: z, baseX: x, baseZ: z, hitThisSwing: false,
    // AI
    aiState: 'idle', aiTimer: 0, aiSpeed: 2.0, aiDetectRange: 25,
    aiAttackType: 'none',
    aiAttackHit1: false, aiAttackHit2: false, aiAttackHit3: false,
    aiStrafeDir: 1, aiStrafeTimer: 0,
    aiWindupAng: 0,
    // Phase
    phase: 1, phaseTransitioned: false,
    // Poise（巨獣は頑強）
    poise: 100, maxPoise: 100, poiseRegenDelay: 0, poiseRegenRate: 12,
    // Stagger
    staggered: false, staggerTimer: 0, staggerDuration: 1.5,
    // Knockback
    kbVX: 0, kbVZ: 0,
    // Feint
    feintScheduled: false,
  };
}

export const boss = createBoss(BOSS_SPAWN_X, BOSS_SPAWN_Z);

// ============================================================
//  デバッグ: ボス攻撃判定の可視化
// ============================================================
const DEBUG_HITBOX = true; // false にすると非表示
const debugHitboxMat = new THREE.MeshBasicMaterial({
  color: 0xff0000, transparent: true, opacity: 0.25,
  side: THREE.DoubleSide, depthWrite: false,
});
const debugHitboxGeo = new THREE.SphereGeometry(1, 12, 8);
const debugHitboxMesh = new THREE.Mesh(debugHitboxGeo, debugHitboxMat);
debugHitboxMesh.visible = false;
debugHitboxMesh.renderOrder = 999;
scene.add(debugHitboxMesh);

// 攻撃ステートごとの判定パラメータ {offset: 武器先端距離, radius: 判定半径}
const BOSS_ATTACK_HITBOX = {
  'attack_sweep':     { offset: 3.5, radius: 2.5 },
  'attack_slam':      { offset: 3.5, radius: 2.8 },
  'attack_fire_slam': { offset: 3.5, radius: 2.8 },
  'attack_combo1':    { offset: 3.0, radius: 2.2 },
  'attack_combo2':    { offset: 3.0, radius: 2.2 },
  'attack_combo3':    { offset: 3.5, radius: 2.5 },
};

function updateDebugHitbox() {
  if (!DEBUG_HITBOX) { debugHitboxMesh.visible = false; return; }
  const params = BOSS_ATTACK_HITBOX[boss.aiState];
  if (!params) { debugHitboxMesh.visible = false; return; }
  // 攻撃進行度を取得して判定ウィンドウ内のみ表示
  const timerMax = { 'attack_sweep': 0.3, 'attack_slam': 0.4, 'attack_fire_slam': 0.4,
    'attack_combo1': 0.2, 'attack_combo2': 0.2, 'attack_combo3': 0.25 };
  const ap = 1 - boss.aiTimer / (timerMax[boss.aiState] || 0.3);
  if (ap < 0.2 || ap > 0.7) { debugHitboxMesh.visible = false; return; }
  // 判定位置を計算
  const ex = boss.group.position.x, ez = boss.group.position.z;
  const atkAng = boss.aiWindupAng;
  const hx = ex + Math.sin(atkAng) * params.offset;
  const hz = ez + Math.cos(atkAng) * params.offset;
  debugHitboxMesh.position.set(hx, 2.5, hz);
  debugHitboxMesh.scale.setScalar(params.radius);
  debugHitboxMesh.visible = true;
  // 判定ウィンドウの終わりに近づくとフェードアウト
  const fade = ap > 0.55 ? (0.7 - ap) / 0.15 : 1.0;
  debugHitboxMat.opacity = 0.25 * fade;
}

// ============================================================
//  3Dポジショナルオーディオ
// ============================================================
function playPositionalSound(group, renderFn, duration, volume = 1.0) {
  const ctx = audioListener.context;
  const sr = ctx.sampleRate;
  const offCtx = new OfflineAudioContext(1, Math.floor(sr * duration), sr);
  renderFn(offCtx, duration);
  offCtx.startRendering().then(buf => {
    const sound = new THREE.PositionalAudio(audioListener);
    sound.setRefDistance(5);
    sound.setRolloffFactor(1);
    sound.setMaxDistance(30);
    group.add(sound);
    sound.setBuffer(buf);
    sound.setVolume(volume);
    sound.play();
    setTimeout(() => { group.remove(sound); }, duration * 1000 + 500);
  });
}

function playPhaseRoar() {
  playPositionalSound(boss.group, (ctx, dur) => {
    // 低音グロウル: 60→40Hz
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, 0);
    osc.frequency.exponentialRampToValueAtTime(40, dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.001, 0);
    og.gain.linearRampToValueAtTime(0.5, 0.2);
    og.gain.exponentialRampToValueAtTime(0.001, dur);
    osc.connect(og).connect(ctx.destination);
    osc.start(0); osc.stop(dur);
    // ノイズバースト
    const bufSize = Math.floor(ctx.sampleRate * 0.8);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3, 0);
    ng.gain.exponentialRampToValueAtTime(0.001, 0.8);
    ns.connect(lp).connect(ng).connect(ctx.destination);
    ns.start(0); ns.stop(0.8);
  }, 1.5, 1.0);
}

function playBossAttackWhoosh() {
  playPositionalSound(boss.group, (ctx, dur) => {
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource(); ns.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, 0);
    g.gain.linearRampToValueAtTime(0.3, 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, dur);
    ns.connect(bp).connect(g).connect(ctx.destination);
    ns.start(0); ns.stop(dur);
  }, 0.15, 0.6);
}

function playFireCrackle(x, z) {
  const anchor = new THREE.Object3D();
  anchor.position.set(x, 0.5, z);
  scene.add(anchor);
  playPositionalSound(anchor, (ctx, dur) => {
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource(); ns.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, 0);
    g.gain.linearRampToValueAtTime(0.25, 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, dur);
    ns.connect(bp).connect(g).connect(ctx.destination);
    ns.start(0); ns.stop(dur);
  }, 1.0, 0.8);
  setTimeout(() => { scene.remove(anchor); }, 1500);
}

// ============================================================
//  AI予測システム
// ============================================================
const prediction = { playerVelX: 0, playerVelZ: 0, factor: 0.3 };

export function setBossPlayerVelocity(velX, velZ) {
  prediction.playerVelX = velX;
  prediction.playerVelZ = velZ;
}

function getPredictedPlayerPos(P, ex, ez, speed) {
  const dist = distXZ(ex, ez, P.x, P.z);
  const t = dist / Math.max(speed, 0.1);
  const predX = P.x + prediction.playerVelX * t;
  const predZ = P.z + prediction.playerVelZ * t;
  return {
    x: P.x + (predX - P.x) * prediction.factor,
    z: P.z + (predZ - P.z) * prediction.factor,
  };
}

function isPlayerFleeing(P, ex, ez) {
  const vSq = prediction.playerVelX ** 2 + prediction.playerVelZ ** 2;
  if (vSq < 4) return false;
  const toBossX = ex - P.x, toBossZ = ez - P.z;
  return (prediction.playerVelX * (-toBossX) + prediction.playerVelZ * (-toBossZ)) > 0;
}

// ============================================================
//  火柱パーティクルシステム
// ============================================================
const FIRE_POOL_SIZE = 60;
const fireConeGeo = new THREE.ConeGeometry(0.08, 0.2, 5);
const fireParticles = [];
for (let i = 0; i < FIRE_POOL_SIZE; i++) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff6622, transparent: true, opacity: 1,
  });
  const mesh = new THREE.Mesh(fireConeGeo, mat);
  mesh.visible = false;
  scene.add(mesh);
  fireParticles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0 });
}

// 残留ダメージゾーン
const MAX_FIRE_PILLARS = 4;
const activeFirePillars = [];

// 火柱PointLightプール（shadow無しで軽量）
const firePillarLights = [];
for (let i = 0; i < MAX_FIRE_PILLARS; i++) {
  const light = new THREE.PointLight(0xff6622, 0, 5);
  light.castShadow = false;
  scene.add(light);
  firePillarLights.push(light);
}

export function spawnFirePillar(x, z) {
  // パーティクルを噴出
  let spawned = 0;
  for (let i = 0; i < FIRE_POOL_SIZE && spawned < 20; i++) {
    const p = fireParticles[i];
    if (p.life > 0) continue;
    spawned++;
    p.mesh.position.set(x, 0.1, z);
    p.mesh.visible = true;
    const theta = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    p.vx = Math.sin(theta) * speed * 0.3;
    p.vy = 3 + Math.random() * 5;
    p.vz = Math.cos(theta) * speed * 0.3;
    p.maxLife = 0.5 + Math.random() * 0.8;
    p.life = p.maxLife;
    const colors = [0xff4400, 0xff6622, 0xff8811, 0xffaa33, 0xffcc44];
    p.mat.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    p.mat.opacity = 1;
  }
  // 残留ゾーン追加
  if (activeFirePillars.length >= MAX_FIRE_PILLARS) activeFirePillars.shift();
  activeFirePillars.push({ x, z, timer: 2.0, radius: 1.2, dmgCooldown: 0 });
  playFireCrackle(x, z);
}

function updateFireParticles(dt) {
  for (let i = 0; i < FIRE_POOL_SIZE; i++) {
    const p = fireParticles[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; p.life = 0; continue; }
    p.vy -= 5 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0) p.mesh.position.y = 0;
    p.mat.opacity = Math.max(0, p.life / p.maxLife);
  }
}

export function updateFirePillars(dt, P) {
  for (let i = activeFirePillars.length - 1; i >= 0; i--) {
    const fp = activeFirePillars[i];
    fp.timer -= dt;
    if (fp.timer <= 0) { activeFirePillars.splice(i, 1); continue; }
    // 残留パーティクル（散発的に追加）
    if (Math.random() < dt * 8) {
      for (let j = 0; j < FIRE_POOL_SIZE; j++) {
        const p = fireParticles[j];
        if (p.life > 0) continue;
        p.mesh.position.set(fp.x + (Math.random() - 0.5) * 0.6, 0.1, fp.z + (Math.random() - 0.5) * 0.6);
        p.mesh.visible = true;
        p.vx = (Math.random() - 0.5) * 0.5;
        p.vy = 2 + Math.random() * 3;
        p.vz = (Math.random() - 0.5) * 0.5;
        p.maxLife = 0.3 + Math.random() * 0.4;
        p.life = p.maxLife;
        p.mat.color.setHex(0xff4400 + Math.floor(Math.random() * 0x004400));
        p.mat.opacity = 1;
        break;
      }
    }
    // ダメージ判定
    fp.dmgCooldown -= dt;
    if (fp.dmgCooldown <= 0 && !P.isInvincible && !P.isDead) {
      if (distXZ(fp.x, fp.z, P.x, P.z) < fp.radius) {
        P.hp = Math.max(0, P.hp - 8 * dt * 3); // 約8 dmg/s (3fpsごとに判定)
        P.hitFlashTimer = 0.1;
        fp.dmgCooldown = 0.33;
        if (P.hp <= 0) { P.hp = 0; P.isDead = true; youDiedEl.classList.add('active'); }
      }
    }
  }
  // 火柱PointLightを同期
  for (let i = 0; i < MAX_FIRE_PILLARS; i++) {
    if (i < activeFirePillars.length) {
      const fp = activeFirePillars[i];
      firePillarLights[i].position.set(fp.x, 1.0, fp.z);
      firePillarLights[i].intensity = 3.0 * Math.min(fp.timer / 0.5, 1.0);
    } else {
      firePillarLights[i].intensity = 0;
    }
  }
}

// ============================================================
//  攻撃選択
// ============================================================
function pickBossAttack(dist, phase, fleeing) {
  const r = Math.random();
  if (phase === 2) {
    if (fleeing) {
      // 逃走中はgap-closerを優先
      if (r < 0.35) return 'fire_slam';
      if (r < 0.65) return 'combo';
      if (r < 0.85) return 'slam';
      return 'sweep';
    }
    if (dist < 2.5) {
      if (r < 0.25) return 'fire_slam';
      if (r < 0.55) return 'sweep';
      if (r < 0.80) return 'combo';
      return 'slam';
    }
    if (r < 0.30) return 'fire_slam';
    if (r < 0.55) return 'combo';
    if (r < 0.80) return 'slam';
    return 'sweep';
  }
  // Phase 1
  if (fleeing) {
    if (r < 0.45) return 'combo';
    if (r < 0.80) return 'slam';
    return 'sweep';
  }
  if (dist < 2.5) {
    if (r < 0.40) return 'sweep';
    if (r < 0.75) return 'combo';
    return 'slam';
  }
  if (r < 0.30) return 'combo';
  if (r < 0.70) return 'slam';
  return 'sweep';
}

// ダメージ適用
function applyDamageToPlayer(P, ex, ez, damage, kbMul) {
  if (P.isInvincible) return;
  P.hp = Math.max(0, P.hp - damage);
  P.hitFlashTimer = 0.2;
  playPlayerHitSound();
  // 回復中断
  if (P.isHealing) { P.isHealing = false; P.healTimer = 0; }
  const ka = Math.atan2(P.x - ex, P.z - ez);
  P.knockbackVX = Math.sin(ka) * 10 * kbMul;
  P.knockbackVZ = Math.cos(ka) * 10 * kbMul;
  if (P.hp <= 0) { P.hp = 0; P.isDead = true; youDiedEl.classList.add('active'); }
}

// 移動ヘルパー
function moveBoss(ex, ez, ang, speed, dt) {
  const nx = ex + Math.sin(ang) * speed * dt;
  const nz = ez + Math.cos(ang) * speed * dt;
  const c = resolveCollision(nx, nz, BOSS_RADIUS);
  boss.group.position.x = c.x; boss.group.position.z = c.z;
  boss.baseX = c.x; boss.baseZ = c.z;
  boss.shakeOriginX = c.x; boss.shakeOriginZ = c.z;
}

// ============================================================
//  ボスAI更新（ステートマシン）
// ============================================================
let bossAiTime = 0;

export function updateBossAI(dt, P) {
  if (boss.hp <= 0 || P.isDead) { boss.aiState = 'idle'; return; }
  bossAiTime += dt;

  // Phase判定
  const phaseMul = boss.phase === 2 ? 0.7 : 1.0;       // windup短縮
  const recoveryMul = boss.phase === 2 ? 0.6 : 1.0;     // recovery短縮
  const currentSpeed = boss.phase === 2 ? 2.8 : boss.aiSpeed;

  // Phase遷移チェック
  if (!boss.phaseTransitioned && boss.hp <= boss.maxHp * 0.5) {
    boss.phaseTransitioned = true;
    boss.phase = 2;
    boss.bodyMat.emissive.setRGB(0.05, 0.3, 0.15);
    boss.eyeMat.emissiveIntensity = 4.0;
    playPhaseRoar();
    // 遷移演出はmain.jsで hitStop を設定
  }

  // 予測ファクターをphaseに応じて設定
  prediction.factor = boss.phase === 2 ? 0.6 : 0.3;

  // Phase2 常時emissive（緑の苔発光）
  if (boss.phase === 2 && boss.aiState !== 'idle') {
    const pulse = 0.15 + Math.sin(bossAiTime * 4) * 0.05;
    boss.bodyMat.emissive.setRGB(0.03, pulse, pulse * 0.5);
  }

  // --- 慣性ノックバック ---
  if (boss.kbVX !== 0 || boss.kbVZ !== 0) {
    const nx = boss.group.position.x + boss.kbVX * dt;
    const nz = boss.group.position.z + boss.kbVZ * dt;
    const c = resolveCollision(nx, nz, BOSS_RADIUS);
    boss.group.position.x = c.x; boss.group.position.z = c.z;
    boss.baseX = c.x; boss.baseZ = c.z;
    boss.shakeOriginX = c.x; boss.shakeOriginZ = c.z;
    const friction = 1 - 6 * dt;
    boss.kbVX *= Math.max(0, friction);
    boss.kbVZ *= Math.max(0, friction);
    if (Math.abs(boss.kbVX) < 0.05 && Math.abs(boss.kbVZ) < 0.05) { boss.kbVX = 0; boss.kbVZ = 0; }
  }

  // --- Poise 回復 ---
  if (boss.poiseRegenDelay > 0) {
    boss.poiseRegenDelay -= dt;
  } else if (boss.poise < boss.maxPoise) {
    boss.poise = Math.min(boss.maxPoise, boss.poise + boss.poiseRegenRate * dt);
  }

  // --- スタガー中 ---
  if (boss.staggered) {
    boss.staggerTimer -= dt;
    boss.weaponGroup.rotation.z = 0.3;
    boss.weaponGroup.rotation.x = -0.5;
    if (boss.staggerTimer <= 0) {
      boss.staggered = false;
      boss.poise = boss.maxPoise;
      boss.weaponGroup.rotation.z = 0;
      boss.weaponGroup.rotation.x = 0;
      boss.aiState = 'chase';
    }
    return;
  }

  const ex = boss.group.position.x, ez = boss.group.position.z;
  const dist = distXZ(ex, ez, P.x, P.z);
  const ang = Math.atan2(P.x - ex, P.z - ez);
  const faceAng = ang + Math.PI; // モデル前面(-Z)をプレイヤーに向けるオフセット

  switch (boss.aiState) {

    // ========== IDLE ==========
    case 'idle':
      boss.weaponGroup.rotation.z = 0; boss.weaponGroup.rotation.x = 0;
      if (boss.phase !== 2) boss.bodyMat.emissive.setRGB(0, 0, 0);
      if (dist < boss.aiDetectRange) boss.aiState = 'chase';
      break;

    // ========== CHASE ==========
    case 'chase': {
      const pred = getPredictedPlayerPos(P, ex, ez, currentSpeed);
      const predAng = Math.atan2(pred.x - ex, pred.z - ez);
      boss.group.rotation.y = predAng + Math.PI;
      if (dist > 4.0) {
        moveBoss(ex, ez, predAng, currentSpeed, dt);
      } else {
        if (Math.random() < 0.35) {
          boss.aiState = 'strafe';
          boss.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
          boss.aiStrafeTimer = 0.8 + Math.random() * 0.8;
        } else {
          const fleeing = isPlayerFleeing(P, ex, ez);
          initiateAttack(dist, ang, fleeing);
        }
      }
      if (dist > boss.aiDetectRange + 5) boss.aiState = 'idle';
      break;
    }

    // ========== STRAFE ==========
    case 'strafe': {
      boss.group.rotation.y = faceAng;
      boss.aiStrafeTimer -= dt;
      const strafeAng = ang + Math.PI / 2 * boss.aiStrafeDir;
      moveBoss(ex, ez, strafeAng, currentSpeed * 0.7, dt);
      if (boss.aiStrafeTimer <= 0 || dist > 5) {
        const fleeing = isPlayerFleeing(P, ex, ez);
        initiateAttack(dist, ang, fleeing);
      }
      break;
    }

    // ========== WINDUP: SWEEP ==========
    case 'windup_sweep': {
      const windupTime = 0.4 * phaseMul;
      const pred = getPredictedPlayerPos(P, ex, ez, currentSpeed);
      const predAng = Math.atan2(pred.x - ex, pred.z - ez);
      boss.group.rotation.y = predAng + Math.PI; boss.aiTimer -= dt;
      const wp = 1 - boss.aiTimer / windupTime;
      // フェイント: 50%経過時にattack切り替え
      if (boss.feintScheduled && wp > 0.5) {
        boss.feintScheduled = false;
        const alt = ['slam', 'combo'].filter(a => a !== 'sweep');
        boss.aiAttackType = alt[Math.floor(Math.random() * alt.length)];
        if (boss.aiAttackType === 'combo') { boss.aiState = 'windup_combo'; boss.aiTimer = 0.25 * phaseMul; }
        else { boss.aiState = 'windup_slam'; boss.aiTimer = 0.5 * phaseMul; }
        break;
      }
      boss.bodyMat.emissive.setRGB(wp * 0.5 + (boss.phase === 2 ? 0.3 : 0), wp * 0.3, 0);
      boss.weaponGroup.rotation.z = wp * 1.5;
      boss.bodyGroup.rotation.x = -0.1 * wp;
      if (dist > 2.0) moveBoss(ex, ez, predAng, currentSpeed * 0.5, dt);
      if (boss.aiTimer <= 0) {
        boss.aiState = 'attack_sweep'; boss.aiTimer = 0.3;
        boss.bodyMat.emissive.setRGB(boss.phase === 2 ? 0.4 : 0, boss.phase === 2 ? 0.05 : 0, 0);
        boss.bodyGroup.rotation.x = 0;
        boss.aiWindupAng = ang;
      }
      break;
    }

    // ========== WINDUP: SLAM ==========
    case 'windup_slam': {
      const windupTime = 0.8 * phaseMul;
      const pred = getPredictedPlayerPos(P, ex, ez, currentSpeed);
      const predAng = Math.atan2(pred.x - ex, pred.z - ez);
      boss.group.rotation.y = predAng + Math.PI; boss.aiTimer -= dt;
      const wp = 1 - boss.aiTimer / windupTime;
      // フェイント
      if (boss.feintScheduled && wp > 0.5) {
        boss.feintScheduled = false;
        boss.aiAttackType = 'combo';
        boss.aiState = 'windup_combo'; boss.aiTimer = 0.25 * phaseMul;
        boss.bodyGroup.position.x = 0; boss.bodyGroup.position.z = 0;
        break;
      }
      boss.bodyMat.emissive.setRGB(wp * 0.8 + (boss.phase === 2 ? 0.2 : 0), wp * 0.1, 0);
      boss.bodyGroup.rotation.x = 0.25 * wp;
      boss.bodyGroup.position.x = Math.sin(bossAiTime * 50) * 0.03 * wp;
      boss.bodyGroup.position.z = Math.sin(bossAiTime * 37) * 0.03 * wp;
      boss.weaponGroup.rotation.z = wp * 2.5;
      boss.weaponGroup.rotation.x = wp * 0.6;
      if (wp < 0.5 && dist > 2.0) moveBoss(ex, ez, predAng, currentSpeed * 0.4, dt);
      if (boss.aiTimer <= 0) {
        const atkType = boss.aiAttackType === 'fire_slam' ? 'attack_fire_slam' : 'attack_slam';
        boss.aiState = atkType; boss.aiTimer = 0.4;
        boss.bodyMat.emissive.setRGB(boss.phase === 2 ? 0.4 : 0, boss.phase === 2 ? 0.05 : 0, 0);
        boss.bodyGroup.rotation.x = 0;
        boss.bodyGroup.position.x = 0; boss.bodyGroup.position.z = 0;
        boss.aiWindupAng = ang;
      }
      break;
    }

    // ========== WINDUP: COMBO ==========
    case 'windup_combo': {
      const windupTime = 0.35 * phaseMul;
      const pred = getPredictedPlayerPos(P, ex, ez, currentSpeed);
      const predAng = Math.atan2(pred.x - ex, pred.z - ez);
      boss.group.rotation.y = predAng + Math.PI; boss.aiTimer -= dt;
      const wp = 1 - boss.aiTimer / windupTime;
      // フェイント
      if (boss.feintScheduled && wp > 0.5) {
        boss.feintScheduled = false;
        boss.aiAttackType = 'slam';
        boss.aiState = 'windup_slam'; boss.aiTimer = 0.5 * phaseMul;
        break;
      }
      boss.bodyMat.emissive.setRGB(wp * 0.6 + (boss.phase === 2 ? 0.2 : 0), wp * 0.4, 0);
      boss.bodyGroup.rotation.x = -0.15 * wp;
      boss.weaponGroup.rotation.z = wp * 1.2;
      if (dist > 2.0) moveBoss(ex, ez, predAng, currentSpeed * 0.6, dt);
      if (boss.aiTimer <= 0) {
        boss.aiState = 'attack_combo1'; boss.aiTimer = 0.2;
        boss.bodyMat.emissive.setRGB(boss.phase === 2 ? 0.4 : 0, boss.phase === 2 ? 0.05 : 0, 0);
        boss.bodyGroup.rotation.x = 0;
        boss.aiWindupAng = ang;
      }
      break;
    }

    // ========== ATTACK: SWEEP ==========
    case 'attack_sweep': {
      boss.aiTimer -= dt;
      const ap = 1 - boss.aiTimer / 0.3;
      const atkAng = boss.aiWindupAng;
      if (ap < 0.4) moveBoss(ex, ez, atkAng, 10.0 * (1 - ap / 0.4), dt);
      boss.weaponGroup.rotation.z = 1.5 - ap * 3.5;
      boss.weaponGroup.rotation.x = -ap * 0.8;
      if (!boss.aiAttackHit1 && ap > 0.2 && ap < 0.7) {
        const hx = ex + Math.sin(atkAng) * 2.0, hz = ez + Math.cos(atkAng) * 2.0;
        if (distXZ(hx, hz, P.x, P.z) < 1.8) {
          boss.aiAttackHit1 = true;
          applyDamageToPlayer(P, ex, ez, 25, 1.0);
        }
      }
      if (boss.aiTimer <= 0) {
        boss.aiState = 'recovery'; boss.aiTimer = 0.8 * recoveryMul;
        boss.weaponGroup.rotation.z = 0; boss.weaponGroup.rotation.x = 0;
      }
      break;
    }

    // ========== ATTACK: SLAM ==========
    case 'attack_slam': {
      boss.aiTimer -= dt;
      const ap = 1 - boss.aiTimer / 0.4;
      const atkAng = boss.aiWindupAng;
      if (ap < 0.5) moveBoss(ex, ez, atkAng, 12.0 * (1 - ap / 0.5), dt);
      boss.weaponGroup.rotation.z = 2.5 - ap * 5.0;
      boss.weaponGroup.rotation.x = -ap * 2.0;
      if (!boss.aiAttackHit1 && ap > 0.3 && ap < 0.65) {
        const hx = ex + Math.sin(atkAng) * 2.0, hz = ez + Math.cos(atkAng) * 2.0;
        if (distXZ(hx, hz, P.x, P.z) < 2.0) {
          boss.aiAttackHit1 = true;
          applyDamageToPlayer(P, ex, ez, 40, 2.0);
        }
      }
      if (boss.aiTimer <= 0) {
        boss.aiState = 'recovery'; boss.aiTimer = 1.5 * recoveryMul;
        boss.weaponGroup.rotation.z = 0; boss.weaponGroup.rotation.x = 0;
      }
      break;
    }

    // ========== ATTACK: FIRE SLAM (Phase 2) ==========
    case 'attack_fire_slam': {
      boss.aiTimer -= dt;
      const ap = 1 - boss.aiTimer / 0.4;
      const atkAng = boss.aiWindupAng;
      if (ap < 0.5) moveBoss(ex, ez, atkAng, 12.0 * (1 - ap / 0.5), dt);
      boss.weaponGroup.rotation.z = 2.5 - ap * 5.0;
      boss.weaponGroup.rotation.x = -ap * 2.0;
      if (!boss.aiAttackHit1 && ap > 0.3 && ap < 0.65) {
        const hx = ex + Math.sin(atkAng) * 2.0, hz = ez + Math.cos(atkAng) * 2.0;
        boss.aiAttackHit1 = true;
        // 火柱を着弾地点に発生
        spawnFirePillar(hx, hz);
        if (distXZ(hx, hz, P.x, P.z) < 2.0) {
          applyDamageToPlayer(P, ex, ez, 40, 2.0);
        }
      }
      if (boss.aiTimer <= 0) {
        boss.aiState = 'recovery'; boss.aiTimer = 1.5 * recoveryMul;
        boss.weaponGroup.rotation.z = 0; boss.weaponGroup.rotation.x = 0;
      }
      break;
    }

    // ========== ATTACK: COMBO 1 ==========
    case 'attack_combo1': {
      boss.aiTimer -= dt;
      const ap = 1 - boss.aiTimer / 0.2;
      const atkAng = boss.aiWindupAng;
      if (ap < 0.35) moveBoss(ex, ez, atkAng, 9.0 * (1 - ap / 0.35), dt);
      boss.weaponGroup.rotation.z = 1.2 - ap * 3.0;
      boss.weaponGroup.rotation.x = -ap * 0.6;
      if (!boss.aiAttackHit1 && ap > 0.2 && ap < 0.7) {
        const hx = ex + Math.sin(atkAng) * 1.8, hz = ez + Math.cos(atkAng) * 1.8;
        if (distXZ(hx, hz, P.x, P.z) < 1.5) {
          boss.aiAttackHit1 = true;
          applyDamageToPlayer(P, ex, ez, 18, 0.8);
        }
      }
      if (boss.aiTimer <= 0) {
        boss.aiState = 'attack_combo2'; boss.aiTimer = 0.2;
        boss.aiWindupAng = Math.atan2(P.x - ex, P.z - ez);
        boss.group.rotation.y = boss.aiWindupAng + Math.PI;
      }
      break;
    }

    // ========== ATTACK: COMBO 2 ==========
    case 'attack_combo2': {
      boss.aiTimer -= dt;
      const ap = 1 - boss.aiTimer / 0.2;
      const atkAng = boss.aiWindupAng;
      if (ap < 0.35) moveBoss(ex, ez, atkAng, 7.0 * (1 - ap / 0.35), dt);
      boss.weaponGroup.rotation.z = -1.5 + ap * 3.5;
      boss.weaponGroup.rotation.x = -ap * 0.8;
      if (!boss.aiAttackHit2 && ap > 0.2 && ap < 0.7) {
        const hx = ex + Math.sin(atkAng) * 1.8, hz = ez + Math.cos(atkAng) * 1.8;
        if (distXZ(hx, hz, P.x, P.z) < 1.5) {
          boss.aiAttackHit2 = true;
          applyDamageToPlayer(P, ex, ez, 18, 0.8);
        }
      }
      if (boss.aiTimer <= 0) {
        boss.aiState = 'attack_combo3'; boss.aiTimer = 0.25;
        boss.aiWindupAng = Math.atan2(P.x - ex, P.z - ez);
        boss.group.rotation.y = boss.aiWindupAng + Math.PI;
      }
      break;
    }

    // ========== ATTACK: COMBO 3 ==========
    case 'attack_combo3': {
      boss.aiTimer -= dt;
      const ap = 1 - boss.aiTimer / 0.25;
      const atkAng = boss.aiWindupAng;
      if (ap < 0.4) moveBoss(ex, ez, atkAng, 10.0 * (1 - ap / 0.4), dt);
      boss.weaponGroup.rotation.z = 2.0 - ap * 4.5;
      boss.weaponGroup.rotation.x = -ap * 1.2;
      if (!boss.aiAttackHit3 && ap > 0.2 && ap < 0.7) {
        const hx = ex + Math.sin(atkAng) * 2.0, hz = ez + Math.cos(atkAng) * 2.0;
        if (distXZ(hx, hz, P.x, P.z) < 1.6) {
          boss.aiAttackHit3 = true;
          applyDamageToPlayer(P, ex, ez, 22, 1.2);
          if (boss.phase === 2) spawnFirePillar(hx, hz);
        }
      }
      if (boss.aiTimer <= 0) {
        boss.aiState = 'recovery'; boss.aiTimer = 1.0 * recoveryMul;
        boss.weaponGroup.rotation.z = 0; boss.weaponGroup.rotation.x = 0;
      }
      break;
    }

    // ========== RECOVERY ==========
    case 'recovery':
      boss.group.rotation.y = faceAng;
      boss.aiTimer -= dt;
      boss.weaponGroup.rotation.z = -0.5;
      boss.weaponGroup.rotation.x = 0.3;
      if (boss.phase !== 2) boss.bodyMat.color.setHex(0xb0a07a);
      if (boss.aiTimer <= 0) {
        boss.bodyMat.color.setHex(0xc8b890);
        boss.weaponGroup.rotation.z = 0;
        boss.weaponGroup.rotation.x = 0;
        boss.aiState = Math.random() < 0.5 ? 'chase' : 'strafe';
        if (boss.aiState === 'strafe') {
          boss.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
          boss.aiStrafeTimer = 0.8 + Math.random() * 0.8;
        }
      }
      break;
  }
}

function initiateAttack(dist, ang, fleeing = false) {
  const atk = pickBossAttack(dist, boss.phase, fleeing);
  boss.aiAttackType = atk;
  boss.aiAttackHit1 = false; boss.aiAttackHit2 = false; boss.aiAttackHit3 = false;
  boss.aiWindupAng = ang;
  // Phase2: 15%でフェイント予約
  boss.feintScheduled = (boss.phase === 2 && Math.random() < 0.15);
  const phaseMul = boss.phase === 2 ? 0.7 : 1.0;
  if (atk === 'sweep') {
    boss.aiState = 'windup_sweep'; boss.aiTimer = 0.4 * phaseMul;
  } else if (atk === 'slam' || atk === 'fire_slam') {
    boss.aiState = 'windup_slam'; boss.aiTimer = 0.8 * phaseMul;
  } else {
    boss.aiState = 'windup_combo'; boss.aiTimer = 0.35 * phaseMul;
  }
  playBossAttackWhoosh();
}

// ============================================================
//  ボスビジュアル更新
// ============================================================
const BOSS_MOVING_STATES = new Set([
  'chase', 'strafe',
  'windup_sweep', 'windup_slam', 'windup_combo',
  'attack_sweep', 'attack_slam', 'attack_fire_slam',
  'attack_combo1', 'attack_combo2', 'attack_combo3',
]);

export function updateBossVisuals(dt) {
  if (boss.hitTimer > 0) {
    boss.hitTimer -= dt;
    const f = boss.hitTimer / 0.15;
    if (boss.phase !== 2) boss.bodyMat.emissive.setRGB(f, f, f);
    else boss.bodyMat.emissive.setRGB(0.4 + f * 0.6, 0.05 + f * 0.3, f * 0.2);
  }

  // スタガーアニメーション
  if (boss.staggered) {
    const sp = boss.staggerTimer / boss.staggerDuration;
    const lean = sp > 0.5 ? (1 - sp) * 0.5 : sp * 0.5;
    boss.bodyGroup.rotation.x = lean;
  } else if (!boss.aiState.startsWith('windup') && boss.bodyGroup.rotation.x !== 0) {
    boss.bodyGroup.rotation.x *= 0.9;
    if (Math.abs(boss.bodyGroup.rotation.x) < 0.01) boss.bodyGroup.rotation.x = 0;
  }

  // シェイク
  if (boss.shakeTimer > 0) {
    boss.shakeTimer -= dt;
    const s = boss.shakeTimer / 0.25;
    boss.group.position.x = boss.shakeOriginX + (Math.random() - 0.5) * 0.2 * s;
    boss.group.position.z = boss.shakeOriginZ + (Math.random() - 0.5) * 0.2 * s;
  } else if (!BOSS_MOVING_STATES.has(boss.aiState)) {
    boss.group.position.x = boss.baseX;
    boss.group.position.z = boss.baseZ;
  }

  // HPバー
  const r = boss.hp / boss.maxHp;
  boss.hpBarFill.scale.x = Math.max(r, 0.001);
  boss.hpBarFill.position.x = -(1.9 * (1 - r)) / 2;
  boss.hpBarFill.material.color.setHex(r > 0.5 ? 0x44cc44 : r > 0.25 ? 0xcccc22 : 0xff3333);
  boss.hpGroup.lookAt(camera.position);

  // 死亡アニメーション
  if (boss.hp <= 0) {
    boss.bodyGroup.rotation.z = THREE.MathUtils.lerp(boss.bodyGroup.rotation.z, Math.PI / 2, 0.03);
    boss.group.position.y = THREE.MathUtils.lerp(boss.group.position.y, -0.8, 0.02);
    boss.hpGroup.visible = false;
  }

  // 火柱パーティクル更新
  updateFireParticles(dt);

  // デバッグヒットボックス更新
  updateDebugHitbox();
}

// ============================================================
//  ボスリセット
// ============================================================
export function resetBoss() {
  boss.hp = boss.maxHp;
  boss.hitTimer = 0;
  boss.shakeTimer = 0;
  boss.hitThisSwing = false;
  boss.aiState = 'idle';
  boss.aiTimer = 0;
  boss.aiAttackType = 'none';
  boss.aiAttackHit1 = false; boss.aiAttackHit2 = false; boss.aiAttackHit3 = false;
  boss.poise = boss.maxPoise;
  boss.poiseRegenDelay = 0;
  boss.staggered = false;
  boss.staggerTimer = 0;
  boss.kbVX = 0; boss.kbVZ = 0;
  boss.feintScheduled = false;
  boss.phase = 1;
  boss.phaseTransitioned = false;
  // 位置
  boss.group.position.set(BOSS_SPAWN_X, 0, BOSS_SPAWN_Z);
  boss.group.rotation.y = 0;
  boss.baseX = BOSS_SPAWN_X; boss.baseZ = BOSS_SPAWN_Z;
  boss.shakeOriginX = BOSS_SPAWN_X; boss.shakeOriginZ = BOSS_SPAWN_Z;
  // ビジュアル
  boss.bodyGroup.rotation.set(0, 0, 0);
  boss.bodyGroup.position.set(0, 0, 0);
  boss.bodyMat.color.setHex(0xc8b890);
  boss.bodyMat.emissive.setRGB(0, 0, 0);
  boss.eyeMat.emissiveIntensity = 2.5;
  boss.weaponGroup.rotation.set(0, 0, 0);
  boss.hpGroup.visible = true;
  boss.group.position.y = 0;
  // 火柱クリア
  activeFirePillars.length = 0;
  for (let i = 0; i < FIRE_POOL_SIZE; i++) {
    fireParticles[i].life = 0;
    fireParticles[i].mesh.visible = false;
  }
  for (let i = 0; i < MAX_FIRE_PILLARS; i++) firePillarLights[i].intensity = 0;
}
