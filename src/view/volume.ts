// Объёмная тьма: лучи камеры идут сквозь слой клубящегося дыма над полом.
// За краем света дым стоит стеной, по полу затекает в круг, свет лампы рассеивается на его
// внутренней стороне — поэтому видно, как тьма шевелится. Чем меньше свет, тем она выше и ближе.
import {
  Data3DTexture, HalfFloatType, LinearFilter, OrthographicCamera, RedFormat, RepeatWrapping, ShaderMaterial, Vector3,
  WebGLRenderer, WebGLRenderTarget,
} from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { mulberry32 } from '../core/rng';
import { DARK_MAX, darkU, TEND_MAX } from './darkness';

export const GLOW_MAX = 4;

/** Зацикленный гладкий 3D-шум: решётка 16³, по 4 текселя на ячейку. */
function noiseTexture(): Data3DTexture {
  const L = 16, K = 4, N = L * K, rng = mulberry32(4242);
  const lat = new Float32Array(L * L * L);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const at = (x: number, y: number, z: number) => lat[(((z % L) + L) % L) * L * L + (((y % L) + L) % L) * L + (((x % L) + L) % L)];
  const data = new Uint8Array(N * N * N);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / K, fy = y / K, fz = z / K, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const u = s(fx - ix), v = s(fy - iy), w = s(fz - iz);
    const m = (a: number, b: number, t: number) => a + (b - a) * t;
    const val = m(
      m(m(at(ix, iy, iz), at(ix + 1, iy, iz), u), m(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), u), v),
      m(m(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), u), m(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), u), v), w);
    data[z * N * N + y * N + x] = Math.round(val * 255);
  }
  const tex = new Data3DTexture(data, N, N, N);
  tex.format = RedFormat;
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fogFrag = (steps: number) => /* glsl */ `
precision highp sampler3D;
#define STEPS ${steps}
#define DARK_MAX ${DARK_MAX}
#define TEND_MAX ${TEND_MAX}
#define GLOW_MAX ${GLOW_MAX}
uniform sampler2D tDepth; uniform sampler3D uNoise;
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd;
uniform float uNear, uFar, uTime, uPress, uTop, uSigma, uAlbedo, uHaze, uBillow;
uniform vec4 uLights[DARK_MAX]; uniform int uLightCount;
uniform vec4 uTendrils[TEND_MAX]; uniform vec2 uLamp;
uniform vec3 uGlowPos[GLOW_MAX]; uniform vec3 uGlowCol[GLOW_MAX]; uniform float uGlowDist[GLOW_MAX];
varying vec2 vUv;

float noise(vec3 p){ return texture(uNoise, p / 16.0).r; }

void main(){
  float depth = texture2D(tDepth, vUv).r;
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ro = uCamPos + uCamRight * ndc.x + uCamUp * ndc.y;
  float tScene = uNear + depth * (uFar - uNear);
  float top = uTop + uPress * 0.9;
  float t0 = max((top - ro.y) / uCamFwd.y, 0.0);
  float t1 = min((0.0 - ro.y) / uCamFwd.y, tScene);
  vec3 scat = vec3(0.0);
  float T = 1.0;
  if (t1 > t0) {
    float ds = (t1 - t0) / float(STEPS);
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + uCamFwd * (t0 + (float(i) + jit) * ds);
      // насколько точка далеко от ближайшего света (1 — на границе круга)
      float dn = 9.0;
      for (int k = 0; k < DARK_MAX; k++) { if (k >= uLightCount) break; vec4 L = uLights[k]; dn = min(dn, length(p.xz - L.xz) / max(L.w, 0.001)); }
      if (dn > 1.45) { T = 0.0; break; }                        // глубокая тьма: дальше смотреть не на что
      vec3 q = p * vec3(0.3, 0.42, 0.3);
      float n = noise(q + vec3(uTime * 0.05, -uTime * 0.085, -uTime * 0.04)) * 0.62
              + noise(q * 2.7 + vec3(-uTime * 0.1, -uTime * 0.15, uTime * 0.07)) * 0.38;
      // волны идут по дыму внутрь, к лампе; при малом свете — чаще и глубже
      float surge = sin(dn * 7.0 - uTime * (0.8 + uPress * 1.4) + n * 6.0) * 0.5 + 0.5;
      float edge = dn + (n - 0.5) * uBillow - surge * (0.07 + 0.16 * uPress) * smoothstep(0.35, 1.0, dn);
      float wall = smoothstep(0.64, 1.0, edge);
      // со стороны камеры стена низкая (иначе закроет героя), с дальней — нависает
      vec2 rl = p.xz - uLamp;
      float facing = dot(rl / max(length(rl), 0.001), vec2(0.7071));
      float hLim = mix(top, 0.5 + 0.35 * uPress, smoothstep(-0.3, 0.7, facing));
      wall *= 1.0 - smoothstep(0.5, 1.0, p.y / hLim + (n - 0.5) * 0.6);
      // позёмка: по полу тьма затекает глубже в круг
      float creep = smoothstep(0.34 - 0.14 * uPress, 0.9, dn + (n - 0.5) * 0.7) * (1.0 - smoothstep(0.0, 0.45 + 0.5 * uPress, p.y)) * (0.4 + 0.6 * uPress);
      float rho = max(wall, creep);
      // языки: тьма тянется к лампе
      for (int k = 0; k < TEND_MAX; k++) {
        vec4 Tn = uTendrils[k];
        if (Tn.w <= 0.001) continue;
        vec2 dir = normalize(Tn.xy - uLamp + vec2(0.0001));
        vec2 rel = p.xz - Tn.xy;
        float along = dot(rel, dir);
        float perp = along < 0.0 ? length(rel) : abs(dot(rel, vec2(-dir.y, dir.x)));
        float wdt = Tn.z * (0.35 + 0.65 * smoothstep(0.0, 3.0, along));
        float body = (1.0 - smoothstep(wdt * 0.45, wdt, perp + (n - 0.5) * 0.5)) * Tn.w * (1.0 - smoothstep(0.4, 1.3 + max(along, 0.0) * 0.5, p.y));
        rho = max(rho, body);
      }
      rho += uHaze;
      float a = exp(-rho * uSigma * ds);
      // свет на дыме: лампа и живые огни
      vec3 Li = vec3(0.0);
      for (int k = 0; k < GLOW_MAX; k++) {
        vec3 v = uGlowPos[k] - p;
        float d2 = dot(v, v);
        Li += uGlowCol[k] / (1.0 + d2 * 0.5) * (1.0 - smoothstep(uGlowDist[k] * 0.45, uGlowDist[k], sqrt(d2)));
      }
      scat += T * (1.0 - a) * Li * uAlbedo;
      T *= a;
      if (T < 0.02) { T = 0.0; break; }
    }
  }
  gl_FragColor = vec4(scat, T);
}`;

const COMP = /* glsl */ `
uniform sampler2D tDiffuse, tFog; varying vec2 vUv;
void main(){
  vec4 f = texture2D(tFog, vUv);
  gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * f.a + f.rgb, 1.0);
}`;

export class VolumePass extends Pass {
  private low: WebGLRenderTarget;
  private fog: ShaderMaterial;
  private comp: ShaderMaterial;
  private quad: FullScreenQuad;
  private right = new Vector3(); private up = new Vector3();
  /** сила света лампы и огней на дыме: позиция, цвет×яркость, дальность */
  readonly glowPos = Array.from({ length: GLOW_MAX }, () => new Vector3());
  readonly glowCol = Array.from({ length: GLOW_MAX }, () => new Vector3());
  readonly glowDist = new Array<number>(GLOW_MAX).fill(0);
  press = 0;

  constructor(private camera: OrthographicCamera, private scale: number, steps: number) {
    super();
    this.low = new WebGLRenderTarget(4, 4, { type: HalfFloatType, depthBuffer: false });
    this.low.texture.minFilter = this.low.texture.magFilter = LinearFilter;
    this.fog = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: fogFrag(steps), depthTest: false, depthWrite: false,
      uniforms: {
        tDepth: { value: null }, uNoise: { value: noiseTexture() },
        uCamPos: { value: new Vector3() }, uCamRight: { value: new Vector3() }, uCamUp: { value: new Vector3() }, uCamFwd: { value: new Vector3() },
        uNear: { value: 0.1 }, uFar: { value: 200 }, uTime: darkU.uTime, uPress: { value: 0 },
        uTop: { value: 3.3 }, uSigma: { value: 3.2 }, uAlbedo: { value: 0.11 }, uHaze: { value: 0.012 }, uBillow: { value: 0.5 },
        uLights: darkU.uLights, uLightCount: darkU.uLightCount, uTendrils: darkU.uTendrils, uLamp: darkU.uLamp,
        uGlowPos: { value: this.glowPos }, uGlowCol: { value: this.glowCol }, uGlowDist: { value: this.glowDist },
      },
    });
    this.comp = new ShaderMaterial({ vertexShader: VERT, fragmentShader: COMP, depthTest: false, depthWrite: false, uniforms: { tDiffuse: { value: null }, tFog: { value: this.low.texture } } });
    this.quad = new FullScreenQuad(this.fog);
  }

  setSize(w: number, h: number): void {
    this.low.setSize(Math.max(2, Math.round(w * this.scale)), Math.max(2, Math.round(h * this.scale)));
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const c = this.camera, u = this.fog.uniforms, e = c.matrixWorld.elements;
    this.right.set(e[0], e[1], e[2]).multiplyScalar((c.right - c.left) / 2);
    this.up.set(e[4], e[5], e[6]).multiplyScalar((c.top - c.bottom) / 2);
    (u.uCamPos.value as Vector3).setFromMatrixPosition(c.matrixWorld);
    (u.uCamRight.value as Vector3).copy(this.right); (u.uCamUp.value as Vector3).copy(this.up);
    (u.uCamFwd.value as Vector3).set(-e[8], -e[9], -e[10]);
    u.uNear.value = c.near; u.uFar.value = c.far; u.uPress.value = this.press;
    u.tDepth.value = readBuffer.depthTexture;
    this.quad.material = this.fog;
    renderer.setRenderTarget(this.low);
    this.quad.render(renderer);
    this.comp.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.comp;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void { this.low.dispose(); this.fog.dispose(); this.comp.dispose(); this.quad.dispose(); }
}
