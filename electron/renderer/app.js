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
    '--edgeThreshold', document.getElementById('photo-edgeThreshold').value,
    '--preBlur', document.getElementById('photo-preBlur').value,
    '--upscale', document.getElementById('photo-upscale').value,
    '--output', document.getElementById('photo-output').value || 'output',
  ];

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
