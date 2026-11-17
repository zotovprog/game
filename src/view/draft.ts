// Сквозняк: нити пыли текут над полом туда, куда тянет воздух, — к Вратам. Видны только в круге твоего света.
// Огибают углы вместе с ходом: по ним читается дорога, а перед порывом они срываются и летят быстрее.
import { AdditiveBlending, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three';
import { mulberry32 } from '../core/rng';
import { T } from '../data/tuning';

interface Thread { x: number; z: number; y: number; age: number; life: number; dx: number; dz: number; len: number; look: number }
interface Field { isFloor(x: number, z: number): boolean; flowDir(x: number, z: number, out: number[]): void }

export class Draft {
  readonly mesh: InstancedMesh;
  private threads: Thread[] = [];
  private alpha: InstancedBufferAttribute;
  private rng = mulberry32(911);
  private m = new Matrix4(); private q = new Quaternion(); private p = new Vector3(); private s = new Vector3();
  private flow = [0, 0];
  private static UP = new Vector3(0, 1, 0);

  constructor(color: number, private grid: Field, count: number) {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);                       // лежит в плоскости пола; uv.x — вдоль движения
    this.alpha = new InstancedBufferAttribute(new Float32Array(count), 1);
    this.alpha.setUsage(DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    const seed = new Float32Array(count); for (let i = 0; i < count; i++) seed[i] = this.rng();
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1));
    const mat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uColor: { value: new Color(color) }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aAlpha, aSeed; varying vec2 vUv; varying float vA, vSeed;
        void main(){ vUv = uv; vA = aAlpha; vSeed = aSeed; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying float vA, vSeed;
        void main(){
          float along = smoothstep(0.0, 0.8, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));     // голова ярче хвоста
          float wob = sin(vUv.x * 5.5 + vSeed * 40.0 - uTime * 2.4) * 0.17 * (1.0 - vUv.x * 0.6);   // прядь вьётся, а не чертит линию
          float across = 1.0 - min(1.0, abs(vUv.y - 0.5 - wob) * 3.2);
          float a = along * across * across * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    this.mesh = new InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) this.threads.push({ x: 0, z: 0, y: 0, age: 1, life: 0, dx: 0, dz: 0, len: 1, look: 0 });
  }

  /** px,pz — где огонь; radius — круг света; power — 0..1, насколько огонь жив; rush — 0..1, порыв близко. */
  update(t: number, dt: number, px: number, pz: number, radius: number, power: number, rush: number): void {
    (this.mesh.material as ShaderMaterial).uniforms.uTime.value = t;
    const D = T.draft, speed = D.speed * (1 + rush * D.gustRush), a = this.alpha.array as Float32Array;
    this.threads.forEach((th, i) => {
      if (th.age >= th.life) {                                   // новая нить — где-то в круге света, на полу
        const ang = this.rng() * 6.283, r = radius * Math.sqrt(this.rng()) * 0.92;
        th.x = px + Math.cos(ang) * r; th.z = pz + Math.sin(ang) * r;
        if (radius < 1.6 || !this.grid.isFloor(th.x, th.z)) { a[i] = 0; return; }
        th.y = 0.06 + this.rng() * 0.5; th.age = 0; th.look = 0;       // низко: пыль метёт по полу
        th.life = D.threadLife[0] + this.rng() * (D.threadLife[1] - D.threadLife[0]);
        th.len = D.threadLen[0] + this.rng() * (D.threadLen[1] - D.threadLen[0]);
        this.grid.flowDir(th.x, th.z, this.flow); th.dx = this.flow[0]; th.dz = this.flow[1];
      }
      th.age += dt * (1 + rush);
      if ((th.look -= dt) <= 0) {                                 // направление сверяем не каждый кадр
        th.look = 0.12 + this.rng() * 0.08;
        this.grid.flowDir(th.x, th.z, this.flow);
        const k = 0.55; th.dx += (this.flow[0] - th.dx) * k; th.dz += (this.flow[1] - th.dz) * k;
      }
      const l = Math.hypot(th.dx, th.dz);
      if (l < 0.05) { th.age = th.life; a[i] = 0; return; }
      th.x += (th.dx / l) * speed * dt; th.z += (th.dz / l) * speed * dt;
      if (!this.grid.isFloor(th.x, th.z)) { th.age = th.life; a[i] = 0; return; }
      const d = Math.hypot(th.x - px, th.z - pz) / Math.max(0.5, radius);
      const edge = 1 - Math.min(1, Math.max(0, (d - 0.5) / 0.42));
      a[i] = Math.sin(Math.PI * Math.min(1, th.age / th.life)) * edge * power * D.threadGain * (1 + rush * 0.8);
      this.q.setFromAxisAngle(Draft.UP, Math.atan2(-th.dz, th.dx));
      this.m.compose(this.p.set(th.x, th.y, th.z), this.q, this.s.set(th.len * (1 + rush * 0.7), 1, D.threadWidth));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }
}
