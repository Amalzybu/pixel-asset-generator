'use strict';

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  });
});

// ── Shared helpers ─────────────────────────────────────────────────────────
function setRunning(prefix, running) {
  const runBtn  = document.getElementById(`${prefix}-run`);
  const stopBtn = document.getElementById(`${prefix}-stop`);
  const dot     = document.getElementById('status-dot');
  const statusTxt = document.getElementById('status-text');

  if (running) {
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span> Running…';
    stopBtn.disabled = false;
    dot.className = 'running';
    statusTxt.textContent = 'Running…';
  } else {
    runBtn.disabled = false;
    runBtn.innerHTML = '<span class="btn-label">▶ Run</span>';
    stopBtn.disabled = true;
    dot.className = '';
    statusTxt.textContent = 'Ready';
  }
}

function appendLog(logEl, text, type = 'stdout') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

async function showGallery(galleryEl, countEl, dir, since) {
  const files = await window.api.listOutputFiles({ dir, since });
  countEl.textContent = files.length;

  if (!files.length) return;

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';

  for (const file of files) {
    const dataUrl = await window.api.readFileBase64(file.path);
    if (!dataUrl) continue;

    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.title = file.relPath;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = file.name;

    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = file.name;

    item.appendChild(img);
    item.appendChild(nameEl);

    item.addEventListener('click', () => openLightbox(dataUrl, file.name));
    item.addEventListener('dblclick', () => window.api.openPath(file.path));

    grid.appendChild(item);
  }

  galleryEl.innerHTML = '';
  galleryEl.appendChild(grid);
}

// ── Lightbox ───────────────────────────────────────────────────────────────
const lightbox     = document.getElementById('lightbox');
const lightboxImg  = document.getElementById('lightbox-img');
const lightboxName = document.getElementById('lightbox-name');

function openLightbox(src, name) {
  lightboxImg.src = src;
  lightboxName.textContent = name;
  lightbox.classList.add('open');
}

document.getElementById('lightbox-close').addEventListener('click', () => lightbox.classList.remove('open'));
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.classList.remove('open'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lightbox.classList.remove('open'); });

// ══════════════════════════════════════════════════════════════════════════
// PHOTO → PIXEL
// ══════════════════════════════════════════════════════════════════════════
let photoImagePath = null;

const photoDrop    = document.getElementById('photo-drop');
const photoPathEl  = document.getElementById('photo-path');
const photoLog     = document.getElementById('photo-log');
const photoGallery = document.getElementById('photo-gallery');
const photoCount   = document.getElementById('photo-count');

async function photoPickImage() {
  const p = await window.api.pickFile({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (!p) return;
  photoImagePath = p;
  photoPathEl.textContent = p;

  const dataUrl = await window.api.readFileBase64(p);
  photoDrop.innerHTML = '';
  if (dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    photoDrop.appendChild(img);
  }
}

photoDrop.addEventListener('click', photoPickImage);

document.getElementById('photo-pick-output').addEventListener('click', async () => {
  const d = await window.api.pickDir();
  if (d) document.getElementById('photo-output').value = d;
});

document.getElementById('photo-clear-log').addEventListener('click', () => { photoLog.innerHTML = ''; });

document.getElementById('photo-open-folder').addEventListener('click', async () => {
  const appPath = await window.api.getAppPath();
  const outDir = document.getElementById('photo-output').value || 'output';
  const resolved = outDir.startsWith('.') ? `${appPath}/${outDir.replace(/^\.\//, '')}` : outDir;
  await window.api.openPath(resolved);
});

document.getElementById('photo-refresh').addEventListener('click', async () => {
  const outDir = document.getElementById('photo-output').value || 'output';
  await showGallery(photoGallery, photoCount, outDir, null);
});

document.getElementById('photo-stop').addEventListener('click', async () => {
  await window.api.killCommand();
});

document.getElementById('photo-run').addEventListener('click', async () => {
  if (!photoImagePath) {
    appendLog(photoLog, '⚠ Please select an input image first.', 'error');
    return;
  }

  photoLog.innerHTML = '';
  const runStart = Date.now();

  const args = [
    '--type', 'photo',
    '--image', photoImagePath,
    '--style', document.getElementById('photo-style').value,
    '--pixelDensity', document.getElementById('photo-pixelDensity').value,
    '--palette', document.getElementById('photo-palette').value,
    '--maxColors', document.getElementById('photo-maxColors').value,
    '--contrast', document.getElementById('photo-contrast').value,
    '--saturation', document.getElementById('photo-saturation').value,
    '--posterize', document.getElementById('photo-posterize').value,
    '--edges', document.getElementById('photo-edges').checked ? 'true' : 'false',
    '--outlines', document.getElementById('photo-outlines').checked ? 'true' : 'false',
    '--outlineThickness', document.getElementById('photo-outlineThickness').value,
    '--edgeThreshold', document.getElementById('photo-edgeThreshold').value,
    '--preBlur', document.getElementById('photo-preBlur').value,
    '--upscale', document.getElementById('photo-upscale').value,
    '--output', document.getElementById('photo-output').value || 'output',
  ];

  // If "Custom Preset" is selected and a preset path is set, add --preset
  if (document.getElementById('photo-style').value === 'custom' && photoPresetPath) {
    args.push('--preset', photoPresetPath);
  }

  setRunning('photo', true);
  window.api.removeCommandListeners();

  window.api.onCommandOutput((data) => {
    appendLog(photoLog, data.text.trimEnd(), data.type);
  });

  window.api.onCommandDone(async (data) => {
    setRunning('photo', false);
    window.api.removeCommandListeners();

    if (data.code === 0) {
      appendLog(photoLog, `\n✓ Done! Scanning output…`, 'success');
      const outDir = document.getElementById('photo-output').value || 'output';
      await showGallery(photoGallery, photoCount, outDir, runStart);
    } else {
      appendLog(photoLog, `\n✗ Process exited with code ${data.code}`, 'error');
    }
  });

  await window.api.runCommand({ script: 'src/cli.js', args });
});

// ══════════════════════════════════════════════════════════════════════════
// WALK GENERATOR
// ══════════════════════════════════════════════════════════════════════════
let walkImagePath = null;

const walkDrop    = document.getElementById('walk-drop');
const walkPathEl  = document.getElementById('walk-path');
const walkLog     = document.getElementById('walk-log');
const walkGallery = document.getElementById('walk-gallery');
const walkCount   = document.getElementById('walk-count');

async function walkPickImage() {
  const p = await window.api.pickFile({
    filters: [{ name: 'PNG Images', extensions: ['png'] }],
  });
  if (!p) return;
  walkImagePath = p;
  walkPathEl.textContent = p;

  const dataUrl = await window.api.readFileBase64(p);
  walkDrop.innerHTML = '';
  if (dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    walkDrop.appendChild(img);
  }
}

walkDrop.addEventListener('click', walkPickImage);

document.getElementById('walk-pick-output').addEventListener('click', async () => {
  const d = await window.api.pickDir();
  if (d) document.getElementById('walk-output').value = d;
});

document.getElementById('walk-clear-log').addEventListener('click', () => { walkLog.innerHTML = ''; });

document.getElementById('walk-open-folder').addEventListener('click', async () => {
  const appPath = await window.api.getAppPath();
  const outDir = document.getElementById('walk-output').value || 'output';
  const resolved = outDir.startsWith('.') ? `${appPath}/${outDir.replace(/^\.\//, '')}` : outDir;
  await window.api.openPath(resolved);
});

document.getElementById('walk-refresh').addEventListener('click', async () => {
  const outDir = document.getElementById('walk-output').value || 'output';
  await showGallery(walkGallery, walkCount, outDir, null);
});

document.getElementById('walk-stop').addEventListener('click', async () => {
  await window.api.killCommand();
});

document.getElementById('walk-run').addEventListener('click', async () => {
  if (!walkImagePath) {
    appendLog(walkLog, '⚠ Please select an input sprite PNG first.', 'error');
    return;
  }

  walkLog.innerHTML = '';
  const runStart = Date.now();

  const args = [
    walkImagePath,
    '--frames', document.getElementById('walk-frames').value,
    '--scale',  document.getElementById('walk-scale').value,
    '--stride', document.getElementById('walk-stride').value,
    '--output', document.getElementById('walk-output').value || 'output',
  ];

  if (document.getElementById('walk-debug').checked) {
    args.push('--debug');
  }
  if (document.getElementById('walk-aseprite').checked) {
    args.push('--aseprite');
  }

  setRunning('walk', true);
  window.api.removeCommandListeners();

  window.api.onCommandOutput((data) => {
    appendLog(walkLog, data.text.trimEnd(), data.type);
  });

  window.api.onCommandDone(async (data) => {
    setRunning('walk', false);
    window.api.removeCommandListeners();

    if (data.code === 0) {
      appendLog(walkLog, `\n✓ Done! Scanning output…`, 'success');
      const outDir = document.getElementById('walk-output').value || 'output';
      await showGallery(walkGallery, walkCount, outDir, runStart);
    } else {
      appendLog(walkLog, `\n✗ Process exited with code ${data.code}`, 'error');
    }
  });

  await window.api.runCommand({ script: 'generate_walk_v3.js', args });
});

// ══════════════════════════════════════════════════════════════════════════
// JUMP GENERATOR
// ══════════════════════════════════════════════════════════════════════════
let jumpImagePath = null;

const jumpDrop    = document.getElementById('jump-drop');
const jumpPathEl  = document.getElementById('jump-path');
const jumpLog     = document.getElementById('jump-log');
const jumpGallery = document.getElementById('jump-gallery');
const jumpCount   = document.getElementById('jump-count');

async function jumpPickImage() {
  const p = await window.api.pickFile({
    filters: [{ name: 'PNG Images', extensions: ['png'] }],
  });
  if (!p) return;
  jumpImagePath = p;
  jumpPathEl.textContent = p;

  const dataUrl = await window.api.readFileBase64(p);
  jumpDrop.innerHTML = '';
  if (dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    jumpDrop.appendChild(img);
  }
}

jumpDrop.addEventListener('click', jumpPickImage);

document.getElementById('jump-pick-output').addEventListener('click', async () => {
  const d = await window.api.pickDir();
  if (d) document.getElementById('jump-output').value = d;
});

document.getElementById('jump-clear-log').addEventListener('click', () => { jumpLog.innerHTML = ''; });

document.getElementById('jump-open-folder').addEventListener('click', async () => {
  const appPath = await window.api.getAppPath();
  const outDir = document.getElementById('jump-output').value || 'output';
  const resolved = outDir.startsWith('.') ? `${appPath}/${outDir.replace(/^\.\//,  '')}` : outDir;
  await window.api.openPath(resolved);
});

document.getElementById('jump-refresh').addEventListener('click', async () => {
  const outDir = document.getElementById('jump-output').value || 'output';
  await showGallery(jumpGallery, jumpCount, outDir, null);
});

document.getElementById('jump-stop').addEventListener('click', async () => {
  await window.api.killCommand();
});

document.getElementById('jump-run').addEventListener('click', async () => {
  if (!jumpImagePath) {
    appendLog(jumpLog, '⚠ Please select an input sprite PNG first.', 'error');
    return;
  }

  jumpLog.innerHTML = '';
  const runStart = Date.now();

  const args = [
    jumpImagePath,
    '--frames', document.getElementById('jump-frames').value,
    '--scale',  document.getElementById('jump-scale').value,
    '--power',  document.getElementById('jump-power').value,
    '--output', document.getElementById('jump-output').value || 'output',
  ];

  if (document.getElementById('jump-debug').checked) {
    args.push('--debug');
  }
  if (document.getElementById('jump-aseprite').checked) {
    args.push('--aseprite');
  }

  setRunning('jump', true);
  window.api.removeCommandListeners();

  window.api.onCommandOutput((data) => {
    appendLog(jumpLog, data.text.trimEnd(), data.type);
  });

  window.api.onCommandDone(async (data) => {
    setRunning('jump', false);
    window.api.removeCommandListeners();

    if (data.code === 0) {
      appendLog(jumpLog, `\n✓ Done! Scanning output…`, 'success');
      const outDir = document.getElementById('jump-output').value || 'output';
      await showGallery(jumpGallery, jumpCount, outDir, runStart);
    } else {
      appendLog(jumpLog, `\n✗ Process exited with code ${data.code}`, 'error');
    }
  });

  await window.api.runCommand({ script: 'generate_jump_sprite.js', args });
});

// ══════════════════════════════════════════════════════════════════════════
// PHOTO TAB — Custom Preset picker
// ══════════════════════════════════════════════════════════════════════════
const photoStyleSelect = document.getElementById('photo-style');
const presetRow = document.getElementById('photo-preset-row');
let photoPresetPath = null;

photoStyleSelect.addEventListener('change', () => {
  presetRow.style.display = photoStyleSelect.value === 'custom' ? '' : 'none';
});

async function applyPresetToUI(presetPath) {
  photoPresetPath = presetPath;
  document.getElementById('photo-preset-path').value = presetPath;
  // Populate outlineThickness field from preset so user can see and override it
  const data = await window.api.readPreset(presetPath);
  if (data && data.preset) {
    const t = data.preset.outlineThickness;
    if (t != null) document.getElementById('photo-outlineThickness').value = t;
  }
}

document.getElementById('photo-pick-preset').addEventListener('click', async () => {
  const p = await window.api.pickFile({
    filters: [{ name: 'Preset Files', extensions: ['json'] }],
  });
  if (!p) return;
  await applyPresetToUI(p);
});

// ══════════════════════════════════════════════════════════════════════════
// STYLE ANALYZER
// ══════════════════════════════════════════════════════════════════════════
let styleImagePaths = [];

const styleLog     = document.getElementById('style-log');
const stylePresets = document.getElementById('style-presets');
const styleCount   = document.getElementById('style-count');
const styleImgList = document.getElementById('style-image-list');

document.getElementById('style-pick-images').addEventListener('click', async () => {
  const files = await window.api.pickFiles({
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  if (!files || files.length === 0) return;
  styleImagePaths = files;
  styleImgList.innerHTML = files.map((f, i) => `<div>${i + 1}. ${f.split(/[\\/]/).pop()}</div>`).join('');
});

document.getElementById('style-pick-output').addEventListener('click', async () => {
  const d = await window.api.pickDir();
  if (d) document.getElementById('style-output').value = d;
});

document.getElementById('style-clear-log').addEventListener('click', () => { styleLog.innerHTML = ''; });

document.getElementById('style-open-folder').addEventListener('click', async () => {
  const appPath = await window.api.getAppPath();
  const outDir = document.getElementById('style-output').value || 'output';
  const resolved = outDir.startsWith('.') ? `${appPath}/${outDir.replace(/^\.\//, '')}` : outDir;
  await window.api.openPath(resolved);
});

document.getElementById('style-stop').addEventListener('click', async () => {
  await window.api.killCommand();
});

document.getElementById('style-run').addEventListener('click', async () => {
  if (styleImagePaths.length === 0) {
    appendLog(styleLog, '⚠ Please select reference images first.', 'error');
    return;
  }

  styleLog.innerHTML = '';

  const name = document.getElementById('style-name').value || 'my_style';
  const pixelDensity = document.getElementById('style-pixelDensity').value || '64';
  const outDir = document.getElementById('style-output').value || 'output';

  const args = [
    '--type', 'analyze',
    '--images', styleImagePaths.join(','),
    '--name', name,
    '--pixelDensity', pixelDensity,
    '--output', outDir,
  ];

  setRunning('style', true);
  window.api.removeCommandListeners();

  window.api.onCommandOutput((data) => {
    appendLog(styleLog, data.text.trimEnd(), data.type);
  });

  window.api.onCommandDone(async (data) => {
    setRunning('style', false);
    window.api.removeCommandListeners();

    if (data.code === 0) {
      appendLog(styleLog, `\n✓ Preset saved! You can now use it in the Photo → Pixel tab.`, 'success');
      await refreshPresetList();
    } else {
      appendLog(styleLog, `\n✗ Process exited with code ${data.code}`, 'error');
    }
  });

  await window.api.runCommand({ script: 'src/cli.js', args });
});

async function refreshPresetList() {
  const appPath = await window.api.getAppPath();
  const outDir = document.getElementById('style-output').value || 'output';
  const files = await window.api.listOutputFiles({ dir: outDir, since: null });
  const presets = files.filter(f => f.name.endsWith('.preset.json'));
  styleCount.textContent = presets.length;

  if (presets.length === 0) return;

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';

  for (const preset of presets) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.title = preset.relPath;
    item.style.cursor = 'pointer';

    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = preset.name.replace('.preset.json', '');
    nameEl.style.padding = '12px 6px';
    nameEl.style.textAlign = 'center';

    const icon = document.createElement('div');
    icon.textContent = '🎨';
    icon.style.fontSize = '32px';
    icon.style.textAlign = 'center';
    icon.style.padding = '12px 0 4px';

    item.appendChild(icon);
    item.appendChild(nameEl);

    item.addEventListener('click', async () => {
      // Auto-select in Photo tab and populate outline thickness from preset
      await applyPresetToUI(preset.path);
      photoStyleSelect.value = 'custom';
      presetRow.style.display = '';
      appendLog(styleLog, `Selected "${preset.name}" — switch to Photo → Pixel tab to use it.`, 'stdout');
    });

    grid.appendChild(item);
  }

  stylePresets.innerHTML = '';
  stylePresets.appendChild(grid);
}

