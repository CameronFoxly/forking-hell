import Phaser from 'phaser';
import { monitorUniforms } from './crt-math';
import type { EffectView } from './crt-math';
import type { Tuning } from './tuning';

export const CRT_SHADER = `
precision highp float;
#pragma phaserTemplate(fragmentDefine)
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
    if (uThreshold >= 1.0) return vec3(0.0);
    vec3 color = source(uv).rgb;
    return color * smoothstep(uThreshold, min(1.0, uThreshold + 0.15), max(color.r, max(color.g, color.b)));
}
vec3 glowRing(vec2 uv, vec2 offset) {
    return (emission(uv + vec2(offset.x, 0.0)) + emission(uv - vec2(offset.x, 0.0)) +
        emission(uv + vec2(0.0, offset.y)) + emission(uv - vec2(0.0, offset.y))) * 0.25;
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
    vec3 color = center.rgb;
    if (uOptical > 0.0 && treatment > 0.0) {
        vec2 shift = separation * uResolution;
        float distance = max(abs(shift.x), abs(shift.y));
        vec2 stride = separation / max(distance, 0.00001);
        // Wide settings compile separately, keeping the default path at seven samples.
#if WIDE_OPTICAL
        float whole = floor(distance);
        vec3 nearColor = vec3(source(warped + stride * whole).r, center.g, source(warped - stride * whole).b);
        color.r = mix(nearColor.r, source(warped + stride * (whole + 1.0)).r, fract(distance));
        color.b = mix(nearColor.b, source(warped - stride * (whole + 1.0)).b, fract(distance));
#else
        color.r = mix(center.r, source(warped + stride).r, distance);
        color.b = mix(center.b, source(warped - stride).b, distance);
#endif
    }
    vec2 stepUV = vec2(uGlowRadius) / uResolution;
    vec3 glow = glowRing(warped, stepUV);
#if WIDE_GLOW
    vec3 softGlow = glowRing(warped, stepUV / 3.0) * 0.5 +
        glowRing(warped, stepUV * 2.0 / 3.0) / 3.0 + glow / 6.0;
    glow = mix(glow, softGlow, min(1.0, (uGlowRadius - 3.0) / 3.0));
#endif
    color += (1.0 - color) * glow * uGlow * treatment;
    float line = 0.5 + 0.5 * cos(6.28318530718 * (uv.y * uResolution.y - 0.5) / uScanPeriod);
    color *= 1.0 - uScanline * treatment * line;
    gl_FragColor = vec4(color, center.a);
}`;

class CrtController extends Phaser.Filters.Controller {
  uniforms: ReturnType<typeof monitorUniforms> | null = null;
}
class CrtNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super('ForkCrt', manager, undefined, CRT_SHADER, [{
      name: 'crt-range-00', tags: ['crt-range'], additions: { fragmentDefine: '#define WIDE_OPTICAL 0\n#define WIDE_GLOW 0' },
    }]);
  }
  updateShaderConfig(controller: Phaser.Filters.Controller): void {
    if (!(controller instanceof CrtController) || !controller.uniforms) throw new Error('CRT controller has not received a viewport.');
    const u = controller.uniforms;
    const optical = Number(u.optical * Math.max(...u.resolution) / Math.hypot(...u.cssSize) > 1);
    const glow = Number(u.glow > 0 && u.glowRadius > 3);
    const variant = this.programManager.getAdditionsByTag('crt-range')[0]!;
    variant.name = `crt-range-${optical}${glow}`;
    variant.additions = { fragmentDefine: `#define WIDE_OPTICAL ${optical}\n#define WIDE_GLOW ${glow}` };
  }
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

export const CRT_BUDGET_NOTICE = 'CRT monitor effects are off at this canvas size to stay within the GPU budget. World pixels and motion effects are unchanged. Reduce the viewport size to restore CRT.';

export function attachCrt(scene: Phaser.Scene, report: (message: string) => void = console.warn, clearReport?: (message: string) => void) {
  const renderer = scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) throw new Error('CRT effects require the existing WebGL renderer.');
  if (!nodes.has(renderer.renderNodes)) {
    const node = new CrtNode(renderer.renderNodes); renderer.renderNodes.addNode('ForkCrt', node); nodes.set(renderer.renderNodes, node);
  }
  const controller = new CrtController(scene.cameras.main, 'ForkCrt');
  controller.active = false; controller.ignoreDestroy = true;
  const filters = scene.cameras.main.filters.internal;
  const maxDimension = Math.min(4096, Number(renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE)));
  let suspended = false, warned = false, budgetBlocked = false;
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
      budgetBlocked = !fits && !!config.enabled;
      if (budgetBlocked && !warned) {
        report(CRT_BUDGET_NOTICE);
        warned = true;
      }
      if (!budgetBlocked && warned) { clearReport?.(CRT_BUDGET_NOTICE); warned = false; }
      activate(!suspended && fits && controller.uniforms.active);
    },
    suspend(): void { suspended = true; activate(false); },
    get active(): boolean { return controller.active; },
    get budgetBlocked(): boolean { return budgetBlocked; },
    get uniforms(): ReturnType<typeof monitorUniforms> | null { return controller.uniforms; },
  };
}
