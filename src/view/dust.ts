// Пылинки в воздухе: видны только там, где на них падает свет лампы.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';
import { mulberry32 } from '../core/rng';

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
      uniforms: { uTime: { value: 0 }, uLamp: { value: new Vector3() }, uRadius: { value: 5 }, uColor: { value: new Color(color) }, uPx: { value: 2 }, uRange: { value: range }, uPower: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uRadius, uPx, uRange, uPower; uniform vec3 uLamp; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime*0.21 + aSeed*40.0)*0.6; p.z += cos(uTime*0.17 + aSeed*31.0)*0.6; p.y += sin(uTime*0.3 + aSeed*17.0)*0.25;
          p.xz = mod(p.xz - uLamp.xz + uRange, 2.0*uRange) - uRange + uLamp.xz;   // рой следует за лампой
          float d = distance(p, uLamp) / uRadius;
          vA = (1.0 - smoothstep(0.15, 0.85, d)) * (0.25 + 0.75*fract(aSeed*7.3)) * uPower;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          gl_PointSize = uPx * (0.6 + aSeed);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor * a * 0.55, a); }`,
    });
    this.points = new Points(geo, this.mat);
    this.points.frustumCulled = false;
  }
  update(t: number, lamp: Vector3, radius: number, power: number, px: number): void {
    const u = this.mat.uniforms;
    u.uTime.value = t; (u.uLamp.value as Vector3).copy(lamp); u.uRadius.value = radius; u.uPower.value = power; u.uPx.value = px;
  }
}
