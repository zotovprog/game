// «Живая тьма»: вшивается в материалы мира. Всё, до чего не дотягивается ни один источник
// света, уходит в чёрное; граница изъедена шумом, который ползёт внутрь круга.
import { Material, Texture, Vector2, Vector3, Vector4 } from 'three';

export const DARK_MAX = 12;
export const TEND_MAX = 6;

export const darkU = {
  uTime: { value: 0 },
  uLights: { value: Array.from({ length: DARK_MAX }, () => new Vector4(0, 0, 0, 0)) }, // xyz + радиус
  uLightCount: { value: 0 },
  uEdgeNoise: { value: 0.55 },
  uLobe: { value: 0.25 },                                   // насколько тьма «дышит» крупными языками
  uLamp: { value: new Vector2() },
  uTendrils: { value: Array.from({ length: TEND_MAX }, () => new Vector4(0, 0, 0, 0)) }, // xz кончика, ширина, сила
  uHeight: { value: new Vector2(1.4, 3.4) },
  uCutPos: { value: new Vector3() },
  uCutDir: { value: new Vector3(0, 1, 0) },
  uCutR: { value: 1.5 },
  uSwallow: { value: new Vector4(0, 0, 0, 0) },              // поглощение: x, z, радиус лужи тьмы, высота, до которой она поднялась
};

const NOISE = /* glsl */ `
float dkHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float dkNoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(dkHash(i), dkHash(i+vec2(1,0)), u.x), mix(dkHash(i+vec2(0,1)), dkHash(i+vec2(1,1)), u.x), u.y); }
float dkFbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<3;i++){ s+=dkNoise(p)*a; p=p*2.07+vec2(13.1,7.7); a*=0.5; } return s/0.875; }
`;

const FRAG_HEAD = /* glsl */ `
#define DARK_MAX ${DARK_MAX}
#define TEND_MAX ${TEND_MAX}
uniform float uLobe; uniform vec2 uLamp; uniform vec4 uTendrils[TEND_MAX];
uniform float uTime; uniform vec4 uLights[DARK_MAX]; uniform int uLightCount;
uniform float uEdgeNoise; uniform vec2 uHeight;
uniform vec3 uCutPos; uniform vec3 uCutDir; uniform float uCutR; uniform vec4 uSwallow;
varying vec3 vDarkPos;
#ifdef DARK_TRI
uniform sampler2D uTriWallC, uTriWallN, uTriGroundC, uTriGroundN;
uniform vec4 uTri;                 // плиток на метр: стена, пол; яркость; сила рельефа
varying vec3 vTriN;
#endif
${NOISE}
#ifdef DARK_ROCK
vec3 rockDetail(vec3 col, vec3 p){
  float g1 = dkFbm(p.xz * 2.3 + p.y * 1.9);                                    // пятна и крошка
  float g2 = dkNoise(p.xz * 9.0 + p.y * 7.0);                                  // зерно
  float strata = 0.5 + 0.5 * sin(p.y * 12.0 + dkFbm(p.xz * 0.8) * 8.0);        // слои породы на стенах
  float wallK = smoothstep(0.3, 0.9, p.y);
  float tone = mix(0.6 + 0.8 * g1, (0.58 + 0.42 * strata) * (0.7 + 0.65 * g1), wallK) * (0.85 + 0.3 * g2);
  float cr = abs(dkNoise(p.xz * 0.85 + 3.1) - 0.5);                            // трещины: тёмные линии по полу и стенам
  float cr2 = abs(dkNoise(p.xz * 2.1 + vec2(p.y * 1.3, 9.7)) - 0.5);
  tone *= (0.45 + 0.55 * smoothstep(0.0, 0.03, cr)) * (0.7 + 0.3 * smoothstep(0.0, 0.02, cr2));
  return col * tone;
}
#endif
float dkD = 9.0;        // до ближайшего света, в его радиусах (1 — на краю круга)
float dkRim = 1.0;      // затемнение у кромки выреза в стене
float dkDist(vec3 p){
  float d = 9.0;
  for (int i = 0; i < DARK_MAX; i++) {
    if (i >= uLightCount) break;
    vec4 L = uLights[i];
    d = min(d, length(p.xz - L.xz) / max(L.w, 0.001));
  }
  return d;
}
/** Дальше этого края шум уже не дотянется: там всегда чёрное, считать нечего. */
float dkFar(){ return 1.0 + 0.5 * uEdgeNoise + 0.35 * uLobe; }
vec3 darkApply(vec3 col, vec3 p){
  float d = dkD;
  vec2 q = p.xz * 0.42;
  float n = dkFbm(q + vec2(uTime*0.05, -uTime*0.035));
  float n2 = dkFbm(q*2.3 - vec2(uTime*0.09, uTime*0.06) + n*1.7);
  // крупные языки: тьма вдавливается в круг и отступает, как дыхание
  vec2 rl = p.xz - uLamp;
  vec2 rd = rl / max(length(rl), 0.0001);                    // направление вместо угла: без шва
  float lobe = dkNoise(rd * 1.5 + vec2(uTime * 0.11, uTime * 0.23)) * 0.6 + dkNoise(rd * 3.4 + vec2(7.0 - uTime * 0.17, uTime * 0.31)) * 0.4;
  float edge = d + ((n2 - 0.5) * uEdgeNoise + (lobe - 0.35) * uLobe) * smoothstep(0.3, 1.0, d);
  float lit = 1.0 - smoothstep(0.7, 1.0, edge);
  // щупальца: тьма тянется к лампе от тех, кто в ней живёт
  for (int i = 0; i < TEND_MAX; i++) {
    vec4 T = uTendrils[i];
    if (T.w <= 0.001) continue;
    vec2 dir = normalize(T.xy - uLamp + vec2(0.0001));
    vec2 rel = p.xz - T.xy;
    float along = dot(rel, dir);
    float perp = along < 0.0 ? length(rel) : abs(dot(rel, vec2(-dir.y, dir.x)));
    float wdt = T.z * (0.3 + 0.7 * smoothstep(0.0, 3.0, along)) * (0.75 + 0.6 * n2);
    lit *= 1.0 - (1.0 - smoothstep(wdt * 0.45, wdt, perp + (n - 0.5) * 0.35)) * T.w;
  }
  // тьма забирает: чёрная лужа под ногами и чернота, поднимающаяся по телу
  if (uSwallow.z > 0.0) {
    float sd = length(p.xz - uSwallow.xy) + (n - 0.5) * 0.35;
    float pool = 1.0 - smoothstep(uSwallow.z * 0.6, uSwallow.z, sd);
    float climb = 1.0 - smoothstep(uSwallow.w - 0.3, uSwallow.w + 0.05, p.y + (n2 - 0.5) * 0.3);
    lit *= 1.0 - pool * climb;
  }
  #ifndef DARK_TALL
  lit *= 1.0 - smoothstep(uHeight.x, uHeight.y, p.y);
  #endif
  // у самой кромки света всё стынет в холодный, нездешний тон — и только потом уходит в чёрное
  col = mix(col, col * vec3(0.5, 0.74, 1.5), smoothstep(0.42, 0.96, edge) * 0.9);
  return col * lit * dkRim;
}
`;

const CUT = /* glsl */ `
#ifdef DARK_CUT
{
  vec3 rel = vDarkPos - uCutPos;
  float along = dot(rel, uCutDir);
  float pd = length(rel - along * uCutDir);
  float k = smoothstep(0.55, 0.85, vDarkPos.y) * smoothstep(0.45, 0.8, along);
  if (k > 0.0) {
    float rr = uCutR * (0.72 + 0.34 * dkNoise(vDarkPos.xz * 1.6 + vDarkPos.y * 1.3)) * k;
    if (pd < rr) discard;
    dkRim = mix(1.0, smoothstep(rr, rr + 0.45, pd), k);
  }
}
#endif
`;

/** Всё, что заведомо в темноте, красится в чёрное сразу — без фактуры, света и теней. */
const EARLY = /* glsl */ `
dkD = dkDist(vDarkPos);
#ifdef DARK_TALL
if (dkD > dkFar()) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
#else
if (dkD > dkFar() || vDarkPos.y > uHeight.y) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
#endif
#ifdef DARK_ROCK
  diffuseColor.rgb = rockDetail(diffuseColor.rgb, vDarkPos);
#endif
#ifdef DARK_TRI
  // настоящая фактура: три проекции по осям мира, стена и пол — разные текстуры
  vec3 triN = normalize(vTriN);
  vec3 triW = pow(abs(triN), vec3(4.0)); triW /= (triW.x + triW.y + triW.z);
  vec3 triP = vDarkPos * uTri.x;
  vec2 triG = vDarkPos.xz * uTri.y;
  diffuseColor.rgb *= (texture2D(uTriWallC, triP.zy).rgb * triW.x + texture2D(uTriGroundC, triG).rgb * triW.y + texture2D(uTriWallC, triP.xy).rgb * triW.z) * uTri.z;
#endif
`;

/** Рельеф из карт нормалей тех же трёх проекций. */
const TRI_NORMAL = /* glsl */ `
#ifdef DARK_TRI
{
  vec3 tnx = texture2D(uTriWallN, triP.zy).xyz * 2.0 - 1.0;
  vec3 tny = texture2D(uTriGroundN, triG).xyz * 2.0 - 1.0;
  vec3 tnz = texture2D(uTriWallN, triP.xy).xyz * 2.0 - 1.0;
  tnx.xy *= uTri.w; tny.xy *= uTri.w; tnz.xy *= uTri.w;
  tnx = vec3(tnx.xy + triN.zy, abs(tnx.z) * triN.x);
  tny = vec3(tny.xy + triN.xz, abs(tny.z) * triN.y);
  tnz = vec3(tnz.xy + triN.xy, abs(tnz.z) * triN.z);
  vec3 triWN = normalize(tnx.zyx * triW.x + tny.xzy * triW.y + tnz.xyz * triW.z);
  normal = normalize((viewMatrix * vec4(triWN, 0.0)).xyz);
}
#endif
`;

/** Подключает тьму к стандартному материалу. cut — вырез вокруг героя (для стен). */
/** cut — вырез вокруг героя (стены); tall — без затухания по высоте (Врата); rock — фактура камня шумом; tri — фактура из текстур. */
export interface Tri { wallC: Texture; wallN: Texture; groundC: Texture; groundN: Texture; wall: number; ground: number; gain: number; bump: number }
let triId = 0;
export function darkify<T extends Material>(mat: T, cut = false, tall = false, rock = false, tri?: Tri): T {
  const triKey = tri ? `-tri${++triId}` : '';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, darkU);
    if (tri) Object.assign(shader.uniforms, {
      uTriWallC: { value: tri.wallC }, uTriWallN: { value: tri.wallN }, uTriGroundC: { value: tri.groundC }, uTriGroundN: { value: tri.groundN },
      uTri: { value: new Vector4(tri.wall, tri.ground, tri.gain, tri.bump) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDarkPos;${tri ? '\n#define DARK_TRI\nvarying vec3 vTriN;' : ''}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 dkP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dkP = instanceMatrix * dkP;
        #endif
        vDarkPos = (modelMatrix * dkP).xyz;
        #ifdef DARK_TRI
          vec3 dkN = objectNormal;
          #ifdef USE_INSTANCING
            dkN = mat3(instanceMatrix) * dkN;
          #endif
          vTriN = normalize(mat3(modelMatrix) * dkN);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${cut ? '#define DARK_CUT\n' : ''}${tall ? '#define DARK_TALL\n' : ''}${rock ? '#define DARK_ROCK\n' : ''}${tri ? '#define DARK_TRI\n' : ''}${FRAG_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${CUT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${EARLY}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${TRI_NORMAL}`)
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb = darkApply(gl_FragColor.rgb, vDarkPos);\n#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => `dark${cut ? '-cut' : ''}${tall ? '-tall' : ''}${rock ? '-rock' : ''}${triKey}`;
  return mat;
}

const _lights: { x: number; y: number; z: number; r: number }[] = [];
/** Сбросить список источников на кадр и добавлять заново через addDarkLight. */
export function beginDarkLights(): void { _lights.length = 0; }
export function addDarkLight(x: number, y: number, z: number, r: number): void {
  if (r > 0.01) _lights.push({ x, y, z, r });
}
/** Выбрать ближайшие к фокусу источники и записать в униформы. */
export function commitDarkLights(fx: number, fz: number, view = 26): void {
  for (let i = _lights.length - 1; i >= 0; i--) {
    const l = _lights[i];
    if (Math.hypot(l.x - fx, l.z - fz) > view + l.r * 1.5) _lights.splice(i, 1);
  }
  _lights.sort((a, b) => (a.x - fx) ** 2 + (a.z - fz) ** 2 - ((b.x - fx) ** 2 + (b.z - fz) ** 2));
  const n = Math.min(DARK_MAX, _lights.length);
  for (let i = 0; i < n; i++) darkU.uLights.value[i].set(_lights[i].x, _lights[i].y, _lights[i].z, _lights[i].r);
  darkU.uLightCount.value = n;
}
