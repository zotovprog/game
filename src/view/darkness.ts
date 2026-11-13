// «Живая тьма»: вшивается в материалы мира. Всё, до чего не дотягивается ни один источник
// света, уходит в чёрное; граница изъедена шумом, который ползёт внутрь круга.
import { Color, Material, Vector2, Vector3, Vector4 } from 'three';

export const DARK_MAX = 8;

export const darkU = {
  uTime: { value: 0 },
  uLights: { value: Array.from({ length: DARK_MAX }, () => new Vector4(0, 0, 0, 0)) }, // xyz + радиус
  uLightCount: { value: 0 },
  uDarkTint: { value: new Color(0x000000) },
  uVeins: { value: 0 },
  uEdgeNoise: { value: 0.55 },
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
uniform float uTime; uniform vec4 uLights[DARK_MAX]; uniform int uLightCount;
uniform vec3 uDarkTint; uniform float uVeins; uniform float uEdgeNoise; uniform vec2 uHeight;
uniform vec3 uCutPos; uniform vec3 uCutDir; uniform float uCutR;
varying vec3 vDarkPos;
${NOISE}
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
  float edge = d + (n2 - 0.5) * uEdgeNoise * smoothstep(0.3, 1.0, d);
  float lit = 1.0 - smoothstep(0.7, 1.0, edge);
  lit *= 1.0 - smoothstep(uHeight.x, uHeight.y, p.y);
  float vein = pow(n2, 2.2) * 4.0 * uVeins * (1.0 - lit) * exp(-max(d - 1.0, 0.0) * 0.55);
  return col * lit + uDarkTint * vein * 0.6;
}
`;

const CUT = /* glsl */ `
#ifdef DARK_CUT
{
  vec3 rel = vDarkPos - uCutPos;
  float along = dot(rel, uCutDir);
  float pd = length(rel - along * uCutDir);
  if (along > 0.45 && pd < uCutR) {
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (ign > smoothstep(0.5, 1.0, pd / uCutR)) discard;
  }
}
#endif
`;

/** Подключает тьму к стандартному материалу. cut — вырез вокруг героя (для стен). */
export function darkify<T extends Material>(mat: T, cut = false): T {
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
      .replace('#include <common>', `#include <common>\n${cut ? '#define DARK_CUT\n' : ''}${FRAG_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${CUT}`)
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb = darkApply(gl_FragColor.rgb, vDarkPos);\n#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => (cut ? 'dark-cut' : 'dark');
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
