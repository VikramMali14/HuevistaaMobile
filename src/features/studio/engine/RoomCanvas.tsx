import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import type { MaskOp, Point } from "./mask-ops";
import { hexToRgb01, meanLumaInMask, regionPaints, wallAt, EDGE_NUDGE_PX, type WallPaint } from "./paint-model";
import { EDIT_MASK, RecolorGL, type Readback, type RegionPaint, type TextureSource } from "./recolor-gl";

/** A wall the canvas knows about: where its mask is, and its colour when painted. */
export interface CanvasWall {
  id: string;
  /** Fetches the mask. Absent for a wall being drawn for the first time (C10). */
  load?: () => Promise<TextureSource>;
  /** Changes when the mask changes (redrawn), so it is fetched again. */
  maskKey: string;
  manual?: boolean;
  /** Null: not painted (the photo shows through). */
  hex: string | null;
  lrv?: number | null;
}

export type CanvasState =
  | { kind: "loading" }
  | { kind: "ready"; width: number; height: number }
  /** The photo could not be fetched or decoded. */
  | { kind: "failed"; error: unknown }
  /** No WebGL2 on this phone. */
  | { kind: "noGl"; error: unknown };

/** Where a photo sits inside a box it is fitted into, keeping its shape (centred). */
export function fitRect(box: { width: number; height: number }, photo: { width: number; height: number }) {
  const scale = Math.min(box.width / photo.width, box.height / photo.height);
  const width = Math.floor(photo.width * scale);
  const height = Math.floor(photo.height * scale);
  return { width, height, left: (box.width - width) / 2, top: (box.height - height) / 2 };
}

export interface RoomCanvasHandle {
  /**
   * Paint now — with `colours` (wall id → hex) in place of the walls' own, when given —
   * and wait for the GPU. Returns the milliseconds it took. For the engine check.
   */
  renderTimed(colours?: ReadonlyMap<string, string>): number;
  /** A JPEG of what the canvas shows now (C14 "Share this view"); null without a context. */
  snapshot(): Promise<string | null>;
  /** C10: the edited mask at the photo's full size. */
  readEdit(): Readback | null;
  /** C10: keep the edit as that wall's mask on screen (before editing another). */
  commitEdit(): void;
  /** C10: a wall's mask as the canvas holds it now, at full size (for saving). */
  readWall(id: string): Readback | null;
}

/** C10: the wall being reshaped (or a new one, with no mask yet) and the edits so far. */
export interface CanvasEdit {
  wallId: string;
  tint: string;
  ops: readonly MaskOp[];
}

export type PointerPhase = "start" | "move" | "end" | "cancel";

export interface RoomCanvasProps {
  photo: () => Promise<TextureSource>;
  /** Changes when the photo changes. */
  photoKey: string;
  walls: readonly CanvasWall[];
  /** The photo is the cleaned canvas (its walls repainted white): read it as light. */
  cleaned: boolean;
  /** Show the photo without paint (press and hold, or the "before" side). */
  showOriginal?: boolean;
  /** 0..1 across: paint only right of it (C14's divider). */
  splitAt?: number;
  /** C10: edit one wall's mask; the walls show as flat tints of their `hex`. */
  edit?: CanvasEdit | null;
  /** C10: one finger on the photo, in the photo's own pixels (replaces tap and hold). */
  onPointer?: (phase: PointerPhase, point: Point) => void;
  onState?: (state: CanvasState) => void;
  /** A tap on the photo: the wall under the finger, or null. */
  onTapWall?: (wallId: string | null) => void;
  /** Press and hold, and let go. */
  onHold?: (holding: boolean) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The room, live (C11, C14, the engine check): the ported recolour engine on expo-gl,
 * laid out at the photo's own aspect ratio inside whatever space it is given.
 */
export const RoomCanvas = forwardRef<RoomCanvasHandle, RoomCanvasProps>(function RoomCanvas(
  { photo, photoKey, walls, cleaned, showOriginal = false, splitAt, edit = null, onPointer, onState, onTapWall, onHold, style, testID },
  ref,
) {
  const [source, setSource] = useState<TextureSource | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [glReady, setGlReady] = useState(0);
  const engine = useRef<RecolorGL | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const samples = useRef(new Map<string, Readback>());
  const baseL = useRef(new Map<string, number>());
  const loadedKeys = useRef(new Map<string, string>());
  const [masksVersion, setMasksVersion] = useState(0);
  const latest = useRef({ walls, cleaned, showOriginal, splitAt, edit });
  latest.current = { walls, cleaned, showOriginal, splitAt, edit };
  const stateRef = useRef(onState);
  stateRef.current = onState;

  // 1. The photo, before the GL view: its size decides the view's.
  useEffect(() => {
    let cancelled = false;
    setSource(null);
    stateRef.current?.({ kind: "loading" });
    photo()
      .then((s) => !cancelled && setSource(s))
      .catch((error: unknown) => !cancelled && stateRef.current?.({ kind: "failed", error }));
    return () => {
      cancelled = true;
    };
    // `photo` is a fresh closure each render; the key says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  const size = useMemo(() => {
    if (!source || !box) return null;
    const { width, height } = fitRect(box, source);
    return { width, height };
  }, [source, box]);

  const paint = useCallback((colours?: ReadonlyMap<string, string>) => {
    const e = engine.current;
    if (!e) return;
    const { walls: ws, cleaned: cl, showOriginal: orig, splitAt: split, edit: ed } = latest.current;
    if (orig) {
      e.renderBase();
      return;
    }
    if (ed) {
      // Editing: every wall a flat, see-through tint; the one being edited stronger.
      const tints: RegionPaint[] = ws
        .filter((w) => w.id !== ed.wallId && w.hex && e.hasMask(w.id))
        .map((w) => ({ maskId: w.id, target: hexToRgb01(w.hex!), strength: 0.3, grain: 0 }));
      tints.push({ maskId: EDIT_MASK, target: hexToRgb01(ed.tint), strength: 0.6, grain: 0 });
      e.renderRegions(tints);
      return;
    }
    const painted: WallPaint[] = ws
      .map((w) => ({ ...w, hex: colours?.get(w.id) ?? w.hex, lrv: colours?.has(w.id) ? null : w.lrv }))
      .filter((w) => w.hex && e.hasMask(w.id))
      .map((w) => ({ id: w.id, hex: w.hex!, lrv: w.lrv, manual: w.manual }));
    e.renderRegions(regionPaints(painted, { baseL: baseL.current, cleaned: cl }), split);
  }, []);

  // 2. The GL context: the engine, the photo.
  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      if (!source) return;
      try {
        engine.current?.dispose();
        glRef.current = gl;
        const e = new RecolorGL(gl);
        e.setImage(source);
        engine.current = e;
        samples.current.clear();
        baseL.current.clear();
        loadedKeys.current.clear();
        e.renderBase();
        setGlReady((n) => n + 1);
        stateRef.current?.({ kind: "ready", width: source.width, height: source.height });
      } catch (error) {
        engine.current = null;
        stateRef.current?.({ kind: "noGl", error });
      }
    },
    [source],
  );

  useEffect(
    () => () => {
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );

  // 3. The masks: fetched in parallel, each measured once (its light, its shape for taps).
  const wallKeys = walls.map((w) => `${w.id}:${w.maskKey}:${w.manual ? 1 : 0}`).join("|");
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    let cancelled = false;
    const wanted = new Set(walls.map((w) => w.id));
    for (const id of [...loadedKeys.current.keys()]) {
      if (!wanted.has(id) && id !== latest.current.edit?.wallId) {
        e.removeMask(id);
        loadedKeys.current.delete(id);
        samples.current.delete(id);
        baseL.current.delete(id);
      }
    }
    const missing = walls.filter((w) => w.load && loadedKeys.current.get(w.id) !== w.maskKey);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (w) => {
        try {
          return { w, src: await w.load!() };
        } catch {
          return { w, src: null };
        }
      }),
    ).then((loaded) => {
      if (cancelled || engine.current !== e) return;
      const image = e.readImage();
      for (const { w, src } of loaded) {
        if (!src) continue;
        e.setMask(w.id, src, w.manual ? 0 : EDGE_NUDGE_PX);
        const sample = e.readMask(w.id);
        if (sample) {
          samples.current.set(w.id, sample);
          baseL.current.set(w.id, image ? meanLumaInMask(image, sample) : 0);
        }
        loadedKeys.current.set(w.id, w.maskKey);
      }
      setMasksVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
    // wallKeys is the identity of the masks; colours are painted by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallKeys, glReady]);

  // C10: the wall being edited, from its mask as loaded (or empty, for a new wall).
  const editWall = edit?.wallId ?? null;
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (editWall) {
      e.startEdit(editWall);
      e.replayEdit(latest.current.edit?.ops ?? []);
    } else {
      e.endEdit();
    }
    paint();
  }, [editWall, masksVersion, glReady, paint]);
  const editOps = edit?.ops;
  useEffect(() => {
    const e = engine.current;
    if (!e || !editOps) return;
    e.replayEdit(editOps);
    paint();
  }, [editOps, paint]);

  // 4. Paint on every change of colour, of the "original" view, or of the masks.
  const colourKey = walls.map((w) => `${w.id}=${w.hex ?? ""}`).join("|");
  useEffect(() => {
    paint();
  }, [colourKey, cleaned, showOriginal, splitAt, masksVersion, glReady, paint]);

  useImperativeHandle(ref, () => ({
    renderTimed(colours) {
      const start = performance.now();
      paint(colours);
      engine.current?.finish();
      return performance.now() - start;
    },
    readEdit() {
      return engine.current?.readEdit() ?? null;
    },
    commitEdit() {
      engine.current?.commitEdit();
    },
    readWall(id) {
      return engine.current?.readMask(id, Number.POSITIVE_INFINITY) ?? null;
    },
    async snapshot() {
      const gl = glRef.current;
      if (!gl || !engine.current) return null;
      paint();
      const shot = await GLView.takeSnapshotAsync(gl, { format: "jpeg", compress: 0.9 });
      return typeof shot.uri === "string" ? shot.uri : shot.uri ? URL.createObjectURL(shot.uri) : null;
    },
  }));

  const photoPoint = (ev: GestureResponderEvent): Point | null => {
    if (!size || !source) return null;
    return [
      Math.max(0, Math.min(source.width, (ev.nativeEvent.locationX / size.width) * source.width)),
      Math.max(0, Math.min(source.height, (ev.nativeEvent.locationY / size.height) * source.height)),
    ];
  };
  const pointer = (phase: PointerPhase) => (ev: GestureResponderEvent) => {
    const p = photoPoint(ev);
    if (p && onPointer) onPointer(phase, p);
  };

  const tap = (ev: GestureResponderEvent) => {
    if (!size || !onTapWall) return;
    const u = ev.nativeEvent.locationX / size.width;
    const v = ev.nativeEvent.locationY / size.height;
    const order = latest.current.walls
      .map((w) => ({ id: w.id, sample: samples.current.get(w.id) }))
      .filter((s): s is { id: string; sample: Readback } => Boolean(s.sample));
    onTapWall(wallAt(u, v, order));
  };

  return (
    <View
      style={[styles.box, style]}
      onLayout={(e: LayoutChangeEvent) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      testID={testID}
    >
      {size && onPointer ? (
        <View
          style={size}
          onStartShouldSetResponder={(e) => e.nativeEvent.touches.length <= 1}
          onMoveShouldSetResponder={(e) => e.nativeEvent.touches.length <= 1}
          onResponderGrant={pointer("start")}
          onResponderMove={pointer("move")}
          onResponderRelease={pointer("end")}
          onResponderTerminate={pointer("cancel")}
          onResponderTerminationRequest={() => true}
        >
          <GLView
            key={`${photoKey}:${size.width}x${size.height}`}
            style={size}
            onContextCreate={onContextCreate}
            {...WEB_CONTEXT}
          />
        </View>
      ) : size ? (
        <Pressable
          onPress={tap}
          onLongPress={() => onHold?.(true)}
          onPressOut={() => onHold?.(false)}
          delayLongPress={250}
          style={size}
          accessibilityRole="image"
        >
          <GLView
            key={`${photoKey}:${size.width}x${size.height}`}
            style={size}
            onContextCreate={onContextCreate}
            {...WEB_CONTEXT}
          />
        </Pressable>
      ) : null}
    </View>
  );
});

/**
 * In a browser the canvas keeps its picture after it is shown, so a snapshot (C14's
 * share) reads what is on screen rather than a cleared buffer — as the website's engine
 * does. A web-only prop; the phone's GLView reads its own framebuffer.
 */
const WEB_CONTEXT = { webglContextAttributes: { preserveDrawingBuffer: true } } as object;

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
