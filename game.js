(function () {
  'use strict';

  // ── Canvases ──
  const gameCanvas = document.getElementById('gameCanvas');
  const gameCtx = gameCanvas.getContext('2d');
  const particleCanvas = document.getElementById('particleCanvas');
  const particleCtx = particleCanvas.getContext('2d');

  // ── DOM refs ──
  const scoreCountEl = document.getElementById('score-count');
  const bestCountEl = document.getElementById('score-best-count');
  const themeLabelEl = document.getElementById('theme-label');
  const themeSelectorEl = document.getElementById('theme-selector');
  const themeDropdownEl = document.getElementById('theme-dropdown');
  const themeOptions = document.querySelectorAll('.theme-option');

  // ── Theme config ──
  const THEMES = {
    sea: {
      label: '🐚 Sea',
      bg: 'assets/Sea_Theme.png',
      bubble: 'assets/Seashell_Bubble.png',
    },
    nightsky: {
      label: '⭐ Night Sky',
      bg: 'assets/Nightsky_Theme.png',
      bubble: 'assets/Star_Bubble.png',
    },
    jungle: {
      label: '🐻 Jungle',
      bg: 'assets/Jungle_Theme.png',
      bubble: 'assets/Bear_Bubble.png',
    },
  };

  // ── State ──
  let currentTheme = 'sea';
  let score = 0;
  let highScore = parseInt(localStorage.getItem('bubblePop_highScore') || '0', 10);
  let bubbles = [];
  let particles = [];
  let dropdownOpen = false;

  // ── Difficulty ──
  const BASE_SPAWN_INTERVAL = 800;   // ms
  const MIN_SPAWN_INTERVAL = 250;    // ms floor
  const BASE_SPEED = 1.5;            // px per frame (at 60fps)
  const DIFFICULTY_STEP = 10;        // every N pops
  const DIFFICULTY_FACTOR = 0.05;    // 5% per step
  let spawnInterval = BASE_SPAWN_INTERVAL;
  let speedMultiplier = 1;
  let lastSpawnTime = 0;

  // ── Bubble sizing ──
  const BUBBLE_BASE_SIZE = 60;       // px (will be scaled on mobile)
  const BUBBLE_SIZE_VARIANCE = 0.25; // ±25%

  // ── Images ──
  const images = {};
  let imagesLoaded = 0;
  let totalImages = 0;

  // ── Pop sound (synthesised — tiny base64 WAV) ──
  // We generate a short pop programmatically using Howler + Web Audio
  let popSound = null;

  function initSound() {
    // Create a short "pop" sound using an oscillator-based approach via Howler sprite
    // We'll create a tiny AudioContext-generated pop and convert to blob
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const sampleRate = audioCtx.sampleRate;
      const duration = 0.08;
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * 60);
        // Mix of frequencies for a bubbly pop
        data[i] = envelope * (
          0.5 * Math.sin(2 * Math.PI * 400 * t) +
          0.3 * Math.sin(2 * Math.PI * 800 * t) +
          0.2 * Math.random()
        );
      }

      // Convert to WAV blob
      const wavBlob = audioBufferToWav(buffer);
      const url = URL.createObjectURL(wavBlob);

      popSound = new Howl({
        src: [url],
        format: ['wav'],
        volume: 0.4,
        pool: 10,
      });

      audioCtx.close();
    } catch (e) {
      console.warn('Could not init pop sound:', e);
    }
  }

  // Minimal WAV encoder
  function audioBufferToWav(buffer) {
    const numChannels = 1;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;
    const data = buffer.getChannelData(0);
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = data.length * numChannels * bitsPerSample / 8;
    const bufferSize = 44 + dataSize;
    const view = new DataView(new ArrayBuffer(bufferSize));

    function writeString(offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([view.buffer], { type: 'audio/wav' });
  }

  // ── Image loading ──
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        console.warn('Failed to load:', src);
        resolve(null);
      };
      img.src = src;
    });
  }

  async function loadAllImages() {
    const entries = [];
    for (const [key, theme] of Object.entries(THEMES)) {
      entries.push({ key: `bg_${key}`, src: theme.bg });
      entries.push({ key: `bubble_${key}`, src: theme.bubble });
    }
    totalImages = entries.length;

    const promises = entries.map(async ({ key, src }) => {
      const img = await loadImage(src);
      images[key] = img;
      imagesLoaded++;
    });

    await Promise.all(promises);
  }

  // ── Canvas resize ──
  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    for (const cvs of [gameCanvas, particleCanvas]) {
      cvs.width = w * dpr;
      cvs.height = h * dpr;
      cvs.style.width = w + 'px';
      cvs.style.height = h + 'px';
    }

    gameCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Bubble class ──
  function createBubble() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sizeScale = Math.min(w, h) / 500; // responsive scaling
    const variance = 1 + (Math.random() * BUBBLE_SIZE_VARIANCE * 2 - BUBBLE_SIZE_VARIANCE);
    const size = BUBBLE_BASE_SIZE * sizeScale * variance;

    return {
      x: Math.random() * (w - size) + size / 2,
      y: h + size, // start below screen
      size: size,
      speed: (BASE_SPEED + Math.random() * 0.8) * speedMultiplier * sizeScale,
      wobbleOffset: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.02,
      wobbleAmount: 15 + Math.random() * 10,
      opacity: 1,
      popping: false,
      popProgress: 0,
      rotation: Math.random() * 0.3 - 0.15, // slight tilt
    };
  }

  // ── Particles ──
  function spawnParticles(x, y, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        size: 2 + Math.random() * 4,
        color: `hsl(${Math.random() * 60 + 180}, 80%, 70%)`,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    particleCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      particleCtx.globalAlpha = p.life;
      particleCtx.fillStyle = p.color;
      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      particleCtx.fill();
    }
    particleCtx.globalAlpha = 1;
  }

  // ── Difficulty scaling ──
  function updateDifficulty() {
    const steps = Math.floor(score / DIFFICULTY_STEP);
    speedMultiplier = 1 + steps * DIFFICULTY_FACTOR;
    spawnInterval = Math.max(
      MIN_SPAWN_INTERVAL,
      BASE_SPAWN_INTERVAL * Math.pow(1 - DIFFICULTY_FACTOR, steps)
    );
  }

  // ── Score ──
  function addScore() {
    score++;
    scoreCountEl.textContent = score;
    if (score > highScore) {
      highScore = score;
      bestCountEl.textContent = highScore;
      localStorage.setItem('bubblePop_highScore', highScore.toString());
    }
    updateDifficulty();
  }

  function initScore() {
    scoreCountEl.textContent = score;
    bestCountEl.textContent = highScore;
  }

  // ── Drawing ──
  function drawBackground() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bgImg = images[`bg_${currentTheme}`];

    if (bgImg) {
      // Cover the canvas while maintaining aspect ratio
      const imgRatio = bgImg.width / bgImg.height;
      const canvasRatio = w / h;
      let drawW, drawH, drawX, drawY;

      if (canvasRatio > imgRatio) {
        drawW = w;
        drawH = w / imgRatio;
        drawX = 0;
        drawY = (h - drawH) / 2;
      } else {
        drawH = h;
        drawW = h * imgRatio;
        drawX = (w - drawW) / 2;
        drawY = 0;
      }

      gameCtx.drawImage(bgImg, drawX, drawY, drawW, drawH);
    } else {
      // Fallback solid color
      const fallbacks = { sea: '#1a6b8a', nightsky: '#0a1628', jungle: '#2d5a27' };
      gameCtx.fillStyle = fallbacks[currentTheme] || '#0a1628';
      gameCtx.fillRect(0, 0, w, h);
    }
  }

  function drawBubbles() {
    const bubbleImg = images[`bubble_${currentTheme}`];

    for (const b of bubbles) {
      gameCtx.save();
      gameCtx.globalAlpha = b.opacity;
      gameCtx.translate(b.x, b.y);
      gameCtx.rotate(b.rotation);

      const drawSize = b.size * (b.popping ? (1 - b.popProgress * 0.3) : 1);

      if (bubbleImg) {
        gameCtx.drawImage(
          bubbleImg,
          -drawSize / 2,
          -drawSize / 2,
          drawSize,
          drawSize
        );
      } else {
        // Fallback: draw a circle
        gameCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        gameCtx.beginPath();
        gameCtx.arc(0, 0, drawSize / 2, 0, Math.PI * 2);
        gameCtx.fill();
        gameCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        gameCtx.lineWidth = 2;
        gameCtx.stroke();
      }

      gameCtx.restore();
    }
  }

  // ── Update ──
  function updateBubbles(timestamp) {
    // Spawn new bubbles
    if (timestamp - lastSpawnTime > spawnInterval) {
      bubbles.push(createBubble());
      lastSpawnTime = timestamp;
    }

    // Move & cull
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];

      if (b.popping) {
        b.popProgress += 0.08;
        b.opacity = 1 - b.popProgress;
        if (b.popProgress >= 1) {
          bubbles.splice(i, 1);
        }
        continue;
      }

      // Float upward
      b.y -= b.speed;

      // Wobble sideways
      b.wobbleOffset += b.wobbleSpeed;
      b.x += Math.sin(b.wobbleOffset) * 0.5;

      // Remove if off-screen top
      if (b.y < -b.size) {
        bubbles.splice(i, 1);
      }
    }
  }

  // ── Hit test ──
  function tryPop(px, py) {
    // Check from front to back (last drawn = on top)
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (b.popping) continue;

      const dx = px - b.x;
      const dy = py - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < b.size / 2) {
        // Pop it!
        b.popping = true;
        b.popProgress = 0;
        addScore();
        spawnParticles(b.x, b.y, 8);

        if (popSound) {
          popSound.play();
        }

        return true;
      }
    }
    return false;
  }

  // ── Input handling ──
  function getCanvasPos(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function onPointerDown(e) {
    // Don't pop bubbles if clicking on UI
    if (e.target.closest && e.target.closest('#ui-overlay')) return;

    const pos = getCanvasPos(e);
    tryPop(pos.x, pos.y);
  }

  // ── Theme switching ──
  function setTheme(themeKey) {
    if (!THEMES[themeKey]) return;
    currentTheme = themeKey;
    themeLabelEl.textContent = THEMES[themeKey].label;

    // Update active state in dropdown
    themeOptions.forEach((opt) => {
      opt.classList.toggle('active', opt.dataset.theme === themeKey);
    });

    closeDropdown();
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
    themeDropdownEl.classList.toggle('hidden', !dropdownOpen);
    themeSelectorEl.classList.toggle('open', dropdownOpen);
  }

  function closeDropdown() {
    dropdownOpen = false;
    themeDropdownEl.classList.add('hidden');
    themeSelectorEl.classList.remove('open');
  }

  // ── Game loop ──
  function gameLoop(timestamp) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Clear
    gameCtx.clearRect(0, 0, w, h);

    // Draw
    drawBackground();
    updateBubbles(timestamp);
    drawBubbles();
    updateParticles();
    drawParticles();

    requestAnimationFrame(gameLoop);
  }

  // ── Init ──
  async function init() {
    resizeCanvases();
    initScore();
    initSound();

    // Load images
    await loadAllImages();

    // Set default theme active
    setTheme('sea');

    // Events
    window.addEventListener('resize', resizeCanvases);

    // Pointer / touch for popping
    gameCanvas.addEventListener('mousedown', onPointerDown);
    gameCanvas.addEventListener('touchstart', onPointerDown, { passive: true });

    // Theme dropdown
    themeSelectorEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    themeOptions.forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        setTheme(opt.dataset.theme);
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      if (dropdownOpen) closeDropdown();
    });

    // Keyboard support for dropdown
    themeSelectorEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDropdown();
      }
    });

    // Start game loop
    requestAnimationFrame(gameLoop);
  }

  // Kick off
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
