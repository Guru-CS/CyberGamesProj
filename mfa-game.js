(function () {
  "use strict";

  const WIDTH = 960;
  const HEIGHT = 480;
  const WORLD_WIDTH = 2100;
  const VAULT_X = 1980;
  const GRAVITY = 0.62;
  const JUMP_SPEED = -12.4;
  const MOVE_SPEED = 4.1;

  function mount(root) {
    if (!root || root.dataset.layerUpMounted === "true") return;
    root.dataset.layerUpMounted = "true";
    root.classList.add("layer-up-game");
    root.tabIndex = -1;
    root.innerHTML = `
      <section class="lu-game-frame" aria-label="Layer Up platform game">
        <div class="lu-game-bar">
          <div class="lu-security-status">
            <span class="lu-vault-status" data-vault-status>MFA setup 0/3 · vault exposed</span>
            <progress class="lu-progress" data-mfa-progress max="3" value="0" aria-label="MFA setup progress"></progress>
          </div>
          <button class="lu-reset" type="button" data-reset>Reset level</button>
        </div>
        <div class="lu-canvas-wrap">
          <canvas class="lu-canvas" width="960" height="480" tabindex="0" role="img" aria-label="Platform game. Use arrow keys or A and D to move, and Space or Up to jump. Collect the three MFA setup signals and reach the crypto vault."></canvas>
        </div>
        <div class="lu-lower-panel">
          <div class="lu-objective">
            <h2>Mission</h2>
            <p data-message aria-live="polite">Secure the account: enable MFA, add a second factor, then save recovery codes.</p>
            <ul class="lu-collectibles" aria-label="MFA setup signals">
              <li data-token-label="0"><span class="lu-step-index">01</span><span>Enable MFA</span></li>
              <li data-token-label="1"><span class="lu-step-index">02</span><span>Add a second factor</span></li>
              <li data-token-label="2"><span class="lu-step-index">03</span><span>Store recovery codes</span></li>
            </ul>
            <section class="lu-quiz" data-quiz aria-labelledby="lu-quiz-title" hidden>
              <h3 id="lu-quiz-title">Quick MFA check</h3>
              <p class="lu-quiz-question">Why does MFA help protect an account?</p>
              <div class="lu-quiz-options">
                <button type="button" data-quiz-answer="correct">It requires another verification step beyond the password.</button>
                <button type="button" data-quiz-answer="wrong">It makes your password impossible to steal.</button>
              </div>
              <p class="lu-quiz-feedback" data-quiz-feedback aria-live="polite"></p>
            </section>
          </div>
          <div class="lu-action-side">
            <button class="lu-run-button" type="button" data-run>Start run</button>
          </div>
        </div>
        <div class="lu-touch-controls" aria-label="Touch game controls">
          <button type="button" data-control="left" aria-label="Move left">← LEFT</button>
          <button type="button" data-control="right" aria-label="Move right">RIGHT →</button>
          <button type="button" data-control="jump" aria-label="Jump">JUMP ↑</button>
        </div>
      </section>
      <p class="lu-visually-hidden" data-sr-status aria-live="polite"></p>
    `;

    const canvas = root.querySelector(".lu-canvas");
    const ctx = canvas.getContext("2d");
    const message = root.querySelector("[data-message]");
    const srStatus = root.querySelector("[data-sr-status]");
    const runButton = root.querySelector("[data-run]");
    const vaultStatus = root.querySelector("[data-vault-status]");
    const mfaProgress = root.querySelector("[data-mfa-progress]");
    const quiz = root.querySelector("[data-quiz]");
    const quizFeedback = root.querySelector("[data-quiz-feedback]");
    const tokenLabels = [...root.querySelectorAll("[data-token-label]")];
    const keys = new Set();
    const sprites = {
      idle: { image: new Image(), frames: 4, duration: 180 },
      walk: { image: new Image(), frames: 6, duration: 95 },
      jump: { image: new Image(), frames: 4, duration: 130 }
    };
    sprites.idle.image.src = "Idle1.png";
    sprites.walk.image.src = "Walk1.png";
    sprites.jump.image.src = "Jump1.png";
    const platforms = [
      { x: 0, y: 440, w: 300, h: 60 },
      { x: 410, y: 440, w: 130, h: 60 },
      { x: 670, y: 440, w: 130, h: 60 },
      { x: 930, y: 440, w: 130, h: 60 },
      { x: 1190, y: 440, w: 130, h: 60 },
      { x: 1450, y: 440, w: 130, h: 60 },
      { x: 1710, y: 440, w: 390, h: 60 },
      { x: 180, y: 365, w: 120, h: 18 },
      { x: 410, y: 315, w: 110, h: 18 },
      { x: 640, y: 265, w: 110, h: 18 },
      { x: 870, y: 315, w: 110, h: 18 },
      { x: 1100, y: 265, w: 110, h: 18 },
      { x: 1330, y: 215, w: 110, h: 18 },
      { x: 1550, y: 265, w: 110, h: 18 },
      { x: 1760, y: 315, w: 120, h: 18 },
      { x: 1940, y: 355, w: 110, h: 18 }
    ];
    const hazards = [
      { x: 570, y: 420, w: 58, h: 20 },
      { x: 1095, y: 420, w: 58, h: 20 },
      { x: 1615, y: 420, w: 58, h: 20 }
    ];
    const signals = [
      { x: 282, y: 326, label: "MFA ON" },
      { x: 1110, y: 227, label: "SECOND FACTOR" },
      { x: 445, y: 276, label: "RECOVERY CODES" }
    ];
    const checkpoints = [
      { x: 220, y: 321 },
      { x: 1120, y: 221 },
      { x: 450, y: 271 }
    ];
    const player = { x: 54, y: 396, w: 28, h: 44, vx: 0, vy: 0, grounded: true, facing: 1 };
    let collected = [false, false, false];
    let checkpointX = 54;
    let checkpointY = 396;
    let cameraX = 0;
    let phase = "ready";
    let animationId = 0;
    let previousTime = 0;
    let lastVaultMessage = 0;

    function setMessage(text, announce) {
      message.textContent = text;
      if (announce) srStatus.textContent = text;
    }

    function updateProgress() {
      tokenLabels.forEach((label, index) => {
        label.classList.toggle("is-collected", collected[index]);
      });
      const count = collected.filter(Boolean).length;
      mfaProgress.value = count;
      vaultStatus.textContent = count === signals.length ? "MFA active · vault secured" : `MFA setup ${count}/${signals.length} · vault exposed`;
      vaultStatus.classList.toggle("is-secure", count === signals.length);
    }

    function resetLevel() {
      cancelAnimationFrame(animationId);
      keys.clear();
      collected = [false, false, false];
      checkpointX = 54;
      checkpointY = 396;
      cameraX = 0;
      player.x = 54;
      player.y = 396;
      player.vx = 0;
      player.vy = 0;
      player.grounded = true;
      player.facing = 1;
      phase = "ready";
      quiz.hidden = true;
      quizFeedback.textContent = "";
      quizFeedback.classList.remove("is-correct");
      quiz.querySelectorAll("[data-quiz-answer]").forEach((button) => {
        button.disabled = false;
      });
      runButton.textContent = "Start run";
      updateProgress();
      setMessage("Secure the account: enable MFA, add a second factor, then save recovery codes.", false);
      draw();
    }

    function beginRun() {
      if (phase === "won") resetLevel();
      phase = "playing";
      runButton.textContent = "Restart run";
      setMessage("Find the setup signals. Watch for exposed data leaks.", false);
      root.focus({ preventScroll: true });
      previousTime = 0;
      animationId = requestAnimationFrame(loop);
    }

    function overlaps(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function checkpoint() {
      player.x = checkpointX;
      player.y = checkpointY;
      player.vx = 0;
      player.vy = 0;
      player.grounded = true;
    }

    function update(delta) {
      const step = Math.min(delta / 16.67, 2);
      const left = keys.has("ArrowLeft") || keys.has("KeyA") || keys.has("left");
      const right = keys.has("ArrowRight") || keys.has("KeyD") || keys.has("right");
      player.vx = (right ? MOVE_SPEED : 0) - (left ? MOVE_SPEED : 0);

      if ((keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW") || keys.has("jump")) && player.grounded) {
        player.vy = JUMP_SPEED;
        player.grounded = false;
      }

      if (left !== right) player.facing = left ? -1 : 1;
      player.x = Math.max(0, Math.min(WORLD_WIDTH - player.w, player.x + player.vx * step));
      for (const platform of platforms) {
        const verticalOverlap = player.y < platform.y + platform.h && player.y + player.h > platform.y;
        if (!verticalOverlap || !overlaps(player, platform) || player.vx === 0) continue;
        player.x = player.vx > 0 ? platform.x - player.w : platform.x + platform.w;
        player.vx = 0;
      }

      const previousY = player.y;
      player.vy += GRAVITY * step;
      player.y += player.vy * step;
      player.grounded = false;
      for (const platform of platforms) {
        if (!overlaps(player, platform)) continue;
        if (player.vy >= 0 && previousY + player.h <= platform.y && player.y + player.h >= platform.y) {
          player.y = platform.y - player.h;
          player.vy = 0;
          player.grounded = true;
        } else if (player.vy < 0 && previousY >= platform.y + platform.h && player.y <= platform.y + platform.h) {
          player.y = platform.y + platform.h;
          player.vy = 0;
        }
      }

      if (player.y > HEIGHT + 70) checkpoint();

      for (const hazard of hazards) {
        if (overlaps(player, hazard)) {
          checkpoint();
          setMessage("Data leak! You respawn at your last secured checkpoint.", true);
          break;
        }
      }

      signals.forEach((signal, index) => {
        if (collected[index] || (index === 2 && !collected[1]) || !overlaps(player, { x: signal.x, y: signal.y, w: 30, h: 30 })) return;
        collected[index] = true;
        checkpointX = checkpoints[index].x;
        checkpointY = checkpoints[index].y;
        updateProgress();
        const messages = [
          "Step 1: Turn on MFA in your exchange account's security settings.",
          "Step 2: Add a second factor. Turn back for the recovery codes.",
          "Step 3: Store recovery codes somewhere private and secure."
        ];
        setMessage(messages[index], true);
      });

      const vault = { x: VAULT_X, y: 316, w: 74, h: 124 };
      if (overlaps(player, vault)) {
        if (collected.every(Boolean)) {
          phase = "won";
          cancelAnimationFrame(animationId);
          quiz.hidden = false;
          runButton.textContent = "Play again";
          setMessage("Vault secured! MFA adds a verification step beyond your password.", true);
        } else if (performance.now() - lastVaultMessage > 1800) {
          lastVaultMessage = performance.now();
          setMessage("Vault locked. Collect all three setup signals first.", true);
          player.x = 1710;
        }
      }

      cameraX = Math.max(0, Math.min(WORLD_WIDTH - WIDTH, player.x - 280));
    }

    function drawBackground() {
      const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      sky.addColorStop(0, "#101b42");
      sky.addColorStop(0.62, "#1E3A8A");
      sky.addColorStop(1, "#111b3b");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      ctx.translate(-cameraX * 0.22, 0);
      for (let index = 0; index < 19; index += 1) {
        const x = index * 138;
        const height = 100 + ((index * 47) % 115);
        ctx.fillStyle = index % 3 === 0 ? "#31246d" : "#172b68";
        ctx.fillRect(x, 440 - height, 92, height);
        ctx.fillStyle = "rgba(96, 165, 250, 0.55)";
        for (let row = 0; row < Math.floor(height / 24); row += 1) {
          ctx.fillRect(x + 13, 455 - height + row * 24, 5, 5);
          ctx.fillRect(x + 39, 455 - height + row * 24, 5, 5);
          ctx.fillRect(x + 65, 455 - height + row * 24, 5, 5);
        }
      }
      ctx.restore();

      ctx.strokeStyle = "rgba(96, 165, 250, 0.18)";
      ctx.lineWidth = 1;
      for (let x = -((cameraX * 0.6) % 40); x <= WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
      for (let y = 40; y < HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }
    }

    function drawPlatforms() {
      platforms.forEach((platform) => {
        const x = platform.x - cameraX;
        if (x + platform.w < 0 || x > WIDTH) return;
        const surface = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
        surface.addColorStop(0, "#263b82");
        surface.addColorStop(1, "#17244e");
        ctx.fillStyle = surface;
        ctx.fillRect(x, platform.y, platform.w, platform.h);
        ctx.fillStyle = "#60A5FA";
        ctx.fillRect(x, platform.y, platform.w, 3);
        ctx.fillStyle = "#6D28D9";
        ctx.fillRect(x, platform.y + 3, platform.w, 3);
        ctx.fillStyle = "rgba(96, 165, 250, 0.28)";
        for (let stripe = x + 12; stripe < x + platform.w; stripe += 32) {
          ctx.fillRect(stripe, platform.y + 9, 12, 3);
        }
      });
    }

    function drawSignals(time) {
      signals.forEach((signal, index) => {
        if (collected[index] || (index === 2 && !collected[1])) return;
        const x = signal.x - cameraX;
        if (x < -60 || x > WIDTH + 60) return;
        const pulse = Math.sin(time / 210 + index) * 3;
        ctx.save();
        ctx.translate(x + 14, signal.y + 14 + pulse);
          ctx.fillStyle = index === 1 ? "rgba(109, 40, 217, 0.32)" : "rgba(96, 165, 250, 0.28)";
          ctx.fillRect(-18, -18, 36, 36);
          ctx.fillStyle = "#60A5FA";
          ctx.fillRect(-13, -13, 26, 26);
          ctx.fillStyle = "#1E3A8A";
          if (index === 0) {
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(9, -7);
            ctx.lineTo(8, 2);
            ctx.quadraticCurveTo(6, 8, 0, 11);
            ctx.quadraticCurveTo(-6, 8, -8, 2);
            ctx.lineTo(-9, -7);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#FAFAFA";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-4, 0);
            ctx.lineTo(-1, 3);
            ctx.lineTo(5, -4);
            ctx.stroke();
          } else if (index === 1) {
            ctx.fillRect(-7, -11, 14, 22);
            ctx.fillStyle = "#FAFAFA";
            ctx.fillRect(-5, -8, 10, 14);
            ctx.fillStyle = "#6D28D9";
            ctx.fillRect(-3, -5, 6, 2);
            ctx.fillRect(-3, -1, 2, 2);
            ctx.fillRect(1, -1, 2, 2);
            ctx.fillRect(-3, 3, 2, 2);
            ctx.fillRect(1, 3, 2, 2);
            ctx.fillStyle = "#FAFAFA";
            ctx.fillRect(-1, 8, 2, 1);
          } else {
            ctx.fillStyle = "#FAFAFA";
            ctx.fillRect(-8, -10, 16, 20);
            ctx.fillStyle = "#6D28D9";
            ctx.fillRect(-5, -6, 3, 3);
            ctx.fillRect(1, -6, 3, 3);
            ctx.fillRect(-5, 0, 3, 3);
            ctx.fillRect(1, 0, 3, 3);
            ctx.fillRect(-5, 6, 3, 2);
            ctx.fillRect(1, 6, 3, 2);
          }
        ctx.restore();

        ctx.fillStyle = "#FAFAFA";
        ctx.font = "800 10px Trebuchet MS, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(signal.label, x + 14, signal.y - 5 + pulse);
      });
    }

    function drawHazards() {
      hazards.forEach((hazard) => {
        const x = hazard.x - cameraX;
        if (x + hazard.w < 0 || x > WIDTH) return;
        ctx.fillStyle = "#6D28D9";
        ctx.beginPath();
        ctx.moveTo(x, hazard.y + hazard.h);
        ctx.lineTo(x + 8, hazard.y + 4);
        ctx.lineTo(x + 17, hazard.y + hazard.h);
        ctx.lineTo(x + 27, hazard.y + 4);
        ctx.lineTo(x + 37, hazard.y + hazard.h);
        ctx.lineTo(x + 47, hazard.y + 4);
        ctx.lineTo(x + hazard.w, hazard.y + hazard.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#60A5FA";
        ctx.fillRect(x + 5, hazard.y + hazard.h - 3, hazard.w - 10, 3);
      });
    }

    function drawVault() {
      const x = VAULT_X - cameraX;
      ctx.fillStyle = "#60A5FA";
      ctx.fillRect(x, 316, 74, 124);
      ctx.fillStyle = "#1E3A8A";
      ctx.fillRect(x + 8, 324, 58, 108);
      ctx.strokeStyle = "#6D28D9";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 16, 334, 42, 42);
      ctx.fillStyle = "#6D28D9";
      ctx.beginPath();
      ctx.arc(x + 37, 355, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + 35, 355, 4, 12);
      ctx.fillStyle = "#FAFAFA";
      ctx.font = "900 11px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CRYPTO", x + 37, 397);
      ctx.fillText("VAULT", x + 37, 413);
    }

    function drawPlayer() {
      const x = player.x - cameraX;
      const sprite = !player.grounded ? sprites.jump : player.vx !== 0 ? sprites.walk : sprites.idle;
      const image = sprite.image;
      if (image.complete && image.naturalWidth > 0) {
        const frame = Math.floor(performance.now() / sprite.duration) % sprite.frames;
        const size = 72;
        ctx.save();
        ctx.translate(x + player.w / 2, 0);
        ctx.scale(player.facing, 1);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, frame * 48, 0, 48, 48, -size / 2, player.y + player.h - size + 8, size, size);
        ctx.restore();
        return;
      }
      ctx.fillStyle = "#FAFAFA";
      ctx.fillRect(x + 4, player.y + 3, 20, 17);
      ctx.fillStyle = "#1E3A8A";
      ctx.fillRect(x + 7, player.y + 7, 4, 4);
      ctx.fillRect(x + 17, player.y + 7, 4, 4);
      ctx.fillStyle = "#6D28D9";
      ctx.fillRect(x + 2, player.y + 20, 24, 17);
      ctx.fillStyle = "#1E3A8A";
      ctx.fillRect(x + 5, player.y + 36, 7, 8);
      ctx.fillRect(x + 17, player.y + 36, 7, 8);
      ctx.fillStyle = "#FAFAFA";
      ctx.fillRect(x + 12, player.y + 13, 4, 2);
    }

    function drawOverlay() {
      if (phase === "playing") return;
      ctx.fillStyle = "rgba(30, 58, 138, 0.68)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = "center";
      if (phase === "won") {
        ctx.fillStyle = "#60A5FA";
        ctx.font = "900 32px Trebuchet MS, sans-serif";
        ctx.fillText("VAULT SECURED", WIDTH / 2, 205);
        ctx.fillStyle = "#FAFAFA";
        ctx.font = "600 16px Trebuchet MS, sans-serif";
        ctx.fillText("MFA adds a verification step beyond your password.", WIDTH / 2, 239);
      } else {
        ctx.fillStyle = "#60A5FA";
        ctx.font = "900 30px Trebuchet MS, sans-serif";
        ctx.fillText("ADD A SECOND FACTOR", WIDTH / 2, 203);
        ctx.fillStyle = "#FAFAFA";
        ctx.font = "600 16px Trebuchet MS, sans-serif";
        ctx.fillText("Enable MFA and keep your recovery codes somewhere safe.", WIDTH / 2, 237);
      }
    }

    function draw(time) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawBackground();
      drawPlatforms();
      drawSignals(time || 0);
      drawHazards();
      drawVault();
      drawPlayer();
      drawOverlay();
    }

    function loop(time) {
      if (phase !== "playing") return;
      const delta = previousTime ? time - previousTime : 16.67;
      previousTime = time;
      update(delta);
      draw(time);
      if (phase === "playing") animationId = requestAnimationFrame(loop);
    }

    root.addEventListener("keydown", (event) => {
      if (event.target !== root && event.target !== canvas) return;
      const validKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW"];
      if (!validKeys.includes(event.code)) return;
      event.preventDefault();
      keys.add(event.code);
    });

    window.addEventListener("keyup", (event) => keys.delete(event.code));
    window.addEventListener("blur", () => keys.clear());

    root.querySelector("[data-reset]").addEventListener("click", resetLevel);
    quiz.querySelectorAll("[data-quiz-answer]").forEach((button) => {
      button.addEventListener("click", () => {
        const correct = button.dataset.quizAnswer === "correct";
        quizFeedback.textContent = correct
          ? "Correct. MFA checks that it is really you, even if your password is exposed."
          : "Not quite. MFA adds another verification step; it does not make passwords impossible to steal.";
        quizFeedback.classList.toggle("is-correct", correct);
        if (correct) {
          quiz.querySelectorAll("[data-quiz-answer]").forEach((answer) => {
            answer.disabled = true;
          });
        }
      });
    });
    runButton.addEventListener("click", () => {
      if (phase === "playing") resetLevel();
      beginRun();
    });

    root.querySelectorAll("[data-control]").forEach((button) => {
      const control = button.dataset.control;
      const press = (event) => {
        event.preventDefault();
        if (phase !== "playing") beginRun();
        keys.add(control);
        button.classList.add("is-pressed");
        button.setPointerCapture?.(event.pointerId);
      };
      const release = () => {
        keys.delete(control);
        button.classList.remove("is-pressed");
      };
      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    });

    root.addEventListener("focusin", () => {
      if (phase === "playing") canvas.focus({ preventScroll: true });
    });

    updateProgress();
    draw();
  }

  window.LayerUpGame = { mount };
  document.querySelectorAll("[data-layer-up-game]").forEach(mount);
})();