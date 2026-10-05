import { shapeTriangles, strokeTriangles, type MaskOp } from "./mask-ops";
import { BLUR_FRAG, COPY_FRAG, DRAW_FRAG, DRAW_VERT, FRAG, NUDGE_FRAG, VERT, VERT_TEX } from "./shaders";

/**
 * Something `texImage2D` can take on this platform, with its size. On the web it is an
 * <img>; on a phone, expo-gl decodes a file itself from `{ localUri }`.
 */
export interface TextureSource {
  pixels: TexImageSource | { localUri: string };
  width: number;
  height: number;
}

/** One painted wall, as the shader wants it (website lib/recolor-engine.ts `RegionPaint`). */
export interface RegionPaint {
  /** The key the mask was given in {@link RecolorGL.setMask}. */
  maskId: string;
  /** Paint colour, 0..1 per channel. */
  target: readonly [number, number, number];
  /** 0 = flat swatch, 1 = follow the photo's light fully. */
  preserve?: number;
  /** The wall's mean luminance in the photo, 0..1. */
  baseL?: number;
  /** The photo is the cleaned canvas, whose walls were repainted white: read it as light. */
  anchor?: boolean;
  /** 0..1, for fading a wall out. */
  strength?: number;
  /** Surface grain, ~0..0.05. */
  grain?: number;
}

/** A small copy read back from the GPU, top row first. */
export interface Readback {
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel. */
  data: Uint8Array;
}

/** The mask being edited (C10) is painted under this key. */
export const EDIT_MASK = "__edit";

/** website webgl-recolor.ts DEFAULT_GRAIN. */
const DEFAULT_GRAIN = 0.03;
/** The blur runs at this fraction of the photo's size. */
const BLUR_SCALE = 4;
/** Longest side of the copies read back for tapping a wall and measuring its light. */
export const SAMPLE_MAX = 192;

type GL = WebGL2RenderingContext & { endFrameEXP?: () => void };

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The live recolour engine on expo-gl (the website's `Recolor`, lib/webgl-recolor.ts,
 * rebuilt around a context the phone gives us rather than a canvas). Uploads the photo
 * once, keeps every wall's mask as a texture, and paints all of them in one frame, so a
 * colour change is one draw per painted wall and no network.
 *
 * Draws into the context's own framebuffer at its full size: the view showing it is
 * laid out at the photo's aspect ratio, so the photo fills it exactly.
 */
export class RecolorGL {
  private readonly gl: GL;
  private program!: WebGLProgram;
  private texProgram!: WebGLProgram;
  private blurProgram!: WebGLProgram;
  private nudgeProgram!: WebGLProgram;
  private drawProgram!: WebGLProgram;
  private drawVao!: WebGLVertexArrayObject;
  private drawVbo!: WebGLBuffer;
  /** C10: the wall being edited — its mask as it was, and the copy the edits land on. */
  private edit: { id: string; base: Target } | null = null;
  private vao!: WebGLVertexArrayObject;
  private texVao!: WebGLVertexArrayObject;
  private blurVao!: WebGLVertexArrayObject;
  private nudgeVao!: WebGLVertexArrayObject;
  private buffers: WebGLBuffer[] = [];
  private imgTex: WebGLTexture | null = null;
  private blur: Target | null = null;
  private reliefTex: WebGLTexture | null = null;
  private masks = new Map<string, Target>();
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private width = 0;
  private height = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl as GL;
    this.init();
  }

  /** The photo's size in pixels (0 before {@link setImage}). */
  get imageSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  private init() {
    const gl = this.gl;
    this.program = link(gl, VERT, FRAG);
    this.texProgram = link(gl, VERT_TEX, COPY_FRAG);
    this.blurProgram = link(gl, VERT_TEX, BLUR_FRAG);
    this.nudgeProgram = link(gl, VERT_TEX, NUDGE_FRAG);
    this.vao = this.triangle(this.program);
    this.texVao = this.triangle(this.texProgram);
    this.blurVao = this.triangle(this.blurProgram);
    this.nudgeVao = this.triangle(this.nudgeProgram);
    this.drawProgram = link(gl, DRAW_VERT, DRAW_FRAG);
    this.drawVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.drawVao);
    this.drawVbo = gl.createBuffer()!;
    this.buffers.push(this.drawVbo);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.drawVbo);
    const drawPos = gl.getAttribLocation(this.drawProgram, "a_pos");
    gl.enableVertexAttribArray(drawPos);
    gl.vertexAttribPointer(drawPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_image"), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_mask"), 1);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_blur"), 2);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_relief"), 3);
    for (const name of [
      "u_target",
      "u_strength",
      "u_useMask",
      "u_preserve",
      "u_baseL",
      "u_anchor",
      "u_grain",
      "u_bright",
      "u_edgeAA",
      "u_anchorDiv",
      "u_reliefMix",
    ]) {
      this.loc[name] = gl.getUniformLocation(this.program, name);
    }
    // The studio uses no relief map: a 1x1 mid-grey ("no shading") keeps unit 3 valid.
    this.reliefTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.reliefTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    setFilters(gl);
  }

  /** The full-screen triangle every pass draws, bound to `program`'s a_pos. */
  private triangle(program: WebGLProgram): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    this.buffers.push(vbo);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  /** Upload the photo (the cleaned canvas, when there is one) and build its blurred copy. */
  setImage(source: TextureSource) {
    const gl = this.gl;
    if (!this.imgTex) this.imgTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    upload(gl, source);
    setFilters(gl);
    this.width = source.width;
    this.height = source.height;

    // The form layer: a Gaussian of sigma r, where r is the website's blur radius
    // (about 1% of the longest side, 6 to 28 px), run at a quarter of the size.
    const radius = Math.min(28, Math.max(6, Math.round(Math.max(this.width, this.height) * 0.01)));
    const w = Math.max(1, Math.ceil(this.width / BLUR_SCALE));
    const h = Math.max(1, Math.ceil(this.height / BLUR_SCALE));
    const a = this.target(w, h, this.blur);
    const b = this.target(w, h, null);
    this.copy(this.imgTex, a);
    this.blurPass(a.tex, b, [1 / w, 0], radius / BLUR_SCALE);
    this.blurPass(b.tex, a, [0, 1 / h], radius / BLUR_SCALE);
    this.freeTarget(b);
    this.blur = a;

    // A new photo means the old masks belong to another room.
    for (const m of this.masks.values()) this.freeTarget(m);
    this.masks.clear();
  }

  /**
   * Upload a wall's mask and prepare it: coverage normalised to opaque white-on-black,
   * the edge moved by `offsetPx` photo pixels (+1 for detected walls, 0 for drawn ones —
   * website visualizer.tsx EDGE_NUDGE_PX).
   */
  setMask(id: string, source: TextureSource, offsetPx = 0) {
    const gl = this.gl;
    const raw = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, raw);
    upload(gl, source);
    setFilters(gl, gl.NEAREST);
    const out = this.target(source.width, source.height, this.masks.get(id) ?? null);
    // In mask pixels: a mask at half the photo's size moves half as far.
    const offset = this.width > 0 ? offsetPx * (source.width / this.width) : offsetPx;
    gl.useProgram(this.nudgeProgram);
    gl.bindVertexArray(this.nudgeVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
    gl.viewport(0, 0, out.width, out.height);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, raw);
    gl.uniform1i(gl.getUniformLocation(this.nudgeProgram, "u_src"), 0);
    gl.uniform2f(gl.getUniformLocation(this.nudgeProgram, "u_texel"), 1 / source.width, 1 / source.height);
    gl.uniform1f(gl.getUniformLocation(this.nudgeProgram, "u_offset"), offset);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(raw);
    this.masks.set(id, out);
  }

  hasMask(id: string): boolean {
    return this.masks.has(id);
  }

  removeMask(id: string) {
    const m = this.masks.get(id);
    if (m) this.freeTarget(m);
    this.masks.delete(id);
  }

  /**
   * Paint the photo through every wall's mask in one frame. With `splitAt` (0..1 across),
   * only the part right of it is painted: the before-and-after view (C14), drawn here so a
   * snapshot of the view is the comparison itself.
   */
  renderRegions(paints: readonly RegionPaint[], splitAt?: number) {
    const gl = this.gl;
    if (!this.imgTex) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const L = this.loc;
    gl.uniform1f(L.u_bright!, 1);
    gl.uniform1f(L.u_edgeAA!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.blur?.tex ?? this.imgTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.reliefTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);

    // The photo.
    gl.uniform1i(L.u_useMask!, 0);
    gl.uniform1f(L.u_strength!, 1);
    gl.uniform1f(L.u_preserve!, 0);
    gl.uniform1f(L.u_baseL!, 0);
    gl.uniform1f(L.u_anchor!, 0);
    gl.uniform1f(L.u_grain!, 0);
    gl.uniform1f(L.u_anchorDiv!, 0);
    gl.uniform1f(L.u_reliefMix!, 0);
    gl.uniform3f(L.u_target!, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Each painted wall, blended on top.
    if (splitAt !== undefined) {
      const x = Math.round(clamp01(splitAt) * gl.drawingBufferWidth);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x, 0, gl.drawingBufferWidth - x, gl.drawingBufferHeight);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const p of paints) {
      const mask = this.masks.get(p.maskId);
      if (!mask) continue;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mask.tex);
      gl.uniform1i(L.u_useMask!, 1);
      gl.uniform3f(L.u_target!, p.target[0], p.target[1], p.target[2]);
      gl.uniform1f(L.u_strength!, clamp01(p.strength ?? 1));
      gl.uniform1f(L.u_preserve!, clamp01(p.preserve ?? 0));
      gl.uniform1f(L.u_baseL!, Math.max(0, p.baseL ?? 0));
      gl.uniform1f(L.u_anchor!, p.anchor ? 1 : 0);
      gl.uniform1f(L.u_grain!, Math.max(0, p.grain ?? DEFAULT_GRAIN));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.endFrameEXP?.();
  }

  /** Just the photo (the "before" in a comparison). */
  renderBase() {
    this.renderRegions([]);
  }

  /** A small copy of the photo, for measuring each wall's light. */
  readImage(maxSide = SAMPLE_MAX): Readback | null {
    return this.imgTex ? this.readBack(this.imgTex, this.width, this.height, maxSide) : null;
  }

  /** A small copy of a prepared mask, for finding the wall under a finger. */
  readMask(id: string, maxSide = SAMPLE_MAX): Readback | null {
    const m = this.masks.get(id);
    return m ? this.readBack(m.tex, this.width || m.width, this.height || m.height, maxSide) : null;
  }

  // ── Editing a mask (C10) ────────────────────────────────────────────────────

  /**
   * Start editing a wall: its mask (prepared, at whatever size it came) is redrawn at the
   * photo's own size — the size the backend wants it back at — or, for a new wall, starts
   * empty. Edits are drawn by {@link replayEdit}; the result paints as {@link EDIT_MASK}.
   */
  startEdit(id: string) {
    this.endEdit();
    const gl = this.gl;
    const base = this.target(this.width, this.height, null);
    const from = this.masks.get(id);
    if (from) {
      this.copy(from.tex, base);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, base.fbo);
      gl.viewport(0, 0, base.width, base.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    this.edit = { id, base };
    this.masks.set(EDIT_MASK, this.target(this.width, this.height, null));
    this.replayEdit([]);
  }

  /** Redraw the edited mask: the wall as it was, then every edit in order (Undo is a shorter list). */
  replayEdit(ops: readonly MaskOp[]) {
    const gl = this.gl;
    const work = this.masks.get(EDIT_MASK);
    if (!this.edit || !work) return;
    this.copy(this.edit.base.tex, work);
    gl.bindFramebuffer(gl.FRAMEBUFFER, work.fbo);
    gl.viewport(0, 0, work.width, work.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.drawProgram);
    gl.bindVertexArray(this.drawVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.drawVbo);
    const value = gl.getUniformLocation(this.drawProgram, "u_value");
    for (const op of ops) {
      const tris =
        op.kind === "stroke"
          ? strokeTriangles(op.points, op.radius, work.width, work.height)
          : shapeTriangles(op.points, work.width, work.height);
      if (tris.length === 0) continue;
      gl.uniform1f(value, op.add ? 1 : 0);
      gl.bufferData(gl.ARRAY_BUFFER, tris, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, tris.length / 2);
    }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** The edited mask at the photo's full size, top row first, for saving. */
  readEdit(): Readback | null {
    const work = this.masks.get(EDIT_MASK);
    if (!work) return null;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, work.fbo);
    const data = new Uint8Array(work.width * work.height * 4);
    gl.readPixels(0, 0, work.width, work.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { width: work.width, height: work.height, data };
  }

  /** Keep the edit as the wall's mask on screen (moving on to another wall) and stop editing. */
  commitEdit() {
    const work = this.masks.get(EDIT_MASK);
    if (!this.edit || !work) return;
    const old = this.masks.get(this.edit.id);
    if (old) this.freeTarget(old);
    this.masks.set(this.edit.id, work);
    this.masks.delete(EDIT_MASK);
    this.freeTarget(this.edit.base);
    this.edit = null;
  }

  /** Stop editing and drop the edits. */
  endEdit() {
    if (!this.edit) return;
    this.removeMask(EDIT_MASK);
    this.freeTarget(this.edit.base);
    this.edit = null;
  }

  /** Wait for the GPU — so a timing taken after a draw measures the draw. */
  finish() {
    this.gl.finish();
  }

  dispose() {
    const gl = this.gl;
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    if (this.reliefTex) gl.deleteTexture(this.reliefTex);
    if (this.blur) this.freeTarget(this.blur);
    if (this.edit) this.freeTarget(this.edit.base);
    this.edit = null;
    for (const m of this.masks.values()) this.freeTarget(m);
    this.masks.clear();
    for (const b of this.buffers) gl.deleteBuffer(b);
    for (const v of [this.vao, this.texVao, this.blurVao, this.nudgeVao, this.drawVao]) gl.deleteVertexArray(v);
    for (const p of [this.program, this.texProgram, this.blurProgram, this.nudgeProgram, this.drawProgram]) gl.deleteProgram(p);
    this.imgTex = null;
    this.blur = null;
  }

  // ── Render targets ────────────────────────────────────────────────────────

  private target(width: number, height: number, reuse: Target | null): Target {
    const gl = this.gl;
    if (reuse && reuse.width === width && reuse.height === height) return reuse;
    if (reuse) this.freeTarget(reuse);
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    setFilters(gl);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, width, height };
  }

  private freeTarget(t: Target) {
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  private copy(src: WebGLTexture, to: Target) {
    const gl = this.gl;
    gl.useProgram(this.texProgram);
    gl.bindVertexArray(this.texVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, to.width, to.height);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(this.texProgram, "u_src"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private blurPass(src: WebGLTexture, to: Target, step: [number, number], sigma: number) {
    const gl = this.gl;
    gl.useProgram(this.blurProgram);
    gl.bindVertexArray(this.blurVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, to.width, to.height);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(this.blurProgram, "u_src"), 0);
    gl.uniform2f(gl.getUniformLocation(this.blurProgram, "u_step"), step[0], step[1]);
    gl.uniform1f(gl.getUniformLocation(this.blurProgram, "u_sigma"), Math.max(0.5, sigma));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private readBack(src: WebGLTexture, w: number, h: number, maxSide: number): Readback {
    const gl = this.gl;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    const t = this.target(width, height, null);
    this.copy(src, t);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    const data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.freeTarget(t);
    return { width, height, data };
  }
}

function upload(gl: WebGL2RenderingContext, source: TextureSource) {
  // expo-gl reads `{ localUri }` itself on a phone; the DOM types do not know that.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source.pixels as TexImageSource);
}

function setFilters(gl: WebGL2RenderingContext, filter: number = gl.LINEAR) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function compile(gl: WebGL2RenderingContext, kind: number, src: string): WebGLShader {
  const sh = gl.createShader(kind)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, vert);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("Link failed: " + gl.getProgramInfoLog(program));
  }
  return program;
}
