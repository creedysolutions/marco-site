// Copyright (c) 2026 Creedy Solutions LLC.
// assets/teaser-sim.js — LinkedIn teaser scene.
//
// Faithful to Marco's Universe visual language (slate standard objects,
// per-package galaxy colors, gold master-detail lines), but the data is
// SYNTHETIC — a curated 45-node graph tuned to look like a real org from
// across the room. Not a live extension read; no Salesforce APIs touched.
//
// Vanilla Three.js r128 (vendored, no build step). Hand-rolled orbit +
// wheel + click — OrbitControls would double the vendored payload.

(() => {
  const canvas = document.getElementById("scene");
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05060e, 260, 620);

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 1200);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x05060e, 0);

  // Near-neutral lights so the palette isn't washed out to lavender.
  // (Original bright-purple key made every group read as "custom".)
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.PointLight(0xffffff, 0.7, 800);
  key.position.set(80, 60, 140);
  scene.add(key);
  const fill = new THREE.PointLight(0xffd39c, 0.35, 600);
  fill.position.set(-140, -60, -80);
  scene.add(fill);

  // --- data: name, group, size (deg) ------------------------------------
  // Palette mirrors the Universe.
  // Distinct hues so each galaxy reads as itself, not "everything is purple."
  const COLORS = {
    std:    0xd7dceb, // brighter slate — the neutral backbone
    custom: 0xb083ff, // saturated Marco purple
    cpq:    0xffb347, // warm gold
    fsl:    0x66e296, // green
    inv:    0x60c9e3, // cyan
    mdt:    0xff86c1  // pink (was teal — collided with fsl/inv)
  };
  const NODES = [
    // standard core
    ["Account",     "std", 11],
    ["Contact",     "std", 7],
    ["Opportunity", "std", 8],
    ["Lead",        "std", 4],
    ["Case",        "std", 6],
    ["User",        "std", 9],
    ["Order",       "std", 5],
    ["Product2",    "std", 5],
    ["Asset",       "std", 4],
    ["Task",        "std", 6],
    ["Event",       "std", 5],
    ["Contract",    "std", 4],
    // unmanaged custom
    ["Project__c",       "custom", 4],
    ["Invoice__c",       "custom", 3],
    ["Site_Survey__c",   "custom", 3],
    ["Vendor__c",        "custom", 2],
    ["Certification__c", "custom", 2],
    ["Expense__c",       "custom", 2],
    // CPQ galaxy
    ["SBQQ__Quote__c",           "cpq", 6],
    ["SBQQ__QuoteLine__c",       "cpq", 5],
    ["SBQQ__ProductOption__c",   "cpq", 3],
    ["SBQQ__Subscription__c",    "cpq", 3],
    ["SBQQ__PriceRule__c",       "cpq", 2],
    // FSL
    ["FSL__ResourcePref__c",     "fsl", 4],
    ["FSL__PolicyGoal__c",       "fsl", 3],
    ["FSL__WorkRule__c",         "fsl", 3],
    ["FSL__PolicyWorkRule__c",   "fsl", 2],
    // Inventory-ish
    ["Inventory__c",             "inv", 3],
    ["Location__c",              "inv", 3],
    // metadata types
    ["Feature_Flag__mdt", "mdt", 1],
    ["Region_Config__mdt","mdt", 1]
  ];
  // (source, target)
  const LINKS = [
    ["Account","Contact"],["Account","Opportunity"],["Account","Case"],
    ["Account","Order"],["Account","Contract"],["Account","User"],
    ["Account","Asset"],["Contact","Case"],["Contact","Task"],
    ["Opportunity","User"],["Opportunity","Contact"],["Opportunity","Order"],
    ["Opportunity","Product2"],["Lead","User"],["Case","User"],
    ["Order","Product2"],["Order","Asset"],["Task","User"],
    ["Event","User"],["Contract","Order"],
    ["Project__c","Account"],["Project__c","Vendor__c"],
    ["Invoice__c","Account"],["Invoice__c","Project__c"],
    ["Site_Survey__c","Account"],["Certification__c","Contact"],
    ["Expense__c","Project__c"],
    ["SBQQ__Quote__c","Opportunity"],["SBQQ__Quote__c","Account"],
    ["SBQQ__QuoteLine__c","SBQQ__Quote__c"],
    ["SBQQ__ProductOption__c","Product2"],
    ["SBQQ__ProductOption__c","SBQQ__QuoteLine__c"],
    ["SBQQ__Subscription__c","Account"],
    ["SBQQ__Subscription__c","SBQQ__Quote__c"],
    ["SBQQ__PriceRule__c","SBQQ__Quote__c"],
    ["FSL__ResourcePref__c","User"],["FSL__PolicyGoal__c","Case"],
    ["FSL__WorkRule__c","Case"],["FSL__PolicyWorkRule__c","FSL__WorkRule__c"],
    ["Inventory__c","Product2"],["Inventory__c","Location__c"],
    ["Location__c","Account"]
  ];
  // master-detail highlights (gold beams)
  const MD = new Set([
    "SBQQ__QuoteLine__c|SBQQ__Quote__c",
    "SBQQ__ProductOption__c|SBQQ__QuoteLine__c",
    "FSL__PolicyWorkRule__c|FSL__WorkRule__c",
    "Expense__c|Project__c"
  ]);

  // --- lay it out with a small deterministic force sim -------------------
  // Seed positions on group-anchored spheres so packages start apart.
  const anchors = {
    std:    new THREE.Vector3(0, 0, 0),
    custom: new THREE.Vector3(45, 25, 20),
    cpq:    new THREE.Vector3(-40, -20, 30),
    fsl:    new THREE.Vector3(20, -35, -25),
    inv:    new THREE.Vector3(-30, 30, -20),
    mdt:    new THREE.Vector3(40, -10, -40)
  };
  const nodes = NODES.map(([id, grp, deg], i) => {
    const a = anchors[grp];
    // fibonacci-ish jitter per index — deterministic, non-clumped
    const phi = i * 2.399, r = 12 + (i % 5) * 3;
    return {
      id, grp, deg,
      pos: new THREE.Vector3(
        a.x + Math.cos(phi) * r,
        a.y + Math.sin(phi * 1.7) * r,
        a.z + Math.sin(phi) * r
      ),
      vel: new THREE.Vector3()
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = LINKS.filter(([s, t]) => byId.has(s) && byId.has(t));

  // 200 relaxation steps: repulsion + spring links + weak group pull.
  const REP = 220, SPRING = 0.02, REST = 22, GROUP_PULL = 0.006;
  for (let step = 0; step < 220; step++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.pos.x - b.pos.x, dy = a.pos.y - b.pos.y, dz = a.pos.z - b.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.01;
        const f = REP / d2;
        const d = Math.sqrt(d2);
        a.vel.x += (dx / d) * f; a.vel.y += (dy / d) * f; a.vel.z += (dz / d) * f;
        b.vel.x -= (dx / d) * f; b.vel.y -= (dy / d) * f; b.vel.z -= (dz / d) * f;
      }
    }
    for (const [s, t] of links) {
      const a = byId.get(s), b = byId.get(t);
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dy, dz) || 0.01;
      const k = (d - REST) * SPRING;
      a.vel.x += (dx / d) * k; a.vel.y += (dy / d) * k; a.vel.z += (dz / d) * k;
      b.vel.x -= (dx / d) * k; b.vel.y -= (dy / d) * k; b.vel.z -= (dz / d) * k;
    }
    for (const n of nodes) {
      const a = anchors[n.grp];
      n.vel.x += (a.x - n.pos.x) * GROUP_PULL;
      n.vel.y += (a.y - n.pos.y) * GROUP_PULL;
      n.vel.z += (a.z - n.pos.z) * GROUP_PULL;
      // integrate + heavy damping
      n.pos.add(n.vel.multiplyScalar(0.35));
      n.vel.multiplyScalar(0);
    }
  }

  // --- three.js meshes ---------------------------------------------------
  const sphereGeo = new THREE.SphereGeometry(1, 22, 22);
  const meshes = nodes.map((n) => {
    const r = 1.4 + Math.cbrt(n.deg) * 0.9;
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS[n.grp],
      emissive: COLORS[n.grp],
      emissiveIntensity: 0.55,
      roughness: 0.35, metalness: 0.15
    });
    const m = new THREE.Mesh(sphereGeo, mat);
    m.position.copy(n.pos);
    m.scale.setScalar(r);
    m.userData.node = n;
    // Reaction bookkeeping: the layout rest state stars spring back toward.
    m.userData.base = n.pos.clone();
    m.userData.baseScale = r;
    m.userData.baseEmissive = 0.55;
    scene.add(m);
    return m;
  });
  const meshOf = new Map(nodes.map((n, i) => [n.id, meshes[i]]));

  // links as lines. MD edges get their own bright gold material. Each line
  // keeps refs to its two meshes so it can follow them as they ripple.
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x3a4266, transparent: true, opacity: 0.55
  });
  const mdMat = new THREE.LineBasicMaterial({
    color: 0xd48a3a, transparent: true, opacity: 0.85
  });
  const lineRecords = [];
  for (const [s, t] of links) {
    const ma = meshOf.get(s), mb = meshOf.get(t);
    const geo = new THREE.BufferGeometry().setFromPoints([ma.position, mb.position]);
    scene.add(new THREE.Line(geo, MD.has(`${s}|${t}`) ? mdMat : lineMat));
    lineRecords.push({ geo, a: ma, b: mb });
  }

  // --- camera framing ----------------------------------------------------
  // Frame the actual bounding box (averages drift toward dense clusters).
  const bbox = new THREE.Box3();
  for (const n of nodes) bbox.expandByPoint(n.pos);
  const bboxCenter = new THREE.Vector3(); bbox.getCenter(bboxCenter);
  const bboxSize = new THREE.Vector3(); bbox.getSize(bboxSize);
  const homeTarget = bboxCenter.clone();
  // 1.8× longest axis: close enough that the galaxy fills the frame around
  // the wordmark, far enough that no sphere covers it. (2.6× shrank it to
  // a blob behind the text; 1.35× was way too close.)
  const homeDist = Math.max(45, Math.max(bboxSize.x, bboxSize.y, bboxSize.z) * 1.8);
  let camDist = homeDist;
  let yaw = 0.7, pitch = 0.25;
  let autoRotate = true;
  const target = homeTarget.clone();
  function updateCamera() {
    const cp = pitch;
    const cy = yaw;
    camera.position.set(
      target.x + camDist * Math.cos(cp) * Math.sin(cy),
      target.y + camDist * Math.sin(cp),
      target.z + camDist * Math.cos(cp) * Math.cos(cy)
    );
    camera.lookAt(target);
  }
  updateCamera();

  // --- interaction: drag / wheel / click ---------------------------------
  let dragging = false, movedPx = 0, lastX = 0, lastY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; movedPx = 0;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    movedPx += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.005;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.005));
    lastX = e.clientX; lastY = e.clientY;
    autoRotate = false;
    updateCamera();
  });
  canvas.addEventListener("pointerup", (e) => {
    dragging = false;
    // small movement = click → raycast
    if (movedPx < 6) {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const rc = new THREE.Raycaster();
      rc.setFromCamera({ x: nx, y: ny }, camera);
      const hit = rc.intersectObjects(meshes, false)[0];
      if (hit) focusOn(hit.object.userData.node);
      else clearFocus();
    }
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    camDist = Math.max(45, Math.min(320, camDist * (1 + e.deltaY * 0.001)));
    autoRotate = false;
    updateCamera();
  }, { passive: false });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // --- mouse reaction: hover field + ripple bursts -----------------------
  // A cursor ray projected onto a plane through the galaxy center gives a
  // world point. Stars near it glow, swell, and get gently pushed (the
  // hover field). Fast mouse movement spawns expanding ripple shells that
  // pulse stars as they pass through — the "the galaxy notices you" feel.
  const HOVER_RADIUS = 34, HOVER_PUSH = 4, HOVER_GLOW = 1.15, HOVER_SCALE = 0.24;
  const RIPPLE_SPEED = 60, RIPPLE_WIDTH = 15, RIPPLE_MAX = 95;
  const RIPPLE_PUSH = 5, RIPPLE_GLOW = 1.5, RIPPLE_SCALE = 0.34;
  const EASE = 0.16;
  const ripples = []; // { o: Vector3 origin, t: seconds alive }

  let pointerActive = false, pNdcX = 0, pNdcY = 0;
  let lastPx = 0, lastPy = 0, movedSinceRipple = 0, lastRippleT = 0;

  const _plane = new THREE.Plane();
  const _rcH = new THREE.Raycaster();
  const _fwd = new THREE.Vector3();
  function pointAt(nx, ny) {
    camera.getWorldDirection(_fwd);
    _plane.setFromNormalAndCoplanarPoint(_fwd, homeTarget); // galaxy-center plane
    _rcH.setFromCamera({ x: nx, y: ny }, camera);
    const out = new THREE.Vector3();
    return _rcH.ray.intersectPlane(_plane, out) ? out : null;
  }

  // Separate from the drag-orbit pointermove above; this one always tracks.
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pNdcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pNdcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    pointerActive = true;
    const dpx = Math.hypot(e.clientX - lastPx, e.clientY - lastPy);
    lastPx = e.clientX; lastPy = e.clientY;
    if (!dragging) {
      movedSinceRipple += dpx;
      const now = performance.now();
      if (movedSinceRipple > 70 && now - lastRippleT > 90) {
        const p = pointAt(pNdcX, pNdcY);
        if (p) { ripples.push({ o: p, t: 0 }); if (ripples.length > 6) ripples.shift(); }
        movedSinceRipple = 0; lastRippleT = now;
      }
    }
  });
  canvas.addEventListener("pointerleave", () => { pointerActive = false; });

  // --- focus card --------------------------------------------------------
  // Faux data — evocative but obviously synthetic (24, 6, 3 for standard;
  // scales with degree).
  const FOCUS_COPY = {
    std:    { chip: "standard", body: (n) => `<b>${18 + n.deg * 3} fields</b> · <b>${Math.max(2, n.deg - 4)} validation rules</b> · <b>${Math.max(1, Math.round(n.deg / 2))} flows</b> touch it.` },
    custom: { chip: "custom", body: (n) => `Unmanaged custom object. <b>${8 + n.deg * 2} fields</b>, <b>${n.deg + 1}</b> relationships. Marco reveals every one.` },
    cpq:    { chip: "CPQ Extended Suite", body: (n) => `Managed-package object. Marco walks its dependencies without leaving your browser.` },
    fsl:    { chip: "Field Service Lightning", body: (n) => `Managed-package object. See every reference across your org.` },
    inv:    { chip: "Inventory", body: (n) => `Custom object with <b>${n.deg + 1}</b> visible relationships.` },
    mdt:    { chip: "Custom Metadata Type", body: (n) => `Config record. Referenced by <b>${1 + n.deg}</b> flows and formulas.` }
  };
  const $ = (id) => document.getElementById(id);
  function focusOn(n) {
    const c = FOCUS_COPY[n.grp];
    $("fName").textContent = n.id;
    $("fSub").innerHTML = `<span class="chip">${c.chip}</span>${n.deg} relationships`;
    $("fBody").innerHTML = c.body(n);
    $("focus").classList.add("on");
    // fly camera to that node
    target.copy(n.pos); camDist = 55;
    autoRotate = false;
    updateCamera();
  }
  function clearFocus() {
    $("focus").classList.remove("on");
    // Fly back to a comfortable overview instead of stranding the camera
    // wherever the last focus landed it.
    target.copy(homeTarget); camDist = homeDist;
    autoRotate = true;
    updateCamera();
  }
  document.querySelector("#focus .close").addEventListener("click", clearFocus);

  // --- animate: autorotate + mouse-reaction physics + line-follow --------
  const _disp = new THREE.Vector3(), _dir = new THREE.Vector3();
  let lastFrame = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000); // clamp tab-switch jumps
    lastFrame = now;

    if (autoRotate) yaw += 0.0018;
    updateCamera(); // keep camera current so the hover ray is accurate

    // Hover point tracks the cursor even while the galaxy rotates.
    const hoverPoint = pointerActive ? pointAt(pNdcX, pNdcY) : null;

    // Age ripples; cull once the shell has expanded past the galaxy.
    for (const r of ripples) r.t += dt;
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (ripples[i].t * RIPPLE_SPEED > RIPPLE_MAX) ripples.splice(i, 1);
    }

    for (const m of meshes) {
      const base = m.userData.base;
      _disp.set(0, 0, 0);
      let glow = 0, scaleB = 0;

      if (hoverPoint) {
        const d = base.distanceTo(hoverPoint);
        if (d < HOVER_RADIUS) {
          const f = 1 - d / HOVER_RADIUS, ff = f * f; // soft falloff
          _dir.copy(base).sub(hoverPoint);
          if (_dir.lengthSq() < 1e-4) _dir.set(0, 1, 0);
          _dir.normalize();
          _disp.addScaledVector(_dir, ff * HOVER_PUSH);
          glow += ff * HOVER_GLOW; scaleB += ff * HOVER_SCALE;
        }
      }
      for (const r of ripples) {
        const shell = r.t * RIPPLE_SPEED;
        const dd = Math.abs(base.distanceTo(r.o) - shell);
        if (dd < RIPPLE_WIDTH) {
          const fade = 1 - shell / RIPPLE_MAX;               // weaker as it expands
          const f = (1 - dd / RIPPLE_WIDTH) * fade;
          _dir.copy(base).sub(r.o);
          if (_dir.lengthSq() < 1e-4) _dir.set(0, 1, 0);
          _dir.normalize();
          _disp.addScaledVector(_dir, f * RIPPLE_PUSH);
          glow += f * RIPPLE_GLOW; scaleB += f * RIPPLE_SCALE;
        }
      }

      // Ease toward rest+displacement, glow, and scale — springs back on its own.
      m.position.lerp(_disp.add(base), EASE);
      const be = m.userData.baseEmissive, bs = m.userData.baseScale;
      m.material.emissiveIntensity += ((be + glow) - m.material.emissiveIntensity) * EASE;
      const sc = bs * (1 + scaleB);
      m.scale.setScalar(m.scale.x + (sc - m.scale.x) * EASE);
    }

    // Lines follow their (now-jiggling) endpoints so the whole web ripples.
    for (const rec of lineRecords) {
      const p = rec.geo.attributes.position.array;
      p[0] = rec.a.position.x; p[1] = rec.a.position.y; p[2] = rec.a.position.z;
      p[3] = rec.b.position.x; p[4] = rec.b.position.y; p[5] = rec.b.position.z;
      rec.geo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
})();
