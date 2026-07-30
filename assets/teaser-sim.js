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
    scene.add(m);
    return m;
  });

  // links as lines. MD edges get their own bright gold material.
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x3a4266, transparent: true, opacity: 0.55
  });
  const mdMat = new THREE.LineBasicMaterial({
    color: 0xd48a3a, transparent: true, opacity: 0.85
  });
  for (const [s, t] of links) {
    const a = byId.get(s).pos, b = byId.get(t).pos;
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    scene.add(new THREE.Line(g, MD.has(`${s}|${t}`) ? mdMat : lineMat));
  }

  // --- camera framing ----------------------------------------------------
  // Frame the actual bounding box (averages drift toward dense clusters).
  const bbox = new THREE.Box3();
  for (const n of nodes) bbox.expandByPoint(n.pos);
  const bboxCenter = new THREE.Vector3(); bbox.getCenter(bboxCenter);
  const bboxSize = new THREE.Vector3(); bbox.getSize(bboxSize);
  const homeTarget = bboxCenter.clone();
  // 2.6× longest axis frames the whole galaxy comfortably at 55° FoV;
  // 1.35× was undershooting hard on the compact cluster.
  const homeDist = Math.max(60, Math.max(bboxSize.x, bboxSize.y, bboxSize.z) * 2.6);
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

  // --- animate: slow autorotate until user touches ----------------------
  function loop() {
    if (autoRotate) { yaw += 0.0018; updateCamera(); }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
})();
