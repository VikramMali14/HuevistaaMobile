/**
 * The recolour shaders. VERT and FRAG are the website's (HueVistaFrontEnd
 * lib/webgl-recolor.ts) copied unchanged, so a wall reads the same colour on the phone
 * as on the website: multiplicative shading anchored to the cleaned photo, the
 * form/detail split, the one-pixel antialiased mask edge.
 *
 * What the website does on a 2D canvas runs here as GPU passes instead (there is no
 * canvas on the phone): the blurred "form" layer (BLUR_FRAG, in place of the canvas's
 * `filter: blur()`), the edge nudge (NUDGE_FRAG, mask-feather.ts `offsetCoverage`)
 * and the small copies read back for tapping a wall (COPY_FRAG).
 */

/**
 * website lib/canvas-light.ts REF_WHITE. The studio passes no measured white point and
 * no relief map (the website's studio does not either), so the shader's u_anchorDiv
 * and u_reliefMix stay 0 and this constant is all of canvas-light.ts it needs.
 */
export const REF_WHITE = 0.94;

export const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_image;
uniform sampler2D u_mask;
// Low-pass (blurred) copy of the photo. Splitting the photo into this smooth
// "form" layer and a high-frequency "detail" layer (image - blur) lets us tint
// the swatch by the large-scale light while carrying the surface's REAL texture
// — plaster stipple, dirt, seams, micro-shadows — onto whatever colour the user
// picks. That real texture is what a flat fill (or synthetic grain) can't fake.
uniform sampler2D u_blur;
uniform vec3 u_target;
uniform float u_strength;
uniform int u_useMask;
// Shadow/relief preservation. 0 = flat exact fill (the swatch everywhere);
// 1 = fully follow the photo's light. u_baseL is the region's mean luminance.
uniform float u_preserve;
uniform float u_baseL;
// Scene-light anchoring (0 or 1). The CLEANED canvas repaints every paintable
// surface a fresh near-white, so the photo of those surfaces IS an illumination
// map — light level AND colour cast. When anchored, the swatch is modulated by
// that illumination directly (per-channel, divided by fresh-white albedo)
// instead of normalising the region mean UP to the swatch. An evening photo
// keeps its dim warm evening light instead of snapping to flat noon daylight.
uniform float u_anchor;
// The albedo anchored mode divides the canvas by to recover the scene's light.
// Computed on the CPU (anchorDivisor in canvas-light.ts) from the white this surface
// was actually DELIVERED at, rather than assumed to be fresh white: when the
// clean-up drifts and paints grey, assuming white divides by the wrong number and
// every colour on that surface renders dark by the size of the drift. Nobody reads
// that as a dark render — they read it as the swatch being wrong. Defaults to
// REF_WHITE, which is what a canvas the clean-up got right measures at anyway.
uniform float u_anchorDiv;
// Shading recovered from the ORIGINAL photograph, for a cleaned canvas that came
// back with its own light flattened out: the multiply then has nothing to modulate,
// and no shader can put back light it was never given. u_relief is a band-pass ratio
// map (buildReliefMap in canvas-light.ts) encoded so mid-grey means "no shading";
// u_reliefMix is 0 wherever the canvas still has light of its own — the usual case,
// costing one multiply by 1.0.
uniform sampler2D u_relief;
uniform float u_reliefMix;
// Surface grain: a hair of per-pixel noise, a floor of texture for perfectly
// smooth walls where the photo itself carries almost no detail. 0 disables it.
uniform float u_grain;
// Whole-image brighten (the studio's Brighten control): a gamma midtone lift,
// output = input^(1/u_bright). 1 = untouched. Applied to the base photo AND
// the painted regions alike, so the paint sits in the same brightened light
// instead of floating dark on a lifted photo. A gamma lift keeps pure white
// where it is — bright skies don't clip.
uniform float u_bright;
// 1 = sharpen the mask edge to ~one output pixel (see EDGE_T/EDGE_W below);
// 0 = use the mask's own alpha untouched. Set to 0 whenever the "soft edges"
// feather is on: that feather IS the intended edge — a deliberate multi-pixel
// ramp — and re-thresholding it here would snap it straight back to a hard line.
uniform float u_edgeAA;

// --- How the paint is made to sit in the photo's light -----------------------
// Gain on the photo's shading below the form layer's scale, and the amplitude at
// which it rolls off. Both live in the LOG (ratio) domain, because shading is a
// ratio: the knee is measured in natural-log units, so DETAIL_KNEE is the largest
// number of e-folds the detail term may ever apply. The roll-off is a SOFT
// saturation, not a clip (see below).
const float DETAIL_GAIN = 1.15;
const float DETAIL_KNEE = 1.0;
// How dark a form shadow may get, how bright a lit face may get, and the extra
// gamma applied below 1.0 so shadows deepen instead of sitting flat.
const float FORM_FLOOR = 0.22;
const float FORM_CEIL = 2.4;
const float SHADOW_DEPTH = 0.35;
// Mask edge: the alpha at which the surface starts, and how many output pixels
// the antialiased transition spans.
const float EDGE_T = 0.5;
const float EDGE_W = 0.9;
// How much true white a genuinely over-range highlight may take on. Small:
// this is specular sheen, not the main way a lit wall gets brighter.
const float HI_WHITE = 0.15;
// Multiplicative shading costs a little chroma; hand it back.
const float SAT = 1.06;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 brighten(vec3 c) {
  if (u_bright <= 1.001) return c;
  return pow(max(c, 0.0), vec3(1.0 / u_bright));
}

// The albedo to assume when nothing was measured — fresh white paint at LRV ~85.
// Kept as a compile-time constant, not folded into u_anchorDiv's default, so the
// unmeasured path below compiles to the exact expression it did before u_anchorDiv
// existed. Dividing by a uniform holding 0.94 is not bit-identical to dividing by the
// literal: the compiler folds the literal to a reciprocal multiply and the last bit
// differs, which was enough to move one subpixel of a 400x300 render. That is
// invisible, but "no customer render moves" is worth being exactly true rather than
// nearly true.
const float REF_WHITE = ${REF_WHITE.toFixed(2)};

// Cheap hash -> pseudo-random 0..1 from a screen-space position, for grain.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  vec4 src = texture(u_image, v_uv);
  // Base pass (no mask): pass the photo straight through (forced opaque so the
  // exported PNG never has see-through holes from a transparent source). Painted
  // regions are composited on top in their own blended passes.
  if (u_useMask == 0) {
    outColor = vec4(brighten(src.rgb), 1.0);
    return;
  }
  float m = texture(u_mask, v_uv).r;
  vec3 paint = u_target;
  if (u_preserve > 0.001 && (u_baseL > 0.001 || u_anchor > 0.5)) {
    float L = luma(src.rgb);
    vec3 Brgb = texture(u_blur, v_uv).rgb;   // large-scale (form) light
    float B = luma(Brgb);
    // FORM: tint the swatch by the SMOOTH large-scale light. Form shadows
    // (eaves, reveals, the facade's own gradient) survive either way; the two
    // modes differ in what "neutral" means:
    vec3 form;
    if (u_anchor > 0.5) {
      // ANCHORED: the canvas is the cleaned image, whose paintable surfaces were
      // repainted a known albedo — so the smooth photo IS the illumination.
      // Per-channel, so the scene's warm or cool cast tints the paint too:
      // a dusk wall renders the swatch in dusk light, not showroom light.
      // 0 means the canvas was never measured: take the constant, by the same
      // expression as before this was measurable at all.
      if (u_anchorDiv > 0.0) form = Brgb / u_anchorDiv;
      else form = Brgb / REF_WHITE;
    } else {
      // LEGACY: normalise by the region's own mean luminance so the wall
      // still averages to the true swatch colour (the can's colour).
      form = vec3(B / u_baseL);
    }
    // Fold in whatever shading was recovered from the photograph before the clamp,
    // so borrowed relief is bounded and deepened on exactly the same terms as the
    // canvas's own. A mix at 0 is a multiply by 1.0: the normal path is untouched.
    form *= mix(1.0, 0.5 + texture(u_relief, v_uv).r, u_reliefMix);
    form = clamp(form, FORM_FLOOR, FORM_CEIL);
    form = mix(vec3(1.0), form, u_preserve);
    // Shading is MULTIPLICATIVE, split at 1.0 so each half can be treated on
    // its own terms without a branch. Below 1 is a genuine shadow, deepened by
    // an extra gamma so the paint sits INTO the surface instead of floating
    // flat on top of it. Above 1 is sunlight, which should make the swatch
    // BRIGHTER — not wash it out.
    vec3 fd = pow(min(form, vec3(1.0)), vec3(1.0 + SHADOW_DEPTH * u_preserve));
    vec3 fu = max(form, vec3(1.0));
    vec3 lit = u_target * fd * fu;
    // Rescale by the peak channel rather than clipping it. A hard clamp pins
    // the brightest channel at 1 while the others stay put, which drags the
    // hue toward white and drains the colour exactly where the sun hits —
    // that is what made light swatches read as bare, unpainted plaster.
    // Dividing by the peak keeps the ratio between channels, so the colour
    // survives at full chroma however bright the face is, and only a genuinely
    // over-range highlight earns a little real white on top.
    float pk = max(max(lit.r, lit.g), lit.b);
    paint = lit / max(pk, 1.0);
    paint = mix(paint, vec3(1.0), HI_WHITE * clamp(pk - 1.0, 0.0, 1.0));
    // DETAIL: everything the form blur smoothed away — plaster stipple, dirt and
    // seams, but also the reveals, recesses, soffits and hard shadow edges that
    // give a facade its structure. Applied as a RATIO, not added: adding a
    // luminance delta to a colour pushes it toward grey in the highlights and
    // toward black in the shadows, draining the swatch precisely where the eye
    // reads material.
    //
    // The ratio is L/B specifically, so that form (B/baseL) times detail (L/B)
    // reconstructs the photo's own shading, L/baseL — which is what preserving
    // its light has to mean. This used to be the ABSOLUTE difference L - B run
    // through a knee saturating at 0.06; divided by B, it could never move the
    // paint more than about ±9% however large the real step was. So every
    // shading feature below the blur's ~2%-of-frame scale was flattened to
    // nothing, and a villa whose whole character is hard sunlight came back as
    // one even tone. Measured against the source photo's own shading, the old
    // term kept 29% of it at texture scale and 52% at reveal scale; this keeps
    // 49% and 71%, with the large-scale form unchanged at 94%.
    float rel = max(L, 0.004) / max(B, 0.04);
    // A soft knee, not a clip, now taken in the log domain so it limits a RATIO by
    // e-folds rather than by an absolute luminance. Clamping to a fixed band left
    // flat plateaus wherever the detail saturated — a plasticky dead patch beside
    // every railing and reveal. This saturates smoothly instead, so the big
    // luminance STEP at an edge still can't bloom into an unsharp-mask halo (B is
    // blurred across boundaries, so L/B goes wild next to a window or a doorway),
    // but real shading gets through on the way there.
    float lr = log(rel);
    lr = lr / (1.0 + abs(lr) / DETAIL_KNEE);
    paint *= exp(lr * DETAIL_GAIN * u_preserve);
    paint = mix(vec3(luma(paint)), paint, SAT);
  }
  if (u_grain > 0.0001) {
    // Signed, ~zero-mean noise. Scaled up a little on brighter paint so it reads
    // as surface texture without muddying shadow recesses.
    float n = hash(gl_FragCoord.xy) - 0.5;
    paint += n * u_grain * (0.5 + 0.5 * luma(paint));
  }
  paint = clamp(paint, 0.0, 1.0);
  // EDGE: the mask is bilinear-sampled from a texture that is usually LOWER
  // resolution than the photo, so the raw alpha gives a transition whose width
  // in output pixels depends on how far the mask is being stretched — often
  // several pixels of mush, with colour bleeding over window frames and
  // railings. fwidth is the screen-space rate of change of the mask, so
  // normalising the threshold by it gives a transition about ONE output pixel
  // wide whatever the mask's own resolution: crisp, but still antialiased, so
  // it never goes jaggy. Computed unconditionally (derivatives must not sit in
  // non-uniform control flow) and mixed in, so u_edgeAA = 0 leaves the mask's
  // own soft ramp — the "soft edges" feather — completely untouched.
  float w = max(fwidth(m), 1e-5) * EDGE_W;
  float aa = smoothstep(EDGE_T - w, EDGE_T + w, m);
  outColor = vec4(brighten(paint), u_strength * mix(m, aa, u_edgeAA));
}`;

/**
 * For passes that draw INTO a texture. No flip: row 0 of the target is row 0 of the
 * source, so a texture made here is sampled exactly like the photo it came from (and
 * reads back top row first).
 */
export const VERT_TEX = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** A plain copy, for downscaling (the blur's first step, the read-back samples). */
export const COPY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
void main() {
  outColor = texture(u_src, v_uv);
}`;

/**
 * One direction of a separable Gaussian, sigma in texels of the target. Two of these
 * (across, then down) stand in for the website's `ctx.filter = blur(r px)`, which is a
 * Gaussian of standard deviation r. Run at a quarter of the photo's size: the result is
 * the smooth "form" layer, and a quarter-size blur stretched back up is just as smooth.
 */
export const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_step;
uniform float u_sigma;
void main() {
  vec4 sum = vec4(0.0);
  float total = 0.0;
  int reach = int(ceil(u_sigma * 3.0));
  for (int i = -32; i <= 32; i++) {
    if (i < -reach || i > reach) continue;
    float x = float(i);
    float w = exp(-0.5 * x * x / (u_sigma * u_sigma));
    sum += texture(u_src, v_uv + u_step * x) * w;
    total += w;
  }
  outColor = sum / total;
}`;

/**
 * The edge nudge — website lib/mask-feather.ts `offsetCoverage` on the GPU. Coverage
 * is red x alpha (an opaque white-on-black backend mask and a white-on-clear hand-drawn
 * one both read right); a box blur of radius r = ceil(|offset|) + 1 turns the edge into
 * a linear ramp, and cutting the ramp at a shifted level moves the edge by `offset`
 * mask pixels with about one pixel of antialiasing. Offset 0 just normalises the
 * coverage. Out: opaque white-on-black, the format FRAG's `.r` sample expects.
 */
export const NUDGE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_offset;
float coverage(vec2 uv) {
  vec4 c = texture(u_src, uv);
  return c.r * c.a;
}
void main() {
  if (abs(u_offset) < 0.001) {
    float c = coverage(v_uv);
    outColor = vec4(c, c, c, 1.0);
    return;
  }
  int r = int(ceil(abs(u_offset))) + 1;
  float sum = 0.0;
  float n = 0.0;
  for (int dy = -8; dy <= 8; dy++) {
    if (dy < -r || dy > r) continue;
    for (int dx = -8; dx <= 8; dx++) {
      if (dx < -r || dx > r) continue;
      sum += coverage(v_uv + vec2(float(dx), float(dy)) * u_texel);
      n += 1.0;
    }
  }
  float soft = sum / n;
  float width = 2.0 * float(r) + 1.0;
  float t = 0.5 - u_offset / width;
  float aa = 1.0 / width;
  float u = clamp((soft - (t - aa)) / (2.0 * aa), 0.0, 1.0);
  float c = u * u * (3.0 - 2.0 * u);
  outColor = vec4(c, c, c, 1.0);
}`;

/** Mask editing (C10): solid shapes drawn straight in clip space, 1 to add and 0 to cut. */
export const DRAW_VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const DRAW_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform float u_value;
void main() {
  outColor = vec4(u_value, u_value, u_value, 1.0);
}`;

/**
 * The selected wall's outline (C11): a thin light line on the mask's edge with a soft dark
 * halo either side, so it reads on a pale wall and a dark one alike. Drawn to the screen
 * (VERT's flip) in one pass over the painted frame. The mask is probed on two rings round
 * each pixel, u_line and u_halo apart in uv: a ring that straddles the edge (some probes
 * in, some out) puts the pixel within that distance of it. Being measured in screen
 * pixels, the line stays the same width however large the mask is stretched.
 */
export const OUTLINE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_mask;
uniform vec2 u_line;
uniform vec2 u_halo;
uniform vec3 u_color;
const int DIRS = 12;
float straddle(vec2 r) {
  float lo = 1.0;
  float hi = 0.0;
  for (int i = 0; i < DIRS; i++) {
    float a = 6.2831853 * float(i) / float(DIRS);
    float m = texture(u_mask, v_uv + vec2(cos(a), sin(a)) * r).r;
    lo = min(lo, m);
    hi = max(hi, m);
  }
  float m = texture(u_mask, v_uv).r;
  lo = min(lo, m);
  hi = max(hi, m);
  return clamp(hi - lo, 0.0, 1.0);
}
void main() {
  // Most of the frame is nowhere near the edge: four probes say so before the rings run.
  float c = texture(u_mask, v_uv).r;
  float x0 = texture(u_mask, v_uv - vec2(u_halo.x, 0.0)).r;
  float x1 = texture(u_mask, v_uv + vec2(u_halo.x, 0.0)).r;
  float y0 = texture(u_mask, v_uv - vec2(0.0, u_halo.y)).r;
  float y1 = texture(u_mask, v_uv + vec2(0.0, u_halo.y)).r;
  float near = max(max(x0, x1), max(max(y0, y1), c)) - min(min(x0, x1), min(min(y0, y1), c));
  if (near < 0.004) discard;
  float line = straddle(u_line);
  float halo = straddle(u_halo);
  float a = max(line, halo * 0.45);
  if (a < 0.004) discard;
  outColor = vec4(mix(vec3(0.0), u_color, line / a), a);
}`;
