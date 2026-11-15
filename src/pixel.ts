import Phaser from 'phaser';

export const WIDTH = 480;
export const HEIGHT = 270;
export const COLORS = {
  ink: 0x14102b, deep: 0x221943, shadow: 0x352558, muted: 0x6951a6,
  violet: 0xa17be3, pale: 0xd5b0ff, cyan: 0x75f6ec, white: 0xf5ecff,
  gold: 0xffd394, danger: 0xff799d,
};

const shader = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
varying vec2 outTexCoord;
vec3 best;
float closest;
void candidate(vec3 source, vec3 color) {
    float d = dot(source - color, source - color);
    if (d < closest) { closest = d; best = color; }
}
void main() {
    vec2 uv = (floor(outTexCoord * uResolution) + 0.5) / uResolution;
    vec4 texel = texture2D(uMainSampler, uv);
    closest = 100.0;
    ${Object.values(COLORS).map(c => `candidate(texel.rgb, vec3(${(c >> 16) & 255}.0, ${(c >> 8) & 255}.0, ${c & 255}.0) / 255.0);`).join('\n')}
    gl_FragColor = vec4(best, texel.a);
}`;

class PaletteNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  runs = 0;
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super('ForkPalette', manager, undefined, shader);
  }
  setupUniforms(_controller: Phaser.Filters.Controller, context: Phaser.Renderer.WebGL.DrawingContext): void {
    this.runs++;
    this.programManager.setUniform('uResolution', [context.width, context.height]);
  }
}

export function applyPixelComposition(scene: Phaser.Scene): PaletteNode {
  const renderer = scene.game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) throw new Error('WebGL is required for the shared pixel-composition shader.');
  const node = new PaletteNode(renderer.renderNodes);
  renderer.renderNodes.addNode('ForkPalette', node);
  scene.cameras.main.filters.external.add(new Phaser.Filters.Controller(scene.cameras.main, 'ForkPalette'));
  scene.cameras.main.setRoundPixels(true);
  return node;
}

export function fitCanvas(canvas: HTMLCanvasElement, viewport: HTMLElement): { scale: number; dpr: number; fits: boolean } {
  const dpr = window.devicePixelRatio || 1;
  const rect = viewport.getBoundingClientRect();
  const scale = Math.max(1, Math.floor(Math.min(rect.width * dpr / WIDTH, rect.height * dpr / HEIGHT)));
  const width = WIDTH * scale / dpr;
  const height = HEIGHT * scale / dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.left = `${(Math.round((rect.left + (rect.width - width) / 2) * dpr) / dpr) - rect.left}px`;
  canvas.style.top = `${(Math.round((rect.top + (rect.height - height) / 2) * dpr) / dpr) - rect.top}px`;
  return { scale, dpr, fits: rect.width * dpr >= WIDTH && rect.height * dpr >= HEIGHT };
}

const FONT: Record<string, string> = {
  A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111', D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001',
  I: '111/010/010/010/010/010/111', J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110', P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110', V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/10001', X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10001/10001/10001/10001/01110', '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00110/01000/10000/11111', '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010', '5': '11111/10000/10000/11110/00001/00001/11110',
  '6': '01110/10000/10000/11110/10001/10001/01110', '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110', '9': '01110/10001/10001/01111/00001/00001/01110',
  '.': '0/0/0/0/0/0/1', ':': '0/1/0/0/1/0/0', '-': '000/000/000/111/000/000/000',
  '+': '000/010/010/111/010/010/000', '/': '00001/00010/00010/00100/01000/01000/10000',
  '!': '1/1/1/1/1/0/1', '?': '1110/0001/0001/0110/0100/0000/0100',
  '<': '001/010/100/010/001/000/000', '>': '100/010/001/010/100/000/000', '=': '000/111/000/111/000/000/000',
};

export function text(g: Phaser.GameObjects.Graphics, value: string, x: number, y: number, color = COLORS.pale, size = 1): void {
  g.fillStyle(color);
  let cursor = Math.round(x);
  for (const ch of value.toUpperCase()) {
    const rows = FONT[ch]?.split('/');
    if (!rows) { cursor += 4 * size; continue; }
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < rows[row]!.length; col++) {
        if (rows[row]![col] === '1') g.fillRect(cursor + col * size, Math.round(y) + row * size, size, size);
      }
    }
    cursor += (rows[0]!.length + 1) * size;
  }
}
