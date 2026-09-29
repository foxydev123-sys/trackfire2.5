/* =====================================================================
   LOBBY STAGE — the tanks you see on the menu screen.

   Your tank stands on the ground south of the Citadel, turned about 35°
   so you see its front and one side, with Hawler behind it. As friends
   join your squad their tanks fall in beside you and the camera eases
   back so the whole line stays in frame; when one leaves it closes up
   again. Everyone's pick is live: change tank and the model swaps.

   The stage only ever runs on the menu and lobby screens — it is torn
   down before a match, so it costs a match nothing.
   ===================================================================== */
import * as THREE from '../three.js';
import { TankView } from './tank.js';

// Where the line-up stands, in Hawler's own coordinates. The Citadel sits at
// (0,-30) with a radius of about 19.5, so standing at z = +8 puts it squarely
// behind the tanks from a camera further south.
const STAGE = { x: 0, z: 8 };
const SPACING = 7.4;            // metres between tanks
const ARC = 1.5;                // how far back the outer tanks sit, so none is hidden
const YAW = -Math.PI * 0.62;    // turned about 35° off straight-on, front-right to the camera

// How far the camera sits back for 1, 2, 3 and 4 tanks, and what it looks at.
const SHOTS = [
  { dist: 21, height: 8.0, side: 7.5, aim: 2.6 },
  { dist: 26, height: 9.0, side: 8.5, aim: 2.8 },
  { dist: 31, height: 10.2, side: 9.5, aim: 3.0 },
  { dist: 35, height: 11.2, side: 10.5, aim: 3.2 },
];

const TEAM_COL = [
  [0xd8a83c, 0xffe0a0],   // you — the game's amber
  [0x5f92e8, 0xbcd6ff],
  [0x6fb85f, 0xc4f0b8],
  [0xb07fd8, 0xe2c8ff],
];

export class LobbyStage {
  constructor() {
    this.W = null;              // the world we are staged in
    this.views = new Map();     // player id → { view, kind, slot }
    this.t = 0;
    this.cam = { dist: SHOTS[0].dist, height: SHOTS[0].height, side: SHOTS[0].side, aim: SHOTS[0].aim };
    this.want = { ...this.cam };
    this.spin = 0;              // a slow drift, so the shot is never dead still
  }

  /** Move the stage into `W` (the menu world). Safe to call with the same world again. */
  attach(W) {
    if (this.W === W) return;
    this.clear();
    this.W = W;
  }

  clear() {
    for (const e of this.views.values()) e.view.dispose();
    this.views.clear();
  }

  groundY(x, z) { return this.W && this.W.map ? this.W.map.height(x, z) : 0; }

  /**
   * Set the whole line-up at once.
   * `players` = [{ id, tank }] in the order they should stand, you first.
   */
  setPlayers(players) {
    if (!this.W) return;
    const list = players.slice(0, 4);
    const seen = new Set();
    list.forEach((p, i) => {
      seen.add(p.id);
      const kind = p.tank || 'zagros';
      let e = this.views.get(p.id);
      if (e && e.kind !== kind) { e.view.dispose(); e = null; }     // they switched tank
      if (!e) {
        const [col, acc] = TEAM_COL[i % 4];
        const view = new TankView(this.W.scene, col, acc, i === 0, kind);
        if (view.teamRing) view.teamRing.visible = false;           // no team ring on the menu
        view.setNight(!!this.W.night);
        e = { view, kind, slot: i, born: this.t };
        this.views.set(p.id, e);
      }
      e.slot = i;
    });
    for (const [id, e] of this.views) if (!seen.has(id)) { e.view.dispose(); this.views.delete(id); }
    const shot = SHOTS[Math.min(3, Math.max(0, list.length - 1))];
    this.want = { ...shot };
  }

  /** Where the tank in slot `i` of `n` stands: a shallow arc, middle nearest the camera. */
  spotOf(i, n) {
    const mid = (n - 1) / 2;
    const off = i - mid;
    return {
      x: STAGE.x + off * SPACING,
      z: STAGE.z - Math.abs(off) * ARC,       // the outer ones a little further back
    };
  }

  /** Called every menu frame. Returns the camera position and target to use. */
  frame(dt, camera) {
    this.t += dt;
    const n = this.views.size || 1;
    for (const e of this.views.values()) {
      const s = this.spotOf(e.slot, this.views.size);
      // a gentle idle sway, each tank slightly out of phase with the others
      const sway = Math.sin(this.t * 0.5 + e.slot * 1.3) * 0.035;
      e.view.setPose(s.x, s.z, YAW + sway, YAW + sway, (x, z) => this.groundY(x, z), dt, 0);
      e.view.setShield(false, this.t);
    }
    // ease the camera toward the shot this many tanks calls for
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key of ['dist', 'height', 'side', 'aim']) this.cam[key] += (this.want[key] - this.cam[key]) * k;
    this.spin += dt * 0.055;
    const drift = Math.sin(this.spin) * 2.2;                 // a slow left-right drift
    const cx = STAGE.x + this.cam.side + drift;
    const cz = STAGE.z + this.cam.dist;
    const cy = this.groundY(cx, cz) + this.cam.height;
    camera.position.set(cx, cy, cz);
    camera.lookAt(STAGE.x + drift * 0.35, this.groundY(STAGE.x, STAGE.z) + this.cam.aim, STAGE.z - 2);
    return { x: STAGE.x, z: STAGE.z };
  }

  /** Screen position of the tank in slot `i`, for hanging a name plate over it. */
  screenPos(i, n, camera, out) {
    const s = this.spotOf(i, n);
    out.set(s.x, this.groundY(s.x, s.z) + 3.6, s.z);
    out.project(camera);
    return { x: (out.x * 0.5 + 0.5) * innerWidth, y: (-out.y * 0.5 + 0.5) * innerHeight, on: out.z < 1 };
  }
}
