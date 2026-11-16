// Человек из примитивов: плащ, капюшон, руки-ноги. Анимация процедурная (шаг, дыхание, поза).
import {
  BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, Object3D, SphereGeometry,
} from 'three';
import { damp } from '../core/rng';
import { darkify } from './darkness';

export interface HumanOpts { cloak: number; skin: number; height?: number; hood?: boolean; hunch?: number; hair?: number; bodyShadow?: boolean; child?: boolean }
export type Pose = 'stand' | 'sit' | 'lie';

export class Human {
  readonly root = new Group();
  readonly body = new Group();
  readonly armR = new Group();
  readonly armL = new Group();
  readonly hand = new Group();       // сюда вешается лампа/огарок
  private legL = new Group();
  private legR = new Group();
  readonly head: Mesh;
  private phase = 0;
  private walk = 0;                  // сглаженная доля ходьбы 0..1
  private pose: Pose = 'stand';
  private poseK = 0;                 // 0 — стоит, 1 — сидит
  private lieK = 0;                  // 1 — лежит на спине
  private hunch: number;
  carrying = false;
  /** 0..1 — говорит: кивает, поворачивает голову, жестикулирует свободной рукой */
  talk = 0;
  /** 0..1 — тьма утягивает вниз: фигура уходит в пол и заваливается */
  sink = 0;
  /** 0..1 — прикрывает лампу ладонью */
  shield = 0;
  /** 0..1 — доливает масло или разжигает: свободная рука у лампы */
  pour = 0;
  private talkK = 0; private shieldK = 0; private pourK = 0;

  constructor(opts: HumanOpts) {
    const cloakMat = darkify(new MeshStandardMaterial({ color: opts.cloak, roughness: 1, flatShading: true }));
    const skinMat = darkify(new MeshStandardMaterial({ color: opts.skin, roughness: 0.9, flatShading: true }));
    const darkMat = darkify(new MeshStandardMaterial({ color: 0x1c1815, roughness: 1, flatShading: true }));
    this.hunch = opts.hunch ?? 0;
    const sh = (m: Mesh, cast = opts.bodyShadow !== false) => { m.castShadow = cast; m.receiveShadow = true; return m; };

    const torso = sh(new Mesh(new CylinderGeometry(0.16, 0.3, 0.98, 7, 2), cloakMat));
    torso.position.y = 0.97;
    const shoulders = sh(new Mesh(new SphereGeometry(0.25, 7, 5), cloakMat));
    shoulders.scale.set(1, 0.45, 0.72);
    shoulders.position.y = 1.41;
    this.head = sh(new Mesh(new IcosahedronGeometry(0.145, 1), skinMat));
    this.head.position.set(0, 1.62, 0.02);
    this.body.add(torso, shoulders, this.head);
    if (opts.hood !== false) {
      const hood = sh(new Mesh(new SphereGeometry(0.185, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), cloakMat));
      hood.position.set(0, 1.63, -0.035);
      hood.rotation.x = -0.35;
      this.body.add(hood);
    } else {
      const hair = sh(new Mesh(new SphereGeometry(0.16, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), darkify(new MeshStandardMaterial({ color: opts.hair ?? 0x2a2018, roughness: 1, flatShading: true }))));
      hair.position.set(0, 1.635, -0.02);
      hair.rotation.x = -0.25;
      this.body.add(hair);
    }
    const mkArm = (g: Group, side: number) => {
      const arm = sh(new Mesh(new CylinderGeometry(0.055, 0.045, 0.56, 5), cloakMat));
      arm.position.y = -0.28;
      const fist = sh(new Mesh(new IcosahedronGeometry(0.05, 0), skinMat));
      fist.position.y = -0.58;
      g.add(arm, fist);
      g.position.set(0.245 * side, 1.38, 0);
      this.body.add(g);
    };
    mkArm(this.armL, -1);
    mkArm(this.armR, 1);
    this.hand.position.y = -0.6;
    this.armR.add(this.hand);
    const mkLeg = (g: Group, side: number) => {
      const leg = sh(new Mesh(new BoxGeometry(0.115, 0.54, 0.13), darkMat), true);
      leg.position.y = -0.27;
      g.add(leg);
      g.position.set(0.095 * side, 0.54, 0);
      this.root.add(g);
    };
    mkLeg(this.legL, -1);
    mkLeg(this.legR, 1);
    this.root.add(this.body);
    if (opts.child) { this.head.scale.setScalar(1.3); this.head.position.y += 0.03; }
    this.root.scale.setScalar((opts.height ?? 1.75) / 1.75);
  }

  setPose(p: Pose, instant = false): void {
    this.pose = p;
    if (instant) { this.poseK = p === 'sit' ? 1 : 0; this.lieK = p === 'lie' ? 1 : 0; }
  }
  get lying(): boolean { return this.lieK > 0.15; }

  attach(o: Object3D): void { this.hand.add(o); this.carrying = true; }

  /** speed01 — доля от полной скорости ходьбы. */
  update(dt: number, t: number, speed01: number): void {
    this.walk = damp(this.walk, speed01, 10, dt);
    this.poseK = damp(this.poseK, this.pose === 'sit' ? 1 : 0, 4, dt);
    this.lieK = damp(this.lieK, this.pose === 'lie' ? 1 : 0, 2.6, dt);
    this.root.rotation.x = -1.46 * this.lieK;
    this.root.position.y = 0.14 * this.lieK - 1.55 * this.sink;
    this.root.rotation.z = 0.5 * this.sink;
    this.phase += dt * (5.2 + 4.5 * this.walk) * (this.walk > 0.02 ? 1 : 0);
    const w = this.walk, s = Math.sin(this.phase), k = this.poseK;
    const breath = Math.sin(t * 1.7) * 0.012;
    this.legL.rotation.x = s * 0.75 * w * (1 - k) - 1.45 * k;
    this.legR.rotation.x = -s * 0.75 * w * (1 - k) - 1.3 * k;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.045 * w + breath - 0.5 * k;
    this.legL.position.y = this.legR.position.y = 0.54 - 0.42 * k;
    this.body.rotation.x = 0.07 * w + this.hunch + 0.25 * k;
    this.body.rotation.z = s * 0.035 * w;
    this.armL.rotation.x = -s * 0.55 * w + 0.05 - 0.5 * k;
    this.armL.rotation.z = -0.08;
    if (this.carrying) {
      const lift = -1.25 + Math.sin(t * 1.3) * 0.03 + s * 0.05 * w;
      this.armR.rotation.x = lift - this.body.rotation.x;
      this.armR.rotation.z = 0.42;
      // лампа висит отвесно и чуть качается на ходу
      this.hand.rotation.x = -lift - this.body.rotation.x + Math.sin(this.phase * 2 + 0.6) * 0.12 * w;
      this.hand.rotation.z = -0.42 + s * 0.1 * w;
    } else {
      this.armR.rotation.x = s * 0.55 * w + 0.05 - 0.5 * k;
      this.armR.rotation.z = 0.08;
    }
    // речь: видно, кто говорит — голова кивает и поворачивается, свободная рука жестикулирует, корпус подаётся вперёд
    this.talkK = damp(this.talkK, this.talk, 8, dt);
    this.shieldK = damp(this.shieldK, this.shield, 12, dt);
    this.pourK = damp(this.pourK, this.pour, 10, dt);
    const tk = this.talkK, syl = Math.sin(t * 11.3) * 0.5 + Math.sin(t * 7.1 + 1.7) * 0.5;
    this.head.rotation.x = -0.1 * k + tk * (0.08 + syl * 0.16);
    this.head.rotation.y = tk * Math.sin(t * 2.1) * 0.45;
    this.head.rotation.z = tk * Math.sin(t * 1.3 + 0.8) * 0.1;
    this.body.rotation.x += tk * (0.07 + Math.sin(t * 2.6) * 0.05);
    this.body.rotation.z += tk * Math.sin(t * 1.9) * 0.05;
    this.body.position.y += tk * Math.abs(syl) * 0.022;
    this.armL.rotation.x += tk * (-1.15 + syl * 0.45 + Math.sin(t * 3.1) * 0.3);
    this.armL.rotation.z += tk * (-0.38 + Math.sin(t * 2.3) * 0.3);
    if (!this.carrying) this.armR.rotation.x += tk * (-0.6 + Math.sin(t * 2.9 + 2) * 0.32);
    // ладонь над лампой / долив: левая рука тянется к правой, к пламени
    const hold = Math.max(this.shieldK, this.pourK);
    if (hold > 0.01) {
      this.armL.rotation.x += hold * (-1.15 - this.armL.rotation.x + Math.sin(t * 6) * 0.04 * this.pourK);
      this.armL.rotation.z += hold * (0.62 - this.armL.rotation.z);
      this.body.rotation.x += hold * 0.16;
      this.head.rotation.x += hold * 0.28;
    }
  }
}
