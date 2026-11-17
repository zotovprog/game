// Пылинки в воздухе: видны только там, где на них падает свет лампы.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector2, Vector3 } from 'three';
import { mulberry32 } from '../core/rng';
import { T } from '../data/tuning';

export class Dust {
  readonly points: Points;
  private mat: ShaderMaterial;
  constructor(color: number, count = 260, readonly range = 9) {
    const rng = mulberry32(77);
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rng() - 0.5) * 2 * range; pos[i * 3 + 1] = rng() * 2.6; pos[i * 3 + 2] = (rng() - 0.5) * 2 * range;
      seed[i] = rng();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    this.mat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uLamp: { value: new Vector3() }, uRadius: { value: 5 }, uColor: { value: new Color(color) }, uPx: { value: 2 }, uRange: { value: range }, uPower: { value: 1 }, uDrift: { value: new Vector2() }, uDir: { value: new Vector2(1, 0) }, uWind: { value: 0 }, uStretch: { value: 3 }, uLong: { value: 1 }, uGain: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uRadius, uPx, uRange, uPower, uWind, uLong; uniform vec3 uLamp; uniform vec2 uDrift; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime*0.21 + aSeed*40.0)*0.6; p.z += cos(uTime*0.17 + aSeed*31.0)*0.6; p.y += sin(uTime*0.3 + aSeed*17.0)*0.25;
          p.xz += uDrift;
          p.xz = mod(p.xz - uLamp.xz + uRange, 2.0*uRange) - uRange + uLamp.xz;   // рой следует за лампой
          float d = distance(p, uLamp) / uRadius;
          vA = (1.0 - smoothstep(0.15, 0.85, d)) * (0.25 + 0.75*fract(aSeed*7.3)) * uPower;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          gl_PointSize = uPx * (0.6 + aSeed) * mix(1.0, uLong, uWind);      // на сквозняке пылинка — длинная нить
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec2 uDir; uniform float uWind, uStretch, uGain; varying float vA;
        void main(){
          // пылинка вытянута вдоль сквозняка: видно, куда тянет
          vec2 c = gl_PointCoord - 0.5; c.y = -c.y;
          float along = dot(c, uDir), across = dot(c, vec2(-uDir.y, uDir.x));
          float k = mix(1.0, uStretch, uWind);
          float body = smoothstep(0.5, 0.0, length(vec2(along, across * k)));
          float comet = mix(1.0, smoothstep(-1.0, 0.55, along * 2.0), uWind);      // голова ярче хвоста: видно, в какую сторону несёт
          float a = body * comet * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * a * mix(0.7, uGain, uWind), a);
        }`,
    });
    this.points = new Points(geo, this.mat);
    this.points.frustumCulled = false;
  }
  /** drift — накопленный снос сквозняком (м). */
  /** dirX/dirY — куда тянет сквозняк на экране; wind — 0..1, насколько он силён. */
  update(t: number, lamp: Vector3, radius: number, power: number, px: number, driftX = 0, driftZ = 0, dirX = 1, dirY = 0, wind = 0): void {
    const u = this.mat.uniforms;
    const l = Math.hypot(dirX, dirY);
    if (l > 0.01) (u.uDir.value as Vector2).set(dirX / l, dirY / l);
    u.uWind.value = Math.min(1, wind); u.uStretch.value = T.draft.stretch; u.uLong.value = T.draft.long; u.uGain.value = T.draft.gain;
    (u.uDrift.value as Vector2).set(driftX, driftZ);
    u.uTime.value = t; (u.uLamp.value as Vector3).copy(lamp); u.uRadius.value = radius; u.uPower.value = power; u.uPx.value = px;
  }
}
