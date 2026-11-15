import Phaser from 'phaser';
import { monitorUniforms } from './crt-math';
import type { EffectView } from './crt-math';
import type { Tuning } from './tuning';

export const CRT_SHADER = `
precision highp float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform vec2 uCssSize;
uniform float uOptical;
uniform float uScanline;
uniform float uScanPeriod;
uniform float uGlow;
uniform float uGlowRadius;
uniform float uThreshold;
uniform float uCurvature;
uniform float uHud;
uniform float uSplash;
varying vec2 outTexCoord;
vec4 source(vec2 uv) {
    vec2 halfPixel = 0.5 / uResolution;
    return texture2D(uMainSampler, clamp(uv, halfPixel, 1.0 - halfPixel));
}
vec3 emission(vec2 uv) {
    vec3 color = source(uv).rgb;
    return color * smoothstep(uThreshold, min(1.0, uThreshold + 0.15), max(color.r, max(color.g, color.b)));
}
void main() {
    vec2 uv = outTexCoord;
    float worldBand = smoothstep(0.27, 0.31, uv.y) * (1.0 - smoothstep(0.83, 0.87, uv.y));
    float treatment = mix(uHud, 1.0, worldBand * (1.0 - uSplash));
    vec2 p = uv * 2.0 - 1.0;
    float radius2 = dot(p, p) * 0.5;
    vec2 warped = 0.5 + p * 0.5 * (1.0 + uCurvature * radius2 * treatment);
    vec2 radial = p * uCssSize / length(uCssSize);
    vec2 separation = radial * radius2 * uOptical * treatment / uCssSize;
    vec4 center = source(warped);
    vec3 color = vec3(source(warped + separation).r, center.g, source(warped - separation).b);
    vec2 stepUV = vec2(uGlowRadius) / uResolution;
    vec3 glow = (emission(warped + vec2(stepUV.x, 0.0)) +
        emission(warped - vec2(stepUV.x, 0.0)) +
        emission(warped + vec2(0.0, stepUV.y)) +
        emission(warped - vec2(0.0, stepUV.y))) * 0.25;
    color += (1.0 - color) * glow * uGlow * treatment;
    float line = 0.5 + 0.5 * cos(6.28318530718 * (uv.y * uResolution.y - 0.5) / uScanPeriod);
    color *= 1.0 - uScanline * treatment * line;
    gl_FragColor = vec4(color, center.a);
}`;

class CrtController extends Phaser.Filters.Controller {
  uniforms: ReturnType<typeof monitorUniforms> | null = null;
}
class CrtNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) { super('ForkCrt', manager, undefined, CRT_SHADER); }
  setupUniforms(controller: Phaser.Filters.Controller): void {
    if (!(controller instanceof CrtController) || !controller.uniforms) throw new Error('CRT controller has not received a viewport.');
    const u = controller.uniforms;
    for (const [key, value] of Object.entries({
      uResolution: u.resolution, uCssSize: u.cssSize, uOptical: u.optical,
      uScanline: u.scanline, uScanPeriod: u.scanPeriod, uGlow: u.glow,
      uGlowRadius: u.glowRadius, uThreshold: u.threshold, uCurvature: u.curvature, uHud: u.hud, uSplash: u.splash,
    })) this.programManager.setUniform(key, value);
  }
}
const nodes = new WeakMap<Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager, CrtNode>();

export function attachCrt(scene: Phaser.Scene, report: (message: string) => void = console.warn) {
  const renderer = scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) throw new Error('CRT effects require the existing WebGL renderer.');
  if (!nodes.has(renderer.renderNodes)) {
    const node = new CrtNode(renderer.renderNodes); renderer.renderNodes.addNode('ForkCrt', node); nodes.set(renderer.renderNodes, node);
  }
  const controller = new CrtController(scene.cameras.main, 'ForkCrt');
  controller.active = false; controller.ignoreDestroy = true;
  const filters = scene.cameras.main.filters.internal;
  const maxDimension = Math.min(4096, Number(renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE)));
  let suspended = false, warned = false;
  const activate = (active: boolean): void => {
    if (controller.active === active) return;
    controller.active = active;
    if (active) filters.add(controller); else filters.remove(controller);
  };
  scene.events.once('shutdown', () => { activate(false); controller.destroy(); });
  return {
    update(config: Tuning['crt'], view: EffectView): void {
      controller.uniforms = monitorUniforms(config, view);
      const fits = view.width <= maxDimension && view.height <= maxDimension && view.width * view.height <= 3840 * 2160;
      if (!fits && config.enabled && !warned) {
        report('CRT monitor effects are off at this canvas size to stay within the GPU budget. World pixels and motion effects are unchanged. Reduce the viewport size to restore CRT.');
        warned = true;
      }
      if (fits) warned = false;
      activate(!suspended && fits && controller.uniforms.active);
    },
    suspend(): void { suspended = true; activate(false); },
    get active(): boolean { return controller.active; },
  };
}
