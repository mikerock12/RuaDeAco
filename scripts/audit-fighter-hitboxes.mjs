// Auditoria offline de pose raster x colisão. Nunca é importada pelo jogo.
// Uso: node scripts/audit-fighter-hitboxes.mjs [--stage=before|after|both]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createServer } from 'vite';
import { decodePng, frameBounds } from './fighterRasterAnalysis.mjs';

const ROOT = process.cwd();
const OUTPUT = resolve(ROOT, 'tmp', 'hitbox-audit');
const MIN_BODY_ALPHA_OCCUPANCY = 0.05;
const stageArg = process.argv.find((argument) => argument.startsWith('--stage='))
  ?.split('=')[1] ?? 'both';
const stages = stageArg === 'both' ? ['before', 'after'] : [stageArg];
if (stages.some((stage) => stage !== 'before' && stage !== 'after')) {
  throw new Error(`Stage inválido: ${stageArg}`);
}

const vite = await createServer({
  root: ROOT,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
});

let FIGHTERS;
let getFighterSpriteAsset;
let moveAnimationFrameIndex;
let spriteSheetFrameIndex;
let buildCalibratedMoveHitboxes;
let collisionPoseKind;
let getFighterCollisionProfile;
let resolveAttachedEffectFrame;
try {
  ({ FIGHTERS } = await vite.ssrLoadModule('/src/fighters/index.ts'));
  ({ getFighterSpriteAsset } = await vite.ssrLoadModule('/src/fighters/visual/index.ts'));
  ({ moveAnimationFrameIndex, spriteSheetFrameIndex } = await vite.ssrLoadModule(
    '/src/assets/spriteSheetContract.ts',
  ));
  ({
    buildCalibratedMoveHitboxes,
    collisionPoseKind,
    getFighterCollisionProfile,
  } = await vite.ssrLoadModule('/src/fighters/collision/collisionProfiles.ts'));
  ({ resolveAttachedEffectFrame } = await vite.ssrLoadModule('/src/ui/fighterAnimationResolver.ts'));
} finally {
  await vite.close();
}

const reports = [];
const imageCache = new Map();

function cleanPath(assetPath) {
  return resolve(ROOT, 'public', assetPath.replace(/^\/?assets\//u, 'assets/'));
}

async function raster(sheet) {
  const absolute = cleanPath(sheet.path);
  let cached = imageCache.get(absolute);
  if (!cached) {
    const buffer = await readFile(absolute);
    cached = { image: decodePng(buffer), data: buffer.toString('base64') };
    imageCache.set(absolute, cached);
  }
  return cached;
}

function resolvedMoveFrame(asset, move, stateFrame) {
  const phase = asset.movePhases[move.id]
    ?.find(({ range }) => stateFrame >= range.from && stateFrame <= range.to);
  if (phase) {
    const sheet = asset.animations[phase.animation];
    const localFrame = stateFrame - phase.range.from;
    return {
      animationId: phase.animation,
      sheet,
      frame: phase.explicitFrame
        ?? spriteSheetFrameIndex(sheet, localFrame, phase.range.to - phase.range.from + 1),
    };
  }
  const animationId = move.animation;
  const sheet = asset.animations[animationId];
  return {
    animationId,
    sheet,
    frame: moveAnimationFrameIndex(move, stateFrame, sheet.frames),
  };
}

function localAlphaBounds(image, sheet, frame, transform) {
  const bounds = frameBounds(sheet, frame);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = bounds.startY; y <= bounds.endY; y += 1) {
    for (let x = bounds.startX; x <= bounds.endX; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] === 0) continue;
      const localX = transform.offset.x
        + (x - bounds.startX - transform.origin.x * sheet.frameWidth) * transform.scale;
      const localY = transform.offset.y
        + (y - bounds.startY - transform.origin.y * sheet.frameHeight) * transform.scale;
      minX = Math.min(minX, localX);
      minY = Math.min(minY, localY);
      maxX = Math.max(maxX, localX);
      maxY = Math.max(maxY, localY);
    }
  }
  return { minX, minY, maxX, maxY };
}

function alphaOccupancyByBox(image, sheet, frame, transform, boxes) {
  const bounds = frameBounds(sheet, frame);
  return boxes.map((box) => {
    let opaquePixels = 0;
    for (let y = bounds.startY; y <= bounds.endY; y += 1) {
      for (let x = bounds.startX; x <= bounds.endX; x += 1) {
        if (image.pixels[(y * image.width + x) * 4 + 3] === 0) continue;
        const localX = transform.offset.x
          + (x - bounds.startX - transform.origin.x * sheet.frameWidth) * transform.scale;
        const localY = transform.offset.y
          + (y - bounds.startY - transform.origin.y * sheet.frameHeight) * transform.scale;
        if (
          localX >= box.x
          && localX < box.x + box.width
          && localY >= box.y
          && localY < box.y + box.height
        ) opaquePixels += 1;
      }
    }
    const area = box.width * box.height;
    return { opaquePixels, area, ratio: area > 0 ? opaquePixels / area : 0 };
  });
}

function bare(box) {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function right(box) {
  return box.x + box.width;
}

function svgRect(box, transform, color, width = 2) {
  const x = transform.origin.x * transform.frameWidth
    + (box.x - transform.offset.x) / transform.scale;
  const y = transform.origin.y * transform.frameHeight
    + (box.y - transform.offset.y) / transform.scale;
  return `<rect x="${x}" y="${y}" width="${box.width / transform.scale}" height="${box.height / transform.scale}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
}

function effectSvg(effectLayer, bodyTransform) {
  if (!effectLayer) return '';
  const { effect, frame, data } = effectLayer;
  const x = bodyTransform.origin.x * bodyTransform.frameWidth
    + (effect.offset.x - effect.origin.x * effect.frameWidth * effect.scale
      - bodyTransform.offset.x) / bodyTransform.scale;
  const y = bodyTransform.origin.y * bodyTransform.frameHeight
    + (effect.offset.y - effect.origin.y * effect.frameHeight * effect.scale
      - bodyTransform.offset.y) / bodyTransform.scale;
  const width = effect.frameWidth * effect.scale / bodyTransform.scale;
  const height = effect.frameHeight * effect.scale / bodyTransform.scale;
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 ${effect.frameWidth} ${effect.frameHeight}" overflow="hidden"><image href="data:image/png;base64,${data}" x="${-frame * effect.frameWidth}" y="0" width="${effect.frameWidth * effect.frames}" height="${effect.frameHeight}"/></svg>`;
}

function overlaySvg({ sheet, frame, data, transform, effectLayer, hitboxes, hurtboxes, pushbox, label }) {
  const imageX = -frame * sheet.frameWidth;
  const imageWidth = sheet.frameWidth * sheet.frames;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.frameWidth}" height="${sheet.frameHeight}" viewBox="0 0 ${sheet.frameWidth} ${sheet.frameHeight}">
  <rect width="100%" height="100%" fill="#111827"/>
  <image href="data:image/png;base64,${data}" x="${imageX}" y="0" width="${imageWidth}" height="${sheet.frameHeight}"/>
  ${effectSvg(effectLayer, transform)}
  ${hurtboxes.map((box) => svgRect(box, transform, '#38ff80', 1)).join('\n  ')}
  ${hitboxes.map((box) => svgRect(box, transform, '#ff3b5c', 2)).join('\n  ')}
  ${svgRect(pushbox, transform, '#ffd55c', 1)}
  <rect x="2" y="2" width="${Math.min(sheet.frameWidth - 4, label.length * 6.5 + 8)}" height="18" fill="#05070b" fill-opacity=".85"/>
  <text x="6" y="15" fill="#fff" font-family="monospace" font-size="10">${label}</text>
</svg>`;
}

function legacyHurtboxes(fighter, move, stateFrame) {
  const timed = move.hurtboxes?.flatMap(({ range, boxes }) =>
    stateFrame >= range.from && stateFrame <= range.to ? boxes : []);
  if (timed?.length) return timed;
  const low = move.animation === 'crouchLight' || move.animation === 'crouchHeavy';
  return low ? fighter.crouchingHurtboxes : fighter.standingHurtboxes;
}

for (const fighter of FIGHTERS) {
  const asset = getFighterSpriteAsset(fighter.id);
  const profile = getFighterCollisionProfile(fighter.id);
  for (const move of Object.values(fighter.moves).filter(({ hitboxes }) => hitboxes.length > 0)) {
    const calibrated = buildCalibratedMoveHitboxes(fighter.id, move);
    for (let phaseIndex = 0; phaseIndex < move.hitboxes.length; phaseIndex += 1) {
      const legacyPhase = move.hitboxes[phaseIndex];
      const calibratedPhase = calibrated[phaseIndex];
      const stateFrame = legacyPhase.range.from;
      const visual = resolvedMoveFrame(asset, move, stateFrame);
      const { image, data } = await raster(visual.sheet);
      const transform = {
        origin: asset.origin,
        offset: asset.visualOffset,
        scale: asset.scale,
        frameWidth: visual.sheet.frameWidth,
        frameHeight: visual.sheet.frameHeight,
      };
      const opaque = localAlphaBounds(image, visual.sheet, visual.frame, transform);
      const attached = asset.effects.find((effect) =>
        effect.usage === 'attached'
        && effect.moveId === move.id
        && (!effect.activeRange
          || stateFrame >= effect.activeRange.from && stateFrame <= effect.activeRange.to));
      const effectRaster = attached ? await raster(attached) : null;
      const effectFrame = attached ? resolveAttachedEffectFrame(attached, stateFrame) : null;
      const effectBounds = attached && effectRaster && effectFrame !== null
        ? localAlphaBounds(effectRaster.image, attached, effectFrame, {
            origin: attached.origin,
            offset: attached.offset,
            scale: attached.scale,
          })
        : null;
      const poseKind = collisionPoseKind(move.state, 320, move);
      const afterPose = profile.poses[poseKind];
      const activeFrameOccupancy = [];
      const auditedVisualFrames = new Set();
      for (
        let auditStateFrame = legacyPhase.range.from;
        auditStateFrame <= legacyPhase.range.to;
        auditStateFrame += 1
      ) {
        const auditVisual = resolvedMoveFrame(asset, move, auditStateFrame);
        const visualKey = `${auditVisual.sheet.path}:${auditVisual.frame}`;
        if (auditedVisualFrames.has(visualKey)) continue;
        auditedVisualFrames.add(visualKey);
        const auditRaster = await raster(auditVisual.sheet);
        activeFrameOccupancy.push({
          stateFrame: auditStateFrame,
          animationId: auditVisual.animationId,
          visualFrame: auditVisual.frame,
          boxes: alphaOccupancyByBox(
            auditRaster.image,
            auditVisual.sheet,
            auditVisual.frame,
            transform,
            calibratedPhase.boxes,
          ),
        });
      }
      const item = {
        kind: 'body',
        fighterId: fighter.id,
        fighter: fighter.name,
        moveId: move.id,
        move: move.label,
        phaseIndex,
        activeRange: legacyPhase.range,
        stateFrame,
        animationId: visual.animationId,
        visualFrame: visual.frame,
        raster: basename(visual.sheet.path),
        opaqueBounds: opaque,
        attachedEffect: attached ? {
          id: attached.id,
          raster: basename(attached.path),
          visualFrame: effectFrame,
          opaqueBounds: effectBounds,
        } : null,
        visibleFront: opaque.maxX,
        oldBoxes: legacyPhase.boxes.map(bare),
        newBoxes: calibratedPhase.boxes.map(bare),
        activeFrameOccupancy,
        oldFrontGap: opaque.maxX - Math.max(...legacyPhase.boxes.map(right)),
        newFrontGap: opaque.maxX - Math.max(...calibratedPhase.boxes.map(right)),
      };
      reports.push(item);

      for (const stage of stages) {
        const hitboxes = stage === 'before' ? legacyPhase.boxes : calibratedPhase.boxes;
        const hurtboxes = stage === 'before'
          ? legacyHurtboxes(fighter, move, stateFrame)
          : afterPose.hurtboxes;
        const pushbox = stage === 'before' ? fighter.stats.pushbox : afterPose.pushbox;
        const directory = resolve(OUTPUT, stage, fighter.id);
        await mkdir(directory, { recursive: true });
        const fileName = `${move.id}-${phaseIndex}.svg`;
        await writeFile(resolve(directory, fileName), overlaySvg({
          sheet: visual.sheet,
          frame: visual.frame,
          data,
          transform,
          effectLayer: attached && effectRaster && effectFrame !== null
            ? { effect: attached, frame: effectFrame, data: effectRaster.data }
            : null,
          hitboxes,
          hurtboxes,
          pushbox,
          label: `${stage} ${move.id} p${phaseIndex} sf${stateFrame}/vf${visual.frame}`,
        }));
      }
    }
  }

  for (const projectile of Object.values(fighter.projectiles ?? {})) {
    const effect = asset.effects.find(({ usage, moveId }) =>
      usage === 'projectile'
      && (moveId === Object.values(fighter.moves).find(({ events }) =>
        events?.some((event) => event.type === 'spawnProjectile'
          && event.projectileId === projectile.id))?.id));
    if (!effect) continue;
    const visualFrame = Math.min(effect.frames - 1, effect.warningFrameCount ?? 0);
    const { image } = await raster(effect);
    const transform = {
      origin: effect.origin,
      offset: effect.offset,
      scale: effect.scale,
      frameWidth: effect.frameWidth,
      frameHeight: effect.frameHeight,
    };
    const firstActiveVisualFrame = Math.min(effect.frames - 1, effect.warningFrameCount ?? 0);
    const activeFrameOccupancy = [];
    for (let frame = firstActiveVisualFrame; frame < effect.frames; frame += 1) {
      activeFrameOccupancy.push({
        visualFrame: frame,
        boxes: alphaOccupancyByBox(
          image,
          effect,
          frame,
          transform,
          [projectile.hitbox],
        ),
      });
    }
    reports.push({
      kind: 'projectile',
      fighterId: fighter.id,
      fighter: fighter.name,
      moveId: effect.moveId,
      move: effect.moveId,
      projectileId: projectile.id,
      animationId: effect.id,
      visualFrame,
      raster: basename(effect.path),
      opaqueBounds: localAlphaBounds(image, effect, visualFrame, transform),
      oldBoxes: [bare(projectile.hitbox)],
      newBoxes: [bare(projectile.hitbox)],
      activeFrameOccupancy,
      note: 'AABB cobre o núcleo ofensivo do efeito, não o halo alpha completo.',
    });
  }
}

const poseRows = FIGHTERS.flatMap((fighter) => {
  const profile = getFighterCollisionProfile(fighter.id);
  if (!profile) return [];
  return Object.entries(profile.poses).map(([pose, value]) => ({
    fighterId: fighter.id,
    fighter: fighter.name,
    pose,
    hurtboxes: value.hurtboxes,
    pushbox: value.pushbox,
  }));
});

await mkdir(OUTPUT, { recursive: true });
await writeFile(resolve(OUTPUT, 'report.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  formula: 'local = visualOffset + (pixel - origin * frameSize) * scale',
  responseMargin: 3,
  poses: poseRows,
  entries: reports,
}, null, 2)}\n`);

const bodyRows = reports.filter(({ kind }) => kind === 'body');
const projectileRows = reports.filter(({ kind }) => kind === 'projectile');
const rectText = ({ x, y, width, height }) => `(${x}, ${y}, ${width}, ${height})`;
const alphaBoundsText = ({ minX, minY, maxX, maxY }) =>
  `(${minX}, ${minY})–(${maxX}, ${maxY})`;
const markdown = [
  '# Auditoria raster de hitboxes',
  '',
  '`local = visualOffset + (pixel - origin * frameSize) * scale`',
  '',
  '| Lutador | Golpe/fase | animação/quadro | active | frente visível | frente antiga | frente nova | lacuna antes | lacuna depois |',
  '|---|---|---|---|---:|---:|---:|---:|---:|',
  ...bodyRows.map((entry) => {
    const oldFront = Math.max(...entry.oldBoxes.map(right));
    const newFront = Math.max(...entry.newBoxes.map(right));
    return `| ${entry.fighter} | ${entry.moveId}/${entry.phaseIndex} | ${entry.animationId}/${entry.visualFrame} | ${entry.activeRange.from}–${entry.activeRange.to} | ${entry.visibleFront.toFixed(0)} | ${oldFront.toFixed(0)} | ${newFront.toFixed(0)} | ${entry.oldFrontGap.toFixed(0)} | ${entry.newFrontGap.toFixed(0)} |`;
  }),
  '',
  '## Projéteis ofensivos',
  '',
  '| Lutador | Golpe/projétil | efeito/quadro | bounds alpha | AABB ofensiva | observação |',
  '|---|---|---|---|---|---|',
  ...projectileRows.map((entry) => `| ${entry.fighter} | ${entry.moveId}/${entry.projectileId} | ${entry.animationId}/${entry.visualFrame} | ${alphaBoundsText(entry.opaqueBounds)} | ${entry.newBoxes.map(rectText).join(' + ')} | ${entry.note} |`),
  '',
  '## Hurtboxes e pushboxes por pose',
  '',
  '| Lutador | Pose | Hurtboxes (x, y, w, h, região) | Pushbox (x, y, w, h) |',
  '|---|---|---|---|',
  ...poseRows.map((entry) => `| ${entry.fighter} | ${entry.pose} | ${entry.hurtboxes.map((box) => `${rectText(box)} ${box.region}`).join(' + ')} | ${rectText(entry.pushbox)} |`),
  '',
  `Entradas corporais: ${bodyRows.length}. Projéteis: ${reports.length - bodyRows.length}.`,
  'Vermelho = hitbox; verde = hurtbox; amarelo = pushbox.',
  '',
].join('\n');
await writeFile(resolve(OUTPUT, 'report.md'), markdown);

for (const stage of stages) {
  const cards = bodyRows.map((entry) => {
    const source = `${stage}/${entry.fighterId}/${entry.moveId}-${entry.phaseIndex}.svg`;
    return `<figure><img src="${source}" alt="${entry.fighterId} ${entry.moveId} ${entry.phaseIndex}"><figcaption>${entry.fighterId}<br>${entry.moveId}/${entry.phaseIndex}</figcaption></figure>`;
  }).join('\n');
  await writeFile(resolve(OUTPUT, `${stage}-contact-sheet.html`), `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><title>Hitbox audit ${stage}</title>
<style>body{margin:16px;background:#090d16;color:#fff;font:12px monospace}.grid{display:grid;grid-template-columns:repeat(6,256px);gap:12px}figure{margin:0;background:#111827;border:1px solid #334155}img{display:block;width:256px;height:256px}figcaption{padding:5px}</style>
<h1>Rua de Aço — ${stage}</h1><p>vermelho=hitbox; verde=hurtbox; amarelo=pushbox</p><div class="grid">${cards}</div></html>`);
}

const occupancyErrors = [];
for (const entry of bodyRows) {
  for (const frame of entry.activeFrameOccupancy) {
    frame.boxes.forEach((occupancy, boxIndex) => {
      if (occupancy.ratio < MIN_BODY_ALPHA_OCCUPANCY) {
        occupancyErrors.push(
          `${entry.fighterId}/${entry.moveId} fase ${entry.phaseIndex} `
          + `quadro ${frame.visualFrame} caixa ${boxIndex}: `
          + `${(occupancy.ratio * 100).toFixed(1)}% de alpha`,
        );
      }
    });
  }
}
for (const entry of projectileRows) {
  for (const frame of entry.activeFrameOccupancy) {
    frame.boxes.forEach((occupancy, boxIndex) => {
      if (occupancy.opaquePixels === 0) {
        occupancyErrors.push(
          `${entry.fighterId}/${entry.projectileId} quadro ${frame.visualFrame} `
          + `caixa ${boxIndex}: sem interseção alpha`,
        );
      }
    });
  }
}
if (occupancyErrors.length > 0) {
  throw new Error(`Colisões sem apoio visual:\n- ${occupancyErrors.join('\n- ')}`);
}

const normalAnimations = new Set([
  'standingLight', 'standingHeavy', 'crouchLight', 'forwardLight',
  'crouchHeavy', 'forwardHeavy', 'airLightNeutral', 'airHeavyNeutral',
  'airLightForward', 'airHeavyForward', 'airLightBackward', 'airHeavyBackward',
]);
const normalCount = bodyRows.filter(({ animationId }) => normalAnimations.has(animationId)).length;
console.log(`Auditoria concluída: ${bodyRows.length} fases corporais, ${normalCount} normais, ${reports.length - bodyRows.length} projéteis.`);
console.log(`Relatórios e overlays: ${OUTPUT}`);
