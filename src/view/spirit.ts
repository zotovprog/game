// Дух: высокая фигура из дыма. В темноте виден только холодный контур и бледное лицо.
import {
  Color, Group, LatheGeometry, Mesh, MeshBasicMaterial, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, Vector2, NormalBlending, DoubleSide,
} from 'three';
import { makeGlow } from './glow';
import { Style } from '../data/styles';

const VERT = /* glsl */ `
uniform float uTime; uniform float uSeed; uniform float uAgit;
varying vec3 vN; varying float vY; varying vec3 vP;
void main(){
  vec3 p = position;
  float sway = (1.0 - smoothstep(0.0, 2.2, p.y));               // подол колышется сильнее
  float a = uTime*1.3 + uSeed*6.28;
  p.x += sin(p.y*3.1 + a) * (0.05 + 0.16*sway) * (1.0 + uAgit);
  p.z += cos(p.y*2.6 + a*1.2) * (0.05 + 0.16*sway) * (1.0 + uAgit);
  p.x += sin(p.y*11.0 + a*3.0) * 0.012 * (1.0 + 3.0*uAgit);
  vY = position.y; vP = p;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uRim; uniform float uRimI; uniform float uAlpha; uniform float uTime; uniform float uSeed; uniform float uBurn;
varying vec3 vN; varying float vY; varying vec3 vP;
float h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
void main(){
  float rim = pow(1.0 - abs(normalize(vN).z), 2.2);
  float smoke = n2(vec2(vP.x*3.0 + uSeed*10.0, vP.y*2.2 - uTime*0.5)) * 0.6 + n2(vec2(vP.z*7.0, vP.y*5.0 - uTime*0.9)) * 0.4;
  float foot = smoothstep(0.0, 1.5, vY);                          // у пола тает
  float body = 0.7 * foot * (0.65 + 0.35*smoke);
  float burn = smoothstep(1.0 - uBurn*1.3, 1.3 - uBurn*1.3, smoke + (1.0 - foot)*0.3); // свет выжигает дыры
  float alpha = clamp(body + rim*0.5, 0.0, 1.0) * uAlpha * (1.0 - burn);
  vec3 col = uRim * (rim * uRimI * (0.6 + 0.8*smoke));
  col += vec3(1.0, 0.45, 0.12) * burn * (1.0 - burn) * 3.0 * uBurn;   // тлеющая кромка
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}`;

let bodyGeo: LatheGeometry | null = null;
function geo(): LatheGeometry {
  if (bodyGeo) return bodyGeo;
  const prof: [number, number][] = [
    [0.0, 0.0], [0.1, 0.35], [0.19, 0.95], [0.19, 1.55], [0.27, 2.02], [0.23, 2.13], [0.07, 2.2],
    [0.06, 2.3], [0.125, 2.38], [0.14, 2.5], [0.1, 2.62], [0.0, 2.66],
  ];
  bodyGeo = new LatheGeometry(prof.map(([x, y]) => new Vector2(x, y)), 14);
  return bodyGeo;
}
const faceGeo = new SphereGeometry(1, 10, 8);

export class Spirit {
  readonly group = new Group();
  private mat: ShaderMaterial;
  private face3: Sprite;
  private faceColor: Color;
  private arms: Mesh[] = [];
  /** 0..1: насколько дух проявлен */
  alpha = 1;
  /** 0..1: как сильно его жжёт свет */
  burn = 0;
  agitation = 0;
  /** 0..1: насколько проступило лицо */
  face = 1;
  private holes: Mesh[] = [];

  constructor(style: Style, readonly seed: number, tall = 1) {
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: NormalBlending, side: DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: seed }, uAgit: { value: 0 }, uAlpha: { value: 1 }, uBurn: { value: 0 },
        uRim: { value: new Color(style.spiritRim) }, uRimI: { value: style.spiritRimI },
      },
    });
    const body = new Mesh(geo(), this.mat);
    body.scale.set(1, tall, 1);
    body.renderOrder = 5;
    this.group.add(body);
    for (const side of [-1, 1]) {            // длинные руки до колен
      const arm = new Mesh(geo(), this.mat);
      arm.scale.set(0.13, 0.66 * tall, 0.13);
      arm.position.set(0.3 * side, 0.42 * tall, 0.02);
      arm.renderOrder = 5;
      this.arms.push(arm);
      this.group.add(arm);
    }
    this.faceColor = new Color(style.spiritFace);
    this.face3 = makeGlow(style.spiritFace, 1, 1);
    this.face3.scale.set(0.34, 0.5, 1);
    this.face3.position.set(0, 2.42 * tall, 0.16);
    this.face3.renderOrder = 6;
    this.group.add(this.face3);
    const hole = new MeshBasicMaterial({ color: 0x000000 });
    for (const x of [-0.045, 0.045]) {
      const e = new Mesh(faceGeo, hole);
      e.scale.set(0.02, 0.03, 0.02);
      e.position.set(x, 2.45 * tall, 0.22);
      e.renderOrder = 7;
      this.holes.push(e);
      this.group.add(e);
    }
  }

  update(t: number): void {
    const u = this.mat.uniforms;
    u.uTime.value = t; u.uAlpha.value = this.alpha; u.uBurn.value = this.burn; u.uAgit.value = this.agitation;
    const vis = this.alpha * (1 - this.burn) * this.face;
    const f = vis * (0.2 + 0.05 * Math.sin(t * 2.3 + this.seed * 9));
    (this.face3.material as SpriteMaterial).color.copy(this.faceColor).multiplyScalar(f);
    this.holes.forEach((h) => { h.visible = vis > 0.55; });
    this.group.visible = this.alpha > 0.01;
    this.arms[0].rotation.z = 0.06 + Math.sin(t * 0.9 + this.seed) * 0.05;
    this.arms[1].rotation.z = -0.06 - Math.sin(t * 0.8 + this.seed * 2) * 0.05;
  }
}
