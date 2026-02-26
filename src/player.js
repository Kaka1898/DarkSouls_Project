import * as THREE from 'three';
import {
  scene, renderer, camera, getBoxGeo, getCylGeo,
  resolveCollision, getTerrainY, distXZ,
  dmgOL, youDiedEl, envMap, boneTex, boneNormal, hrBone,
} from './world.js';
import { mobileInput } from './ui.js';

// ============================================================
//  プレイヤーメッシュ
// ============================================================
// ローリング回転用（毎フレーム再利用、GC回避）
const _rollQuatA = new THREE.Quaternion();
const _rollQuatB = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);

export const player = new THREE.Group();
scene.add(player);

// === 人間の騎士 (Human Knight) — 7頭身プレートアーマー ===
// マテリアル定義
const armorMat = new THREE.MeshStandardMaterial({
  color: 0x888899, roughness: 0.3, metalness: 0.8,
  envMap, envMapIntensity: 0.6, emissive: 0x000000,
});
const bodyMat = armorMat; // 被弾エミッシブ制御用エイリアス
const skinMat = new THREE.MeshStandardMaterial({
  color: 0xffccaa, roughness: 0.8, metalness: 0.0,
});
const clothMat = new THREE.MeshStandardMaterial({
  color: 0x332222, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
});
const chainmailMat = new THREE.MeshStandardMaterial({
  color: 0x555566, roughness: 0.45, metalness: 0.7, envMap, envMapIntensity: 0.4,
});
const darkArmorMat = new THREE.MeshStandardMaterial({
  color: 0x555566, roughness: 0.35, metalness: 0.75, envMap, envMapIntensity: 0.5,
});
const visorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1.0, metalness: 0 });
const jointGeo = new THREE.IcosahedronGeometry(1, 0); // 関節カバー用

// ============================================================
//  胴体（body — ロール回転・被弾エミッシブの制御対象）
// ============================================================
const body = new THREE.Group();
body.position.y = 0.95; player.add(body);

// 胸甲（Breastplate） — メイン装甲
const breastplate = new THREE.Mesh(getBoxGeo(0.54, 0.52, 0.24), armorMat);
breastplate.position.set(0, 0.15, -0.06);
breastplate.castShadow = true; body.add(breastplate);
// 胸甲の中央稜線（装飾リッジ）
const chestRidge = new THREE.Mesh(getBoxGeo(0.05, 0.56, 0.27), darkArmorMat);
chestRidge.position.set(0, 0.15, -0.04); body.add(chestRidge);
// 背面装甲（バックプレート）
const backPlate = new THREE.Mesh(getBoxGeo(0.48, 0.48, 0.16), darkArmorMat);
backPlate.position.set(0, 0.15, 0.12); backPlate.castShadow = true; body.add(backPlate);

// 鎖帷子（Chainmail） — 胴体の隙間を覆う
const chainmailTorso = new THREE.Mesh(getCylGeo(0.26, 0.6, 8), chainmailMat);
chainmailTorso.position.set(0, 0.0, 0); body.add(chainmailTorso);

// 腰甲（Fauld） — 腰回りの装甲スカート
const fauld = new THREE.Mesh(getCylGeo(0.3, 0.2, 8), armorMat);
fauld.position.y = -0.28; fauld.castShadow = true; body.add(fauld);
// タセット（腰の垂れ装甲）
const tassetGeo = getBoxGeo(0.14, 0.22, 0.06);
const tassetL = new THREE.Mesh(tassetGeo, armorMat);
tassetL.position.set(-0.18, -0.42, -0.06); tassetL.rotation.x = 0.1; body.add(tassetL);
const tassetR = new THREE.Mesh(tassetGeo, armorMat);
tassetR.position.set(0.18, -0.42, -0.06); tassetR.rotation.x = 0.1; body.add(tassetR);
// 腰布（サーコート） — 前後に垂れる布
const surcoatFront = new THREE.Mesh(getBoxGeo(0.28, 0.3, 0.02), clothMat);
surcoatFront.position.set(0, -0.45, -0.12); surcoatFront.rotation.x = 0.1; body.add(surcoatFront);
const surcoatBack = new THREE.Mesh(getBoxGeo(0.34, 0.35, 0.02), clothMat);
surcoatBack.position.set(0, -0.48, 0.12); surcoatBack.rotation.x = -0.08; body.add(surcoatBack);
// 腰ベルト
const belt = new THREE.Mesh(getBoxGeo(0.58, 0.07, 0.32), darkArmorMat);
belt.position.y = -0.24; belt.castShadow = true; body.add(belt);
// ベルトバックル（装飾）
const buckle = new THREE.Mesh(getBoxGeo(0.08, 0.08, 0.04), new THREE.MeshStandardMaterial({
  color: 0xccaa44, metalness: 0.9, roughness: 0.2, envMap, envMapIntensity: 0.8,
}));
buckle.position.set(0, -0.24, -0.18); body.add(buckle);

// ============================================================
//  頭部（フルフェイス・グレートヘルム）
// ============================================================
const headMat = armorMat; // 兜素材 = 鎧と同じ
const headGroup = new THREE.Group();
headGroup.position.y = 1.82; player.add(headGroup);
// ヘルム本体（球形に近い兜）
const helmBase = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), armorMat);
helmBase.scale.set(1, 1.1, 1.05); // やや縦長・前後に厚い
helmBase.position.y = 0.04; helmBase.castShadow = true; headGroup.add(helmBase);
const headMesh = helmBase; // 装備変更で参照

// フェイスプレート（前面装甲）
const facePlate = new THREE.Mesh(getBoxGeo(0.3, 0.22, 0.06), darkArmorMat);
facePlate.position.set(0, -0.04, -0.18); headGroup.add(facePlate);
// 呼吸穴（ブレスホール） — 小さなスリット
for (let i = 0; i < 3; i++) {
  const hole = new THREE.Mesh(getBoxGeo(0.06, 0.012, 0.02), visorMat);
  hole.position.set(0, -0.1 - i * 0.025, -0.22); headGroup.add(hole);
}
// バイザー（アイスリット）
const visor = new THREE.Mesh(getBoxGeo(0.28, 0.04, 0.04), visorMat);
visor.position.set(0, 0.0, -0.22); headGroup.add(visor);
// 目の発光（スリットの奥から）
const eyeGlow = new THREE.MeshStandardMaterial({ color: 0x22cc88, emissive: 0x22cc88, emissiveIntensity: 1.2 });
const eyeGeo = new THREE.SphereGeometry(0.02, 4, 4);
const eyeL = new THREE.Mesh(eyeGeo, eyeGlow);
eyeL.position.set(-0.07, 0.0, -0.23); headGroup.add(eyeL);
const eyeR = new THREE.Mesh(eyeGeo, eyeGlow);
eyeR.position.set(0.07, 0.0, -0.23); headGroup.add(eyeR);
// 兜の稜線（クレスト）
const helmetRidge = new THREE.Mesh(getBoxGeo(0.04, 0.14, 0.36), darkArmorMat);
helmetRidge.position.set(0, 0.2, 0); headGroup.add(helmetRidge);
// 兜の縁取り（ブリム）
const helmBrim = new THREE.Mesh(getBoxGeo(0.36, 0.03, 0.04), darkArmorMat);
helmBrim.position.set(0, -0.07, -0.18); headGroup.add(helmBrim);
// 首回りのゴルジェット（喉当て）
const gorget = new THREE.Mesh(getCylGeo(0.18, 0.1, 8), armorMat);
gorget.position.y = -0.2; headGroup.add(gorget);

// ============================================================
//  肩当て + 腕（プレートアーマー）
// ============================================================
// 肩当て（ポールドロン） — 丸みのある装甲
const pauldronGeo = new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
const pauldronL = new THREE.Mesh(pauldronGeo, armorMat);
pauldronL.position.set(-0.42, 1.52, 0); pauldronL.castShadow = true; player.add(pauldronL);
// ポールドロンの縁（装甲リム）
const pauldronRimGeo = getBoxGeo(0.24, 0.04, 0.24);
const pauldronRimL = new THREE.Mesh(pauldronRimGeo, darkArmorMat);
pauldronRimL.position.set(-0.42, 1.44, 0); player.add(pauldronRimL);

const pauldronR = new THREE.Mesh(pauldronGeo, armorMat);
pauldronR.position.set(0.42, 1.52, 0); pauldronR.castShadow = true; player.add(pauldronR);
const pauldronRimR = new THREE.Mesh(pauldronRimGeo, darkArmorMat);
pauldronRimR.position.set(0.42, 1.44, 0); player.add(pauldronRimR);

// 肩関節（鎖帷子がのぞく）
const shoulderJointL = new THREE.Mesh(jointGeo, chainmailMat);
shoulderJointL.scale.setScalar(0.07); shoulderJointL.position.set(-0.4, 1.38, 0); player.add(shoulderJointL);
const shoulderJointR = new THREE.Mesh(jointGeo, chainmailMat);
shoulderJointR.scale.setScalar(0.07); shoulderJointR.position.set(0.4, 1.38, 0); player.add(shoulderJointR);

// 上腕甲（リブレイス）
const upperArmGeo = new THREE.CapsuleGeometry(0.06, 0.35, 4, 8);
const upperArmL = new THREE.Mesh(upperArmGeo, armorMat);
upperArmL.position.set(-0.42, 1.12, 0); upperArmL.castShadow = true; player.add(upperArmL);
const upperArmR = new THREE.Mesh(upperArmGeo, armorMat);
upperArmR.position.set(0.42, 1.12, 0); upperArmR.castShadow = true; player.add(upperArmR);

// 肘関節（鎖帷子カバー + 肘当て）
const elbowJointL = new THREE.Mesh(jointGeo, chainmailMat);
elbowJointL.scale.setScalar(0.055); elbowJointL.position.set(-0.42, 0.88, 0); player.add(elbowJointL);
const elbowJointR = new THREE.Mesh(jointGeo, chainmailMat);
elbowJointR.scale.setScalar(0.055); elbowJointR.position.set(0.42, 0.88, 0); player.add(elbowJointR);
// 肘当て（コーター）
const couterGeo = getBoxGeo(0.09, 0.06, 0.08);
const couterL = new THREE.Mesh(couterGeo, darkArmorMat);
couterL.position.set(-0.42, 0.88, -0.04); player.add(couterL);
const couterR = new THREE.Mesh(couterGeo, darkArmorMat);
couterR.position.set(0.42, 0.88, -0.04); player.add(couterR);

// 前腕甲（ヴァンブレイス）
const forearmGeo = new THREE.CapsuleGeometry(0.05, 0.3, 4, 8);
const forearmL = new THREE.Mesh(forearmGeo, armorMat);
forearmL.position.set(-0.42, 0.65, 0); forearmL.castShadow = true; player.add(forearmL);
const forearmR = new THREE.Mesh(forearmGeo, armorMat);
forearmR.position.set(0.42, 0.65, 0); forearmR.castShadow = true; player.add(forearmR);

// ガントレット（装甲手袋）
const gauntletGeo = getBoxGeo(0.1, 0.08, 0.1);
const gauntletL = new THREE.Mesh(gauntletGeo, darkArmorMat);
gauntletL.position.set(-0.42, 0.5, 0); player.add(gauntletL);
const gauntletR = new THREE.Mesh(gauntletGeo, darkArmorMat);
gauntletR.position.set(0.42, 0.5, 0); player.add(gauntletR);
// 指部分（肌色がのぞく）
const fingerGeo = getBoxGeo(0.08, 0.03, 0.06);
const fingerL = new THREE.Mesh(fingerGeo, skinMat);
fingerL.position.set(-0.42, 0.44, -0.03); player.add(fingerL);
const fingerR = new THREE.Mesh(fingerGeo, skinMat);
fingerR.position.set(0.42, 0.44, -0.03); player.add(fingerR);

// ============================================================
//  脚（プレートアーマー）
// ============================================================
// 股関節（鎖帷子がのぞく）
const hipJointL = new THREE.Mesh(jointGeo, chainmailMat);
hipJointL.scale.setScalar(0.065); hipJointL.position.set(-0.15, 0.5, 0); player.add(hipJointL);
const hipJointR = new THREE.Mesh(jointGeo, chainmailMat);
hipJointR.scale.setScalar(0.065); hipJointR.position.set(0.15, 0.5, 0); player.add(hipJointR);

// 大腿甲（キュイス）
const thighGeo = new THREE.CapsuleGeometry(0.07, 0.35, 4, 8);
const thighL = new THREE.Mesh(thighGeo, armorMat);
thighL.position.set(-0.15, 0.28, 0); thighL.castShadow = true; player.add(thighL);
const thighR = new THREE.Mesh(thighGeo, armorMat);
thighR.position.set(0.15, 0.28, 0); thighR.castShadow = true; player.add(thighR);

// 膝当て（ポレイン）
const kneeJointL = new THREE.Mesh(jointGeo, darkArmorMat);
kneeJointL.scale.setScalar(0.06); kneeJointL.position.set(-0.15, 0.08, 0); player.add(kneeJointL);
const kneeJointR = new THREE.Mesh(jointGeo, darkArmorMat);
kneeJointR.scale.setScalar(0.06); kneeJointR.position.set(0.15, 0.08, 0); player.add(kneeJointR);
// 膝装甲板
const kneepadGeo = getBoxGeo(0.09, 0.09, 0.07);
const kneepadL = new THREE.Mesh(kneepadGeo, armorMat);
kneepadL.position.set(-0.15, 0.08, -0.06); player.add(kneepadL);
const kneepadR = new THREE.Mesh(kneepadGeo, armorMat);
kneepadR.position.set(0.15, 0.08, -0.06); player.add(kneepadR);

// 脛当て（グリーヴ）
const shinGeo = new THREE.CapsuleGeometry(0.058, 0.3, 4, 8);
const shinL = new THREE.Mesh(shinGeo, armorMat);
shinL.position.set(-0.15, -0.15, 0); shinL.castShadow = true; player.add(shinL);
const shinR = new THREE.Mesh(shinGeo, armorMat);
shinR.position.set(0.15, -0.15, 0); shinR.castShadow = true; player.add(shinR);

// 足（サバトン — 装甲ブーツ）
const footGeo = getBoxGeo(0.11, 0.07, 0.17);
const footL = new THREE.Mesh(footGeo, darkArmorMat);
footL.position.set(-0.15, -0.35, -0.02); player.add(footL);
const footR = new THREE.Mesh(footGeo, darkArmorMat);
footR.position.set(0.15, -0.35, -0.02); player.add(footR);

// ============================================================
//  魂の灯（胸元の発光コア — 騎士の紋章的アクセント）
// ============================================================
const soulCoreMat = new THREE.MeshStandardMaterial({
  color: 0x22cc88, emissive: 0x22cc88, emissiveIntensity: 0.6,
  transparent: true, opacity: 0.85,
});
const soulCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), soulCoreMat);
soulCore.position.set(0, 1.15, -0.2); player.add(soulCore);
// ソウルコアの外殻
const soulShell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshStandardMaterial({
  color: 0x115533, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
}));
soulShell.position.copy(soulCore.position); player.add(soulShell);

// ============================================================
//  武器（Sword — リッチな形状）
// ============================================================
const swordGroup = new THREE.Group();
swordGroup.position.set(0.5, 0.9, -0.1); player.add(swordGroup);

const bladeMat = new THREE.MeshStandardMaterial({
  color: 0xcccccc, metalness: 0.85, roughness: 0.15, envMap, envMapIntensity: 1.0,
});
const guardMat = new THREE.MeshStandardMaterial({
  color: 0x998866, metalness: 0.3, roughness: 0.5, envMap, envMapIntensity: 0.4,
});
const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2210, roughness: 0.9 });
const pommelMat = new THREE.MeshStandardMaterial({ color: 0x887755, metalness: 0.4, roughness: 0.4 });

// ブレード
const blade = new THREE.Mesh(getBoxGeo(0.07, 1.2, 0.025), bladeMat);
blade.position.y = 0.7; blade.castShadow = true; swordGroup.add(blade);
// 刃先
const tipGeo = new THREE.ConeGeometry(0.04, 0.15, 4);
const tip = new THREE.Mesh(tipGeo, bladeMat);
tip.position.y = 1.38; tip.rotation.y = Math.PI / 4; swordGroup.add(tip);
// ブレード中央稜線
const bladeRidge = new THREE.Mesh(getBoxGeo(0.015, 1.0, 0.035), bladeMat);
bladeRidge.position.y = 0.65; swordGroup.add(bladeRidge);

// ガード（十字鍔）
const guardMain = new THREE.Mesh(getBoxGeo(0.32, 0.04, 0.05), guardMat);
guardMain.position.y = 0.06; swordGroup.add(guardMain);
const guardBallGeo = new THREE.SphereGeometry(0.03, 5, 5);
const guardBallL = new THREE.Mesh(guardBallGeo, guardMat);
guardBallL.position.set(-0.16, 0.06, 0); swordGroup.add(guardBallL);
const guardBallR = new THREE.Mesh(guardBallGeo, guardMat);
guardBallR.position.set(0.16, 0.06, 0); swordGroup.add(guardBallR);

// グリップ
const grip = new THREE.Mesh(getCylGeo(0.035, 0.22, 6), gripMat);
grip.position.y = -0.06; swordGroup.add(grip);
// ポンメル
const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5), pommelMat);
pommel.position.y = -0.2; swordGroup.add(pommel);

// ============================================================
//  盾（Shield スロット）
// ============================================================
const shieldGroup = new THREE.Group();
shieldGroup.position.set(-0.5, 0.9, -0.1); shieldGroup.visible = false; player.add(shieldGroup);
const shieldMat = new THREE.MeshStandardMaterial({
  color: 0x777788, roughness: 0.35, metalness: 0.75,
  envMap, envMapIntensity: 0.5,
});

// ============================================================
//  装備変更でメッシュを差し替える
// ============================================================
const WEAPON_CONFIGS = {
  bone_sword:      { bladeW: 0.08, bladeH: 1.2, guardW: 0.3, color: 0xaaaaaa },
  bone_greatsword: { bladeW: 0.14, bladeH: 1.8, guardW: 0.4, color: 0xc0b090 },
  bone_dagger:     { bladeW: 0.05, bladeH: 0.6, guardW: 0.15,color: 0xbbbbbb },
  bone_mace:       { bladeW: 0.18, bladeH: 0.9, guardW: 0.2, color: 0x998870 },
};

export function applyWeaponVisual(weaponId) {
  const cfg = WEAPON_CONFIGS[weaponId] || WEAPON_CONFIGS.bone_sword;
  // ブレード形状変更
  blade.geometry.dispose();
  blade.geometry = getBoxGeo(cfg.bladeW, cfg.bladeH, 0.025);
  blade.position.y = cfg.bladeH / 2 + 0.1;
  bladeMat.color.setHex(cfg.color);
  // 刃先位置
  tip.position.y = cfg.bladeH + 0.18;
  bladeRidge.position.y = cfg.bladeH / 2 + 0.05;
  // ガード幅変更
  guardMain.geometry.dispose();
  guardMain.geometry = getBoxGeo(cfg.guardW, 0.04, 0.05);
}

export function applyShieldVisual(shieldId) {
  // 盾メッシュをクリア
  while (shieldGroup.children.length) {
    const c = shieldGroup.children[0];
    if (c.geometry) c.geometry.dispose();
    shieldGroup.remove(c);
  }
  if (shieldId === 'none') { shieldGroup.visible = false; return; }
  shieldGroup.visible = true;
  if (shieldId === 'bone_shield') {
    const s = new THREE.Mesh(getBoxGeo(0.4, 0.5, 0.06), shieldMat);
    s.castShadow = true; shieldGroup.add(s);
  } else if (shieldId === 'bone_greatshield') {
    const s = new THREE.Mesh(getBoxGeo(0.6, 0.8, 0.08), shieldMat);
    s.castShadow = true; shieldGroup.add(s);
  }
}

export function applyHelmetVisual(helmetId) {
  helmetRidge.visible = true;
  if (helmetId === 'none') {
    armorMat.color.setHex(0x888899);
    helmetRidge.visible = false;
  } else if (helmetId === 'bone_helm') {
    armorMat.color.setHex(0x888899);
  } else if (helmetId === 'beast_skull') {
    armorMat.color.setHex(0x777788);
    headMesh.scale.set(1.1, 1.12, 1.1);
  }
}

export function applyArmorVisual(armorId) {
  if (armorId === 'bone_armor') {
    armorMat.color.setHex(0x888899);
    body.scale.set(1, 1, 1);
  } else if (armorId === 'beast_armor') {
    armorMat.color.setHex(0x666677);
    body.scale.set(1.15, 1.05, 1.15); // 重鎧は大きめ
  } else if (armorId === 'moss_robe') {
    armorMat.color.setHex(0x556655);
    body.scale.set(1.05, 1.1, 1.05);
  }
}

// 回復フラスコ
const flaskGroup = new THREE.Group();
flaskGroup.position.set(-0.5, 0.7, -0.1); flaskGroup.visible = false; player.add(flaskGroup);
const flaskMat = new THREE.MeshStandardMaterial({ color: 0x22aa66, emissive: 0x22cc88, emissiveIntensity: 0.4 });
flaskGroup.add(new THREE.Mesh(getCylGeo(0.06, 0.3, 6), flaskMat));
const flaskNeck = new THREE.Mesh(getCylGeo(0.03, 0.12, 6), flaskMat);
flaskNeck.position.y = 0.2; flaskGroup.add(flaskNeck);

// ============================================================
//  エフェクト
// ============================================================
const attackArcMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0, side: THREE.DoubleSide });
const attackArcGeo = new THREE.PlaneGeometry(1.5, 1.5);
attackArcGeo.rotateX(-Math.PI / 2); // ジオメトリ自体を水平に焼き込み
const attackArc = new THREE.Mesh(attackArcGeo, attackArcMat);
attackArc.position.y = 0.3; scene.add(attackArc);

export const hitFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
export const hitFlash = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), hitFlashMat);
scene.add(hitFlash);

const healAuraMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0, side: THREE.DoubleSide });
const healAura = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 10, 1, true), healAuraMat);
healAura.position.y = 1.0; player.add(healAura);

// ============================================================
//  ダメージ数字（DOMプール方式）
// ============================================================
const DMG_POOL_SIZE = 24;
const dmgContainer = document.createElement('div');
dmgContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden';
document.body.appendChild(dmgContainer);

const dmgStyle = document.createElement('style');
dmgStyle.textContent = `
  .dmg-num{position:absolute;font:bold 22px monospace;color:#ffcc33;text-shadow:0 0 6px rgba(255,150,0,.8),0 0 12px rgba(255,80,0,.4),1px 1px 0 #000;pointer-events:none;opacity:0;transition:none;white-space:nowrap}
  .dmg-num.crit{font-size:30px;color:#ff4444;text-shadow:0 0 8px rgba(255,50,50,.9),0 0 16px rgba(255,0,0,.5),1px 1px 0 #000}
`;
document.body.appendChild(dmgStyle);

const dmgPool = [];
for (let i = 0; i < DMG_POOL_SIZE; i++) {
  const el = document.createElement('div');
  el.className = 'dmg-num';
  dmgContainer.appendChild(el);
  dmgPool.push({ el, life: 0, wx: 0, wy: 0, wz: 0, vy: 0, offsetX: 0 });
}

const _dmgVec = new THREE.Vector3();

export function spawnDamageNumber(x, y, z, damage, isCrit = false) {
  let best = null, bestLife = Infinity;
  for (const d of dmgPool) {
    if (d.life <= 0) { best = d; break; }
    if (d.life < bestLife) { bestLife = d.life; best = d; }
  }
  if (!best) return;
  best.wx = x; best.wy = y; best.wz = z;
  best.life = 1.0;
  best.vy = 2.5;
  best.offsetX = (Math.random() - 0.5) * 0.8;
  best.el.textContent = Math.round(damage);
  best.el.classList.toggle('crit', isCrit);
  best.el.style.opacity = '1';
}

export function updateDamageNumbers(dt) {
  const hw = window.innerWidth / 2;
  const hh = window.innerHeight / 2;
  for (const d of dmgPool) {
    if (d.life <= 0) continue;
    d.life -= dt;
    d.wy += d.vy * dt;
    d.vy -= 3 * dt;
    d.wx += d.offsetX * dt;
    if (d.life <= 0) { d.el.style.opacity = '0'; continue; }
    // ワールド→スクリーン座標変換
    _dmgVec.set(d.wx, d.wy, d.wz);
    _dmgVec.project(camera);
    const sx = (_dmgVec.x * hw) + hw;
    const sy = -(_dmgVec.y * hh) + hh;
    // カメラ背面なら非表示
    if (_dmgVec.z > 1) { d.el.style.opacity = '0'; continue; }
    d.el.style.opacity = String(Math.min(1, d.life / 0.3));
    d.el.style.left = sx + 'px';
    d.el.style.top = sy + 'px';
  }
}

// ============================================================
//  ソードトレイル（リボンメッシュ）
// ============================================================
const TRAIL_LENGTH = 8;
const trailPositions = new Float32Array(TRAIL_LENGTH * 2 * 3); // 各ポイント上端+下端
const trailAlphas = new Float32Array(TRAIL_LENGTH * 2);
const trailIndices = [];
for (let i = 0; i < TRAIL_LENGTH - 1; i++) {
  const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
  trailIndices.push(a, c, b, b, c, d);
}
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
trailGeo.setAttribute('alpha', new THREE.BufferAttribute(trailAlphas, 1));
trailGeo.setIndex(trailIndices);

const trailMat = new THREE.ShaderMaterial({
  transparent: true, side: THREE.DoubleSide, depthWrite: false,
  uniforms: { opacity: { value: 1.0 } },
  vertexShader: `
    attribute float alpha;
    varying float vAlpha;
    void main() {
      vAlpha = alpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float opacity;
    varying float vAlpha;
    void main() {
      gl_FragColor = vec4(1.0, 0.65, 0.2, vAlpha * opacity);
    }`,
});
const trailMesh = new THREE.Mesh(trailGeo, trailMat);
trailMesh.frustumCulled = false;
scene.add(trailMesh);

let trailFadeTimer = 0;
const _tipTop = new THREE.Vector3();
const _tipBot = new THREE.Vector3();
const _worldPos = new THREE.Vector3();

function resetTrail() {
  trailPositions.fill(0);
  trailAlphas.fill(0);
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.alpha.needsUpdate = true;
}

function updateTrail() {
  // blade のワールド座標からtip上端/下端を取得
  blade.updateWorldMatrix(true, false);
  _tipTop.set(0, 1.2, 0).applyMatrix4(blade.matrixWorld);
  _tipBot.set(0, 0, 0).applyMatrix4(blade.matrixWorld);

  // シフト（古いデータを前へ）
  for (let i = 0; i < (TRAIL_LENGTH - 1) * 2 * 3; i++) {
    trailPositions[i] = trailPositions[i + 2 * 3];
  }
  // 最新ポイントを末尾に追加
  const last = (TRAIL_LENGTH - 1) * 2 * 3;
  trailPositions[last] = _tipTop.x; trailPositions[last + 1] = _tipTop.y; trailPositions[last + 2] = _tipTop.z;
  trailPositions[last + 3] = _tipBot.x; trailPositions[last + 4] = _tipBot.y; trailPositions[last + 5] = _tipBot.z;

  // アルファ: 末端0 → 先端1
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const a = i / (TRAIL_LENGTH - 1);
    trailAlphas[i * 2] = a * 0.8;
    trailAlphas[i * 2 + 1] = a * 0.8;
  }

  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.alpha.needsUpdate = true;
  trailMat.uniforms.opacity.value = 1.0;
  trailFadeTimer = 0.3;
}

// ============================================================
//  衝突パーティクル（プール方式）
// ============================================================
const PARTICLE_POOL_SIZE = 40;
const particleGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
const particles = [];
for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(particleGeo, mat);
  mesh.visible = false;
  scene.add(mesh);
  particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0 });
}

export function spawnHitParticles(x, y, z, count, speedMin, speedMax) {
  let spawned = 0;
  for (let i = 0; i < PARTICLE_POOL_SIZE && spawned < count; i++) {
    const p = particles[i];
    if (p.life > 0) continue;
    spawned++;
    p.mesh.position.set(x, y, z);
    p.mesh.visible = true;
    // ランダム方向に放射
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.6 + 0.2; // 上寄りに散る
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    p.vx = Math.sin(theta) * Math.sin(phi) * speed;
    p.vy = Math.cos(phi) * speed + 2; // 上方向バイアス
    p.vz = Math.cos(theta) * Math.sin(phi) * speed;
    p.maxLife = 0.3 + Math.random() * 0.3;
    p.life = p.maxLife;
    // ランダム火花色（オレンジ〜黄色〜白）
    const colors = [0xffaa33, 0xffcc44, 0xff8811, 0xffdd66, 0xffffff];
    p.mat.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    p.mat.opacity = 1;
  }
}

function updateParticles(dt) {
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    const p = particles[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; p.life = 0; continue; }
    p.vy -= 15 * dt; // 重力
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mat.opacity = Math.max(0, p.life / p.maxLife);
  }
}

// ============================================================
//  入力
// ============================================================
export const input = {
  keys: {},
  mouseDX: 0,
  mouseDY: 0,
  attackRequest: false,
  mouseDown: false,
  heavyDown: false,
  lockOnRequest: false,
  healRequest: false,
  interactRequest: false,
};

export function initInput() {
  window.addEventListener('keydown', (e) => { input.keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  renderer.domElement.addEventListener('click', () => {
    // メニュー表示中はPointer Lock取得しない
    const pauseMenu = document.getElementById('pauseMenu');
    if (pauseMenu && pauseMenu.classList.contains('active')) return;
    if (!document.pointerLockElement) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement) {
      if (e.button === 0) { input.attackRequest = true; input.mouseDown = true; }
      if (e.button === 1) input.lockOnRequest = true;
      if (e.button === 2) { input.heavyDown = true; }
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
    if (e.button === 2) input.heavyDown = false;
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') input.lockOnRequest = true;
    if (e.code === 'KeyR') input.healRequest = true;
    if (e.code === 'KeyE') input.interactRequest = true;
  });
}

// ============================================================
//  プレイヤー状態
// ============================================================
// コンボパラメータ定義
const COMBO_PARAMS = [
  null, // index 0 unused
  { duration: 0.4, damage: 10, impact: 12, hitStop: 0.06, kb: 1.5, kbStagger: 4, swingAnim: -1.5, lungeSpeed: 5, staminaCost: 7 },
  { duration: 0.45, damage: 14, impact: 15, hitStop: 0.08, kb: 2.0, kbStagger: 5, swingAnim: 1.8, lungeSpeed: 6, staminaCost: 7 },
  { duration: 0.55, damage: 22, impact: 25, hitStop: 0.12, kb: 4.0, kbStagger: 7, swingAnim: -2.5, lungeSpeed: 7, staminaCost: 10 },
];
const CHARGE_PARAMS = { duration: 0.7, damage: 35, impact: 35, hitStop: 0.15, kb: 6.0, kbStagger: 10, chargeTime: 0.8, staminaCost: 15, lungeSpeed: 18, lungeDuration: 0.45 };

export const P = {
  hp: 100, maxHp: 100, x: 0, y: 0, z: 8, vy: 0, facing: 0,
  rolling: false, rollTimer: 0, rollDuration: 0.4, rollSpeed: 18, rollDirX: 0, rollDirZ: 0, _rollYOffset: 0,
  get isInvincible() { return this.rolling && this.rollTimer > this.rollDuration * 0.3; },
  attacking: false, attackTimer: 0, attackDuration: 0.5, attackLunged: false,
  // コンボ
  comboStep: 0, comboWindowOpen: false,
  // 溜め攻撃
  charging: false, chargeTimer: 0, chargeReady: false, chargedAttack: false,
  // 入力バッファリング（先行入力）
  bufferedAttack: false, bufferedRoll: false, bufferTimer: 0, bufferWindow: 0.25,
  // 武器の重量感（動的に設定される）
  weaponImpact: 12, weaponHitStop: 0.06, weaponDamage: 10,
  // 現在のノックバック倍率（動的に設定される）
  currentKb: 1.5, currentKbStagger: 4,
  // ヒット時の攻撃スロー（食い込み感）
  attackSlowTimer: 0, attackSlowDuration: 0.12, attackSlowFactor: 0.15,
  stamina: 100, maxStamina: 100, staminaRegenRate: 18,
  staminaRegenDelay: 0.5, staminaDelayCurrent: 0,
  staminaCostAttack: 7, staminaCostRoll: 10, isExhausted: false,
  isHealing: false, healTimer: 0, healDuration: 1.5, healAmount: 40, healGranted: false,
  estusCount: 5, estusMax: 5,
  hitFlashTimer: 0, knockbackVX: 0, knockbackVZ: 0, isDead: false,
  groundY: 0,
  // 落下死
  isFalling: false, fallDeathTimer: 0,
  // 速度トラッキング（ボスAI予測用）
  prevX: 0, prevZ: 8, velX: 0, velZ: 0,
};

const GRAVITY = -25;
const MOVE_SPEED = 4;
export const PLAYER_RADIUS = 0.4;
export const LOCK_ON_RANGE = 20;

export function isPlayerBusy(extraCondition = false) {
  return P.attacking || P.rolling || P.isHealing || P.charging || extraCondition;
}

// ============================================================
//  プレイヤー更新（メインループから呼ばれる）
//  戻り値: { hitStop: number } — ヒットストップ時間（0なら無し）
// ============================================================
export function updatePlayer(dt, cameraYaw, lockedOn, enemy, lockTarget) {
  const lockTgt = lockTarget || enemy; // ロックオン先（敵 or ボス）
  let hitStopResult = 0;
  let cameraShakeResult = 0;

  // --- 速度算出（ボスAI予測用） ---
  const safeDt = Math.max(dt, 0.001);
  P.velX = (P.x - P.prevX) / safeDt;
  P.velZ = (P.z - P.prevZ) / safeDt;
  P.prevX = P.x;
  P.prevZ = P.z;

  // --- 入力方向 ---
  // moveSpeedMult: 1.0=フル速度、<1.0=歩き（スティック強度で滑らかに変化）
  let mX = 0, mZ = 0;
  let moveSpeedMult = 1.0;

  if (mobileInput.active && mobileInput.force > 0.05) {
    // ─────────────────────────────────────────────────────────────────
    //  カメラ相対移動ベクトル: V = R_cam * joyX + F_cam * joyY
    //
    //  カメラ右方向  R_cam = ( cos(yaw), -sin(yaw) )  ← XZ平面
    //  カメラ前方向  F_cam = (-sin(yaw), -cos(yaw) )  ← XZ平面
    //
    //  joyX: スティック右=+1  joyY: スティック上(前進)=+1
    // ─────────────────────────────────────────────────────────────────
    const jX = mobileInput.joyX, jY = mobileInput.joyY;
    mX =  Math.cos(cameraYaw) * jX - Math.sin(cameraYaw) * jY;
    mZ = -Math.sin(cameraYaw) * jX - Math.cos(cameraYaw) * jY;
    // スティック強度で歩き（力が弱い）↔走り（力が強い）を滑らかに切替
    // force < 0.45: ゆっくり歩行、force = 1.0: フル走行
    moveSpeedMult = Math.max(0.4, mobileInput.force);
  } else {
    // キーボード入力（W/A/S/D）: 正規化後にカメラ回転を適用
    const keys = input.keys;
    let inX = 0, inZ = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    inZ -= 1;
    if (keys['KeyS'] || keys['ArrowDown'])  inZ += 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  inX -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) inX += 1;
    if (inX !== 0 || inZ !== 0) {
      const l = Math.sqrt(inX * inX + inZ * inZ);
      mX = (inX / l) * Math.cos(cameraYaw) + (inZ / l) * Math.sin(cameraYaw);
      mZ = (inX / l) * -Math.sin(cameraYaw) + (inZ / l) * Math.cos(cameraYaw);
    }
  }

  // input.keys への参照をそのまま保持（ローリング・攻撃バッファ判定で使用）
  const keys = input.keys;
  const hasIn = mX !== 0 || mZ !== 0;

  // --- 入力バッファリング（先行入力） ---
  if (P.bufferTimer > 0) P.bufferTimer -= dt;
  else { P.bufferedAttack = false; P.bufferedRoll = false; }
  if (input.attackRequest && isPlayerBusy()) {
    P.bufferedAttack = true; P.bufferedRoll = false; P.bufferTimer = P.bufferWindow;
  }
  if (keys['Space'] && isPlayerBusy()) {
    P.bufferedRoll = true; P.bufferedAttack = false; P.bufferTimer = P.bufferWindow;
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
      P.healGranted = false;
      playHealSound();
    }
  }
  if (P.isHealing) {
    P.healTimer -= dt;
    const pg = 1 - P.healTimer / P.healDuration;
    flaskGroup.position.y = pg < 0.4 ? 0.7 + pg * 2.5 : pg < 0.7 ? 1.7 : 1.7 - (pg - 0.7) * 3.3;
    healAuraMat.opacity = (pg > 0.35 && pg < 0.75) ? Math.sin(((pg - 0.35) / 0.4) * Math.PI) * 0.3 : 0;
    if (pg >= 0.55 && !P.healGranted) { P.healGranted = true; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * (P.healAmount / 100)); }
    if (P.healTimer <= 0) { P.isHealing = false; flaskGroup.visible = false; flaskGroup.position.y = 0.7; healAuraMat.opacity = 0; }
  }

  // --- ローリング ---
  const rollInput = (keys['Space'] || P.bufferedRoll) && !isPlayerBusy() && !P.isExhausted && P.stamina >= P.staminaCostRoll;
  if (rollInput) {
    P.bufferedRoll = false;
    P.stamina -= P.staminaCostRoll; P.staminaDelayCurrent = P.staminaRegenDelay;
    if (P.stamina <= 0) { P.stamina = 0; P.isExhausted = true; }

    // --- 方向決定: cameraYaw（引数で渡される最新値）から直接構築 ---
    // cameraYaw の座標系: カメラ位置 = player + (sin(yaw)*d, cos(yaw)*d)
    // → カメラの前方（プレイヤーに向かう方向）= (-sin(yaw), -cos(yaw))
    // → カメラの右方向 = (-cos(yaw), +sin(yaw))
    // ※ これは既存の mX/mZ 計算と同じ座標系
    if (hasIn) {
      // mX, mZ は既にカメラ相対で正規化済み — そのまま使う
      P.rollDirX = mX;
      P.rollDirZ = mZ;
    } else {
      // 入力なし → 現在の facing 方向の真後ろ（バックステップ）
      // facing 座標系: player前方 = (-sin(facing), -cos(facing))
      // 後方はその逆
      P.rollDirX = Math.sin(P.facing);
      P.rollDirZ = Math.cos(P.facing);
    }

    // 開始フレームで即座にロール方向へ向く（LERPなし）
    P.facing = Math.atan2(-P.rollDirX, -P.rollDirZ);

    P.rolling = true; P.rollTimer = P.rollDuration; keys['Space'] = false;
    P.knockbackVX = 0; P.knockbackVZ = 0;
    playRollWhoosh();

  }
  if (P.rolling) {
    P.rollTimer -= dt;
    const rp = 1 - P.rollTimer / P.rollDuration; // 0→1 進行率

    // 速度カーブ: 序盤は速く、終盤は減速（重量感のあるソウルライク回避）
    const speedCurve = rp < 0.3 ? 1.0 : 1.0 - (rp - 0.3) * (1.0 / 0.7);
    const curSpeed = P.rollSpeed * Math.max(speedCurve, 0.15);

    // rollDir のみで座標を更新（鎖国: 他の移動処理は全てスキップ）
    const nx = P.x + P.rollDirX * curSpeed * dt;
    const nz = P.z + P.rollDirZ * curSpeed * dt;
    const c = resolveCollision(nx, nz, PLAYER_RADIUS);
    P.x = c.x; P.z = c.z;

    // 回転アニメ: クォータニオンで facing方向のローカルX軸周りに転がる
    const rollAngle = rp * Math.PI * 2;
    const _facingQ = _rollQuatA.setFromAxisAngle(_yAxis, P.facing);
    const _tumbleQ = _rollQuatB.setFromAxisAngle(_xAxis, -rollAngle);
    // facing を適用してからローカルX軸回転 = facing * tumble
    player.quaternion.copy(_facingQ).multiply(_tumbleQ);

    // Y嵩上げで地面埋まり防止
    P._rollYOffset = Math.abs(Math.sin(rollAngle)) * 1.0;

    if (P.rollTimer <= 0) { P.rolling = false; P._rollYOffset = 0; }
  }

  // --- 溜め攻撃（右クリック） ---
  if (input.heavyDown && !isPlayerBusy() && !P.isExhausted && !P.isFalling) {
    if (!P.charging) {
      P.charging = true; P.chargeTimer = 0; P.chargeReady = false;
    }
  }
  if (P.charging) {
    P.chargeTimer += dt;
    const chargeRatio = Math.min(P.chargeTimer / CHARGE_PARAMS.chargeTime, 1.0);
    swordGroup.rotation.z = chargeRatio * 2.5;
    swordGroup.rotation.x = chargeRatio * 0.5;
    if (P.chargeTimer >= CHARGE_PARAMS.chargeTime && !P.chargeReady) {
      P.chargeReady = true;
      playChargeReadySound();
    }
    if (P.chargeReady) {
      body.position.x = (Math.random() - 0.5) * 0.03;
      body.position.z = (Math.random() - 0.5) * 0.03;
    }
    if (!input.heavyDown) {
      if (P.chargeReady && P.stamina >= CHARGE_PARAMS.staminaCost) {
        P.charging = false;
        P.chargedAttack = true; P.attacking = true; P.comboStep = 0;
        P.attackDuration = CHARGE_PARAMS.duration;
        P.attackTimer = CHARGE_PARAMS.duration;
        P.attackLunged = false; P.comboWindowOpen = false;
        P.weaponDamage = CHARGE_PARAMS.damage; P.weaponImpact = CHARGE_PARAMS.impact;
        P.weaponHitStop = CHARGE_PARAMS.hitStop;
        P.currentKb = CHARGE_PARAMS.kb; P.currentKbStagger = CHARGE_PARAMS.kbStagger;
        P.stamina -= CHARGE_PARAMS.staminaCost; P.staminaDelayCurrent = P.staminaRegenDelay;
        if (P.stamina <= 0) { P.stamina = 0; P.isExhausted = true; }
        enemy.hitThisSwing = false;
        playChargedSwing();
        if (lockedOn) P.facing = Math.atan2(-(lockTgt.group.position.x - P.x), -(lockTgt.group.position.z - P.z));
      } else {
        P.charging = false; P.chargeReady = false; P.chargeTimer = 0;
      }
      swordGroup.rotation.z = 0; swordGroup.rotation.x = 0; swordGroup.position.z = 0;
      body.position.x = 0; body.position.z = 0;
    }
  }

  // --- 攻撃（3連コンボ） ---
  let atkInput = input.attackRequest || P.bufferedAttack;
  if (input.attackRequest) input.attackRequest = false;

  // 新規攻撃開始: コンボステップ1
  if (atkInput && !isPlayerBusy() && !P.isExhausted && !P.isFalling && P.stamina >= COMBO_PARAMS[1].staminaCost) {
    P.bufferedAttack = false;
    P.comboStep = 1; P.chargedAttack = false;
    const cp = COMBO_PARAMS[1];
    P.attackDuration = cp.duration; P.attackTimer = cp.duration;
    P.attacking = true; P.attackLunged = false; P.comboWindowOpen = false;
    P.weaponDamage = cp.damage; P.weaponImpact = cp.impact; P.weaponHitStop = cp.hitStop;
    P.currentKb = cp.kb; P.currentKbStagger = cp.kbStagger;
    P.stamina -= cp.staminaCost; P.staminaDelayCurrent = P.staminaRegenDelay;
    if (P.stamina <= 0) { P.stamina = 0; P.isExhausted = true; }
    enemy.hitThisSwing = false; playSwordSwing();
    if (lockedOn) P.facing = Math.atan2(-(lockTgt.group.position.x - P.x), -(lockTgt.group.position.z - P.z));
  }

  if (P.attacking) {
    // コンボウィンドウ判定
    const pgCheck = 1 - P.attackTimer / P.attackDuration;
    if (!P.chargedAttack && pgCheck > 0.55 && P.comboStep > 0 && P.comboStep < 3) {
      P.comboWindowOpen = true;
    }

    // コンボチェーン: ウィンドウ中に攻撃入力 → 次段へ
    if (P.comboWindowOpen && atkInput && P.comboStep < 3 && !P.isExhausted) {
      const nextStep = P.comboStep + 1;
      const cp = COMBO_PARAMS[nextStep];
      if (P.stamina >= cp.staminaCost) {
        P.bufferedAttack = false; atkInput = false;
        P.comboStep = nextStep;
        P.attackDuration = cp.duration; P.attackTimer = cp.duration;
        P.attackLunged = false; P.comboWindowOpen = false;
        P.weaponDamage = cp.damage; P.weaponImpact = cp.impact; P.weaponHitStop = cp.hitStop;
        P.currentKb = cp.kb; P.currentKbStagger = cp.kbStagger;
        P.stamina -= cp.staminaCost; P.staminaDelayCurrent = P.staminaRegenDelay;
        if (P.stamina <= 0) { P.stamina = 0; P.isExhausted = true; }
        enemy.hitThisSwing = false; playSwordSwing();
        if (lockedOn) P.facing = Math.atan2(-(lockTgt.group.position.x - P.x), -(lockTgt.group.position.z - P.z));
      }
    }

    // 攻撃アニメーション
    let atkDt = dt;
    if (P.attackSlowTimer > 0) { P.attackSlowTimer -= dt; atkDt = dt * P.attackSlowFactor; }
    P.attackTimer -= atkDt;
    const pg = 1 - P.attackTimer / P.attackDuration;
    const cp = P.chargedAttack ? CHARGE_PARAMS : (COMBO_PARAMS[P.comboStep] || COMBO_PARAMS[1]);

    // 踏み込み
    if (P.chargedAttack) {
      // 突進攻撃: 長い距離を高速で前進
      const lungeFrac = CHARGE_PARAMS.lungeDuration / P.attackDuration;
      if (pg < lungeFrac) {
        // 加速→減速のイージング
        const lp = pg / lungeFrac;
        const ease = lp < 0.5 ? 2 * lp : 2 * (1 - lp);
        const spd = CHARGE_PARAMS.lungeSpeed * ease;
        let nx = P.x - Math.sin(P.facing) * spd * dt;
        let nz = P.z - Math.cos(P.facing) * spd * dt;
        const c = resolveCollision(nx, nz, PLAYER_RADIUS); P.x = c.x; P.z = c.z;
      }
    } else {
      const lungeSpeed = cp.lungeSpeed || 6;
      if (pg < 0.3 && !P.attackLunged) {
        let nx = P.x - Math.sin(P.facing) * lungeSpeed * dt;
        let nz = P.z - Math.cos(P.facing) * lungeSpeed * dt;
        const c = resolveCollision(nx, nz, PLAYER_RADIUS); P.x = c.x; P.z = c.z;
      }
      if (pg >= 0.3) P.attackLunged = true;
    }

    // 剣振りアニメーション（コンボ段数・溜め攻撃で変化）
    if (P.chargedAttack) {
      // 突き構え → 突進 → 引き戻し
      const thrustPg = Math.min(pg / 0.5, 1.0);
      swordGroup.rotation.x = -1.5; // 剣を前方に向ける（突き構え）
      swordGroup.rotation.z = thrustPg < 0.6 ? -0.3 : -0.3 + (thrustPg - 0.6) * 0.75;
      swordGroup.position.z = thrustPg < 0.6 ? -thrustPg * 1.2 : -0.72 + (thrustPg - 0.6) * 1.8;
    } else {
      const swingAng = cp.swingAnim || -1.5;
      swordGroup.rotation.z = Math.sin(pg * Math.PI) * swingAng;
      swordGroup.rotation.x = Math.sin(pg * Math.PI) * (P.comboStep === 3 ? -1.0 : -0.5);
    }

    // アタックアーク
    attackArc.position.set(P.x - Math.sin(P.facing) * 1.2, 0.3, P.z - Math.cos(P.facing) * 1.2);
    attackArc.rotation.y = P.facing;
    const arcBase = P.chargedAttack ? 0.7 : (P.comboStep === 3 ? 0.6 : 0.5);
    attackArcMat.opacity = pg < 0.6 ? arcBase * (1 - pg / 0.6) : 0;
    if (P.chargedAttack) attackArcMat.color.setHex(0xffaa00);
    else attackArcMat.color.setHex(0xff4400);

    // ソードトレイル更新
    if (pg > 0.15 && pg < 0.85) updateTrail();

    // ヒット判定（敵へのダメージ + Poise 削り + 慣性ノックバック）
    if (pg > 0.2 && pg < 0.65 && !enemy.hitThisSwing && enemy.hp > 0) {
      const ax = P.x - Math.sin(P.facing) * 1.5, az = P.z - Math.cos(P.facing) * 1.5;
      if (distXZ(ax, az, enemy.group.position.x, enemy.group.position.z) < 1.3) {
        enemy.hitThisSwing = true;
        enemy.hp = Math.max(0, enemy.hp - P.weaponDamage);
        enemy.hitTimer = 0.15;

        // Poise 削り
        enemy.poise -= P.weaponImpact;
        enemy.poiseRegenDelay = 2.0;

        const kx = enemy.group.position.x - P.x, kz = enemy.group.position.z - P.z;
        const kl = Math.sqrt(kx * kx + kz * kz) || 1;
        const kdx = kx / kl, kdz = kz / kl;

        const hitX = (P.x + enemy.group.position.x) / 2;
        const hitY = 1.2;
        const hitZ = (P.z + enemy.group.position.z) / 2;

        if (enemy.poise <= 0) {
          enemy.staggered = true; enemy.staggerTimer = enemy.staggerDuration;
          enemy.aiState = 'stagger';
          enemy.kbVX = kdx * P.currentKbStagger; enemy.kbVZ = kdz * P.currentKbStagger;
          enemy.shakeTimer = 0.35;
          hitStopResult = P.weaponHitStop * 2; cameraShakeResult = 0.15;
          spawnHitParticles(hitX, hitY, hitZ, 30, 5, 10);
        } else {
          enemy.shakeTimer = 0.15;
          enemy.kbVX += kdx * P.currentKb; enemy.kbVZ += kdz * P.currentKb;
          hitStopResult = P.weaponHitStop; cameraShakeResult = 0.06;
          spawnHitParticles(hitX, hitY, hitZ, 15, 3, 6);
        }
        enemy.shakeOriginX = enemy.group.position.x;
        enemy.shakeOriginZ = enemy.group.position.z;

        playHitImpact();
        spawnDamageNumber(hitX, hitY + 0.5, hitZ, P.weaponDamage, enemy.poise <= 0);
        P.attackSlowTimer = P.attackSlowDuration;
        hitFlash.position.set(hitX, hitY, hitZ);
        hitFlashMat.opacity = 1;
      }
    }

    // 攻撃終了
    if (P.attackTimer <= 0) {
      // バッファからのコンボチェーン（攻撃終了時）
      if (!P.chargedAttack && P.bufferedAttack && P.comboStep > 0 && P.comboStep < 3 && !P.isExhausted) {
        const nextStep = P.comboStep + 1;
        const ncp = COMBO_PARAMS[nextStep];
        if (P.stamina >= ncp.staminaCost) {
          P.bufferedAttack = false;
          P.comboStep = nextStep;
          P.attackDuration = ncp.duration; P.attackTimer = ncp.duration;
          P.attackLunged = false; P.comboWindowOpen = false;
          P.weaponDamage = ncp.damage; P.weaponImpact = ncp.impact; P.weaponHitStop = ncp.hitStop;
          P.currentKb = ncp.kb; P.currentKbStagger = ncp.kbStagger;
          P.stamina -= ncp.staminaCost; P.staminaDelayCurrent = P.staminaRegenDelay;
          if (P.stamina <= 0) { P.stamina = 0; P.isExhausted = true; }
          enemy.hitThisSwing = false; playSwordSwing();
        } else {
          P.attacking = false; P.attackSlowTimer = 0; P.comboStep = 0;
          P.comboWindowOpen = false; P.chargedAttack = false;
          swordGroup.rotation.z = 0; swordGroup.rotation.x = 0; swordGroup.position.z = 0; attackArcMat.opacity = 0;
          resetTrail();
        }
      } else {
        P.attacking = false; P.attackSlowTimer = 0; P.comboStep = 0;
        P.comboWindowOpen = false; P.chargedAttack = false;
        swordGroup.rotation.z = 0; swordGroup.rotation.x = 0; swordGroup.position.z = 0; attackArcMat.opacity = 0;
        resetTrail();
      }
    }
  }

  // --- 通常移動 ---
  // ─────────────────────────────────────────────────────────────────
  //  アクション中の移動制限（ソウルライク挙動）:
  //   ・攻撃中 (P.attacking): 移動不可（ルンジは内部で処理済み）
  //   ・ローリング中 (P.rolling): ロール方向のみ移動（上記ブロックで処理済み）
  //   ・エスト回復中 (P.isHealing) ★モバイルのみ: ゆっくり歩行可
  //   ・溜め攻撃中 (P.charging): 移動不可
  // ─────────────────────────────────────────────────────────────────
  if (!isPlayerBusy() && hasIn) {
    // 通常移動: スティック強度（moveSpeedMult）で歩き↔走りを滑らかに変化
    const spd = MOVE_SPEED * moveSpeedMult;
    let nx = P.x + mX * spd * dt, nz = P.z + mZ * spd * dt;
    const c = resolveCollision(nx, nz, PLAYER_RADIUS); P.x = c.x; P.z = c.z;
    P.facing = lockedOn ? Math.atan2(-(lockTgt.group.position.x - P.x), -(lockTgt.group.position.z - P.z)) : Math.atan2(-mX, -mZ);
  } else if (P.isHealing && hasIn && mobileInput.active) {
    // エスト回復中のゆっくり歩行（モバイル専用: 画面を見ながら移動できるよう）
    const healSpd = MOVE_SPEED * 0.35 * moveSpeedMult;
    let nx = P.x + mX * healSpd * dt, nz = P.z + mZ * healSpd * dt;
    const c = resolveCollision(nx, nz, PLAYER_RADIUS); P.x = c.x; P.z = c.z;
    if (!lockedOn) P.facing = Math.atan2(-mX, -mZ);
  } else if (!P.rolling && !P.attacking && lockedOn && lockTgt.hp > 0) {
    P.facing = Math.atan2(-(lockTgt.group.position.x - P.x), -(lockTgt.group.position.z - P.z));
  }

  // --- ノックバック（ローリング中は完全スキップ） ---
  if (!P.rolling && (P.knockbackVX !== 0 || P.knockbackVZ !== 0)) {
    let nx = P.x + P.knockbackVX * dt, nz = P.z + P.knockbackVZ * dt;
    const c = resolveCollision(nx, nz, PLAYER_RADIUS); P.x = c.x; P.z = c.z;
    P.knockbackVX *= Math.max(0, 1 - 8 * dt); P.knockbackVZ *= Math.max(0, 1 - 8 * dt);
    if (Math.abs(P.knockbackVX) < 0.1 && Math.abs(P.knockbackVZ) < 0.1) { P.knockbackVX = 0; P.knockbackVZ = 0; }
  }

  // --- 地形 + 重力 ---
  // --- 落下死（ディレイ付き） ---
  const terrY = getTerrainY(P.x, P.z);
  if (terrY <= -10) {
    if (!P.isFalling) { P.isFalling = true; P.fallDeathTimer = 1.5; }
    P.fallDeathTimer -= dt;
    if (P.fallDeathTimer <= 0) { P.hp = 0; P.isDead = true; youDiedEl.classList.add('active'); }
  } else {
    P.isFalling = false;
  }
  P.groundY = terrY;
  P.vy += GRAVITY * dt;
  P.y += P.vy * dt;
  if (P.y <= P.groundY) { P.y = P.groundY; P.vy = 0; }

  // --- 位置反映 ---
  const rollYOff = P._rollYOffset || 0;
  player.position.set(P.x, P.y + rollYOff, P.z);
  if (!P.rolling) {
    // 通常時: Euler で facing を反映
    player.rotation.set(0, P.facing, 0);
  }
  // ローリング中は上の if(P.rolling) ブロック内でクォータニオンが直接セット済み

  return { hitStop: hitStopResult, cameraShake: cameraShakeResult };
}

// ============================================================
//  リスポーン
// ============================================================
export function respawn(spawnX, spawnZ) {
  P.hp = P.maxHp;
  P.stamina = P.maxStamina;
  P.estusCount = P.estusMax;
  P.x = spawnX; P.z = spawnZ; P.y = 0; P.vy = 0;
  P.facing = 0;
  P.rolling = false; P.rollTimer = 0; P._rollYOffset = 0;
  P.attacking = false; P.attackTimer = 0; P.attackSlowTimer = 0;
  P.comboStep = 0; P.comboWindowOpen = false; P.chargedAttack = false;
  P.charging = false; P.chargeTimer = 0; P.chargeReady = false;
  P.isFalling = false; P.fallDeathTimer = 0;
  P.isHealing = false; P.healTimer = 0;
  P.hitFlashTimer = 0;
  P.knockbackVX = 0; P.knockbackVZ = 0;
  P.isDead = false;
  P.isExhausted = false;
  P.staminaDelayCurrent = 0;
  player.position.set(spawnX, 0, spawnZ);
  player.rotation.set(0, 0, 0);
  body.rotation.x = 0;
  swordGroup.rotation.set(0, 0, 0); swordGroup.position.z = 0;
  flaskGroup.visible = false;
  attackArcMat.opacity = 0;
  hitFlashMat.opacity = 0;
  healAuraMat.opacity = 0;
  resetTrail();
}

// ============================================================
//  プロシージャルサウンド（Web Audio API）
// ============================================================
let audioCtx = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// 剣振り音：鋸波スイープ + ノイズ（短い風切り音）
export function playSwordSwing() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  // 鋸波スイープ
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  // ハイパスで金属感
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;
  osc.connect(hp).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

// 溜め完了音：高周波の上昇チャイム
export function playChargeReadySound() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.12, now + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.2);
}

// 溜め攻撃の振り下ろし音：重い風切り + 低音衝撃
export function playChargedSwing() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  // 重い風切り
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 400;
  osc.connect(hp).connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.25);
  // 低音衝撃
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(100, now);
  osc2.frequency.exponentialRampToValueAtTime(40, now + 0.15);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.15, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(now); osc2.stop(now + 0.2);
}

// ヒット音：短い正弦波バースト + ノイズ（金属的な打撃音）
export function playHitImpact() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  // 正弦波バースト
  const osc1 = ctx.createOscillator();
  osc1.type = 'square';
  osc1.frequency.value = 800;
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.25, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc1.connect(g1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.06);
  // 高周波アクセント
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = 1200;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.15, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(now);
  osc2.stop(now + 0.04);
  // ノイズバースト
  const bufSize = ctx.sampleRate * 0.05;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const ns = ctx.createBufferSource();
  ns.buffer = buf;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.2, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  ns.connect(ng).connect(ctx.destination);
  ns.start(now);
  ns.stop(now + 0.05);
}

// ローリング風切り音：フィルタ付きノイズ
export function playRollWhoosh() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  const bufSize = ctx.sampleRate * 0.35;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource();
  ns.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.15, now + 0.05);
  g.gain.linearRampToValueAtTime(0.15, now + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  ns.connect(lp).connect(g).connect(ctx.destination);
  ns.start(now);
  ns.stop(now + 0.35);
}

// 被弾音：低い衝撃 + 歪みノイズ
export function playPlayerHitSound() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.2);
  // ノイズバースト（肉の打撃感）
  const bufSize = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
  const ns = ctx.createBufferSource(); ns.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.2, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  ns.connect(lp).connect(ng).connect(ctx.destination);
  ns.start(now); ns.stop(now + 0.08);
}

// 回復音：上昇する和音チャイム
export function playHealSound() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  [440, 554, 659].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const delay = idx * 0.08;
    g.gain.setValueAtTime(0.001, now + delay);
    g.gain.linearRampToValueAtTime(0.1, now + delay + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.4);
    osc.connect(g).connect(ctx.destination);
    osc.start(now + delay); osc.stop(now + delay + 0.4);
  });
}

// ロックオン音：短い電子音
export function playLockOnSound() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.setValueAtTime(1100, now + 0.04);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.1);
}

// ロックオン解除音：下降電子音
export function playLockOffSound() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1100, now);
  osc.frequency.setValueAtTime(660, now + 0.04);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.1);
}

// ボス部屋侵入音：低いドローン + リバーブ的な残響
export function playFogGateSound() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 1.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.2, now + 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  osc.connect(g).connect(ctx.destination);
  osc.start(now); osc.stop(now + 1.5);
  // 高域のシマー
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.value = 2000;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.001, now);
  g2.gain.linearRampToValueAtTime(0.04, now + 0.5);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(now); osc2.stop(now + 1.2);
}

// セーブ/チェックポイント音：穏やかな2音チャイム
export function playSaveSound() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  [523, 659].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const delay = idx * 0.15;
    g.gain.setValueAtTime(0.001, now + delay);
    g.gain.linearRampToValueAtTime(0.1, now + delay + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.6);
    osc.connect(g).connect(ctx.destination);
    osc.start(now + delay); osc.stop(now + delay + 0.6);
  });
}

// 勝利SE：荘厳な低音ドローン + 金属チャイム
export function playVictorySound() {
  const ctx = ensureAudioCtx();
  const now = ctx.currentTime;
  // 低音ドローン: sine 80→60Hz, 2秒
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.setValueAtTime(80, now);
  drone.frequency.exponentialRampToValueAtTime(60, now + 2.0);
  const dg = ctx.createGain();
  dg.gain.setValueAtTime(0.001, now);
  dg.gain.linearRampToValueAtTime(0.2, now + 0.3);
  dg.gain.setValueAtTime(0.2, now + 1.5);
  dg.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
  drone.connect(dg).connect(ctx.destination);
  drone.start(now); drone.stop(now + 2.5);
  // 金属チャイム: 3音和音
  [800, 1200, 1600].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const delay = 0.1 + idx * 0.15;
    g.gain.setValueAtTime(0.001, now + delay);
    g.gain.linearRampToValueAtTime(0.12, now + delay + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + 1.0);
    osc.connect(g).connect(ctx.destination);
    osc.start(now + delay); osc.stop(now + delay + 1.0);
  });
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
  // ソードトレイルのフェードアウト
  if (!P.attacking && trailFadeTimer > 0) {
    trailFadeTimer -= dt;
    trailMat.uniforms.opacity.value = Math.max(0, trailFadeTimer / 0.3);
    if (trailFadeTimer <= 0) resetTrail();
  }
  // パーティクル更新
  updateParticles(dt);
}
