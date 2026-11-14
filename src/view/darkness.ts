// «Живая тьма»: вшивается в материалы мира. Всё, до чего не дотягивается ни один источник
// света, уходит в чёрное; граница изъедена шумом, который ползёт внутрь круга.
import { Material, Vector2, Vector3, Vector4 } from 'three';

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
uniform vec3 uCutPos; uniform vec3 uCutDir; uniform float uCutR;
varying vec3 vDarkPos;
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
vec3 darkApply(vec3 col, vec3 p){
  float d = 9.0;
  for (int i = 0; i < DARK_MAX; i++) {
    if (i >= uLightCount) break;
    vec4 L = uLights[i];
    d = min(d, length(p.xz - L.xz) / max(L.w, 0.001));
  }
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
  #ifndef DARK_TALL
  lit *= 1.0 - smoothstep(uHeight.x, uHeight.y, p.y);
  #endif
  return col * lit;
}
`;

const CUT = /* glsl */ `
#ifdef DARK_CUT
{
  vec3 rel = vDarkPos - uCutPos;
  float along = dot(rel, uCutDir);
  float pd = length(rel - along * uCutDir);
  if (vDarkPos.y > 0.55 && along > 0.45 && pd < uCutR) {
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (ign > smoothstep(0.5, 1.0, pd / uCutR)) discard;
  }
}
#endif
`;

/** Подключает тьму к стандартному материалу. cut — вырез вокруг героя (для стен). */
/** cut — вырез вокруг героя (стены); tall — без затухания по высоте (Врата); rock — фактура камня. */
export function darkify<T extends Material>(mat: T, cut = false, tall = false, rock = false): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, darkU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDarkPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 dkP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dkP = instanceMatrix * dkP;
        #endif
        vDarkPos = (modelMatrix * dkP).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${cut ? '#define DARK_CUT\n' : ''}${tall ? '#define DARK_TALL\n' : ''}${rock ? '#define DARK_ROCK\n' : ''}${FRAG_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${CUT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n#ifdef DARK_ROCK\n  diffuseColor.rgb = rockDetail(diffuseColor.rgb, vDarkPos);\n#endif`)
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb = darkApply(gl_FragColor.rgb, vDarkPos);\n#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => `dark${cut ? '-cut' : ''}${tall ? '-tall' : ''}${rock ? '-rock' : ''}`;
  return mat;
}

const _lights: { x: number; y: number; z: number; r: number }[] = [];
/** Сбросить список источников на кадр и добавлять заново через addDarkLight. */
export function beginDarkLights(): void { _lights.length = 0; }
export function addDarkLight(x: number, y: number, z: number, r: number): void {
  if (r > 0.01) _lights.push({ x, y, z, r });
}
/** Выбрать ближайшие к фокусу источники и записать в униформы. */
export function commitDarkLights(fx: number, fz: number): void {
  _lights.sort((a, b) => (a.x - fx) ** 2 + (a.z - fz) ** 2 - ((b.x - fx) ** 2 + (b.z - fz) ** 2));
  const n = Math.min(DARK_MAX, _lights.length);
  for (let i = 0; i < n; i++) darkU.uLights.value[i].set(_lights[i].x, _lights[i].y, _lights[i].z, _lights[i].r);
  darkU.uLightCount.value = n;
}
