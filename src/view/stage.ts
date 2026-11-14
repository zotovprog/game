// Сцена, изометрическая камера, постобработка. Один на всё приложение.
import {
  ACESFilmicToneMapping, Color, DepthTexture, HalfFloatType, OrthographicCamera, PCFSoftShadowMap, Scene, ShaderMaterial, Vector2,
  Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { damp } from '../core/rng';
import { Style } from '../data/styles';
import { darkU } from './darkness';
import { VolumePass } from './volume';

const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new Vector2(1, 1) },
    uSat: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new Vector3(1, 1, 1) },
    uGrain: { value: 0.06 }, uVignette: { value: 0.5 }, uPressure: { value: 0 }, uChroma: { value: 0 }, uFade: { value: 0 },
    uCenter: { value: new Vector2(0.5, 0.5) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uSat, uContrast, uGrain, uVignette, uPressure, uChroma, uFade;
    uniform vec3 uTint; uniform vec2 uRes, uCenter; varying vec2 vUv;
    float h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      vec2 off = c * uChroma * (0.4 + dot(c, c) * 3.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat) * uTint;
      col = max((col - 0.18) * uContrast + 0.18, 0.0);
      // давление: тьма наползает с краёв кадра к лампе, край рваный и шевелится
      vec2 a = (uv - uCenter) * vec2(uRes.x / uRes.y, 1.0);
      float r = length(a);
      vec2 dir = a / max(r, 0.0001);                               // вместо угла: у atan есть шов
      float wob = n2(dir * 1.7 + vec2(uTime * 0.25, 3.0)) * 0.6 + n2(dir * 4.5 + vec2(9.0, uTime * 0.5)) * 0.4;
      float inner = mix(0.95, 0.16, uPressure) + (wob - 0.5) * mix(0.1, 0.22, uPressure);
      float vig = smoothstep(inner, inner + mix(0.75, 0.3, uPressure), r);
      col *= 1.0 - vig * mix(uVignette, 1.0, uPressure);
      float g = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 7.13) * 317.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col += g * uGrain * (0.25 + 0.75 * (1.0 - clamp(l * 2.0, 0.0, 1.0)));
      col *= 1.0 - uFade;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  readonly composer: EffectComposer;
  readonly grade: ShaderMaterial;
  readonly bloom: UnrealBloomPass;
  readonly volume: VolumePass;
  /** высота видимой области в метрах */
  viewH = 14.5;
  viewHTarget = 14.5;
  readonly target = new Vector3();
  /** направление от цели к камере */
  readonly camDir = new Vector3();
  readonly right = new Vector3();   // «вправо» на экране в плоскости пола
  readonly up = new Vector3();      // «вверх» на экране в плоскости пола
  shake = 0;
  pressure = 0; chroma = 0; fade = 0;
  readonly mobile: boolean;
  private t = 0;

  constructor(readonly canvas: HTMLCanvasElement, public style: Style) {
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new Color(0x000000);

    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const yaw = Math.PI / 4, elev = (44 * Math.PI) / 180;
    this.camDir.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev)).normalize();
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.up.set(-Math.sin(yaw), 0, -Math.cos(yaw));

    // глубина сцены нужна объёмной тьме: дым не должен течь сквозь камень
    const rt = new WebGLRenderTarget(4, 4, { type: HalfFloatType, depthTexture: new DepthTexture(4, 4) });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.volume = new VolumePass(this.camera, this.mobile ? 0.4 : 0.5, this.mobile ? 9 : 14);
    this.composer.addPass(this.volume);
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), style.bloom, 0.75, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    const gp = new ShaderPass(GRADE);
    this.grade = gp.material;
    this.composer.addPass(gp);
    this.applyStyle(style);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyStyle(s: Style): void {
    this.style = s;
    const u = this.grade.uniforms;
    u.uSat.value = s.sat; u.uContrast.value = s.contrast; (u.uTint.value as Vector3).set(...s.tint);
    u.uGrain.value = s.grain; u.uVignette.value = s.vignette;
    this.bloom.strength = s.bloom;
    darkU.uEdgeNoise.value = s.edgeNoise;
  }

  resize(): void {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.volume.setSize(w * pr, h * pr);
    (this.grade.uniforms.uRes.value as Vector2).set(w, h);
    this.updateCamera();
  }

  private updateCamera(): void {
    const aspect = innerWidth / innerHeight;
    // на узком экране (телефон в портрете) держим ширину обзора, а не высоту
    const vh = aspect < 1 ? this.viewH * 0.72 / aspect : this.viewH;
    this.camera.left = (-vh * aspect) / 2; this.camera.right = (vh * aspect) / 2;
    this.camera.top = vh / 2; this.camera.bottom = -vh / 2;
    this.camera.updateProjectionMatrix();
  }

  /** focus — куда смотрит камера (обычно герой), lampWorld — центр давления. */
  render(dt: number, focus: Vector3, lampWorld: Vector3): void {
    this.t += dt;
    this.target.x = damp(this.target.x, focus.x, 5, dt);
    this.target.y = damp(this.target.y, focus.y, 5, dt);
    this.target.z = damp(this.target.z, focus.z, 5, dt);
    this.viewH = damp(this.viewH, this.viewHTarget, 1.5, dt);
    this.updateCamera();
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sx = (Math.sin(this.t * 71) + Math.sin(this.t * 113)) * 0.5 * this.shake * 0.35;
    const sy = (Math.cos(this.t * 83) + Math.sin(this.t * 127)) * 0.5 * this.shake * 0.35;
    this.camera.position.copy(this.target).addScaledVector(this.camDir, 60).addScaledVector(this.right, sx);
    this.camera.position.y += sy;
    this.camera.lookAt(this.camera.position.x - this.camDir.x, this.camera.position.y - this.camDir.y, this.camera.position.z - this.camDir.z);
    this.camera.updateMatrixWorld();

    darkU.uTime.value = this.t;
    darkU.uCutPos.value.set(focus.x, 0.9, focus.z);
    darkU.uCutDir.value.copy(this.camDir);
    const u = this.grade.uniforms;
    this.volume.press = this.pressure;
    u.uTime.value = this.t; u.uPressure.value = this.pressure; u.uChroma.value = this.chroma; u.uFade.value = this.fade;
    const p = lampWorld.clone().project(this.camera);
    (u.uCenter.value as Vector2).set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    this.composer.render(dt);
  }
}
