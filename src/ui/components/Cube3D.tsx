import React, { useCallback, useEffect, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';

import { COLOR_HEX, CubeColor, Face } from '../../core/cube/defs';
import { FACE_NORMAL, faceletIndex, inLayer, turnAngle } from '../../core/cube/geometry';
import { Move } from '../../core/cube/moves';
import { ArrowDirection, ARROW_EMOJI } from '../../core/kids/instructions';
import { colors, font } from '../theme';

/** Colore di un facelet non ancora deciso. */
const UNKNOWN = '#3F3F46';
const PLASTIC = '#141418';

export interface Cube3DProps {
  /** I 54 colori da disegnare, null dove il quadratino e' ancora ignoto. */
  facelets: (CubeColor | null)[];
  /** Faccia da illuminare durante un passo. */
  highlight?: Face | null;
  /** Freccia grande sovrapposta al cubo. */
  arrow?: ArrowDirection | null;
  /** Mossa da animare: quando cambia, il cubo la esegue davvero. */
  animate?: { move: Move; id: number; slow?: boolean } | null;
  onAnimationEnd?: () => void;
  /** Il bambino puo' girare il cubo con il dito. */
  interactive?: boolean;
  style?: object;
  /** Rotazione automatica lenta (schermata iniziale). */
  spin?: boolean;
}

/** Asse uscente da ciascuna faccia, come vettore di three.js. */
const NORMAL: Record<Face, THREE.Vector3> = Object.fromEntries(
  (Object.keys(FACE_NORMAL) as unknown as Face[]).map((f) => [
    f,
    new THREE.Vector3(...FACE_NORMAL[f]),
  ]),
) as Record<Face, THREE.Vector3>;

/** L'ordine dei materiali di un BoxGeometry in three.js. */
const MATERIAL_FACE: Face[] = [Face.R, Face.L, Face.U, Face.D, Face.F, Face.B];

/* ------------------------------------------------------------------ */

export default function Cube3D({
  facelets,
  highlight,
  arrow,
  animate,
  onAnimationEnd,
  interactive = true,
  style,
  spin,
}: Cube3DProps) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cubeRef = useRef<THREE.Group | null>(null);
  const cubiesRef = useRef<{ mesh: THREE.Mesh; pos: THREE.Vector3 }[]>([]);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const stopLoop = useRef<(() => void) | null>(null);

  // Rotazione controllata dal dito.
  const orientation = useRef({ x: -0.45, y: 0.6 });
  const dragStart = useRef({ x: 0, y: 0 });

  // Animazione della mossa in corso.
  const anim = useRef<{
    pivot: THREE.Group;
    axis: THREE.Vector3;
    target: number;
    current: number;
    speed: number;
    members: THREE.Mesh[];
  } | null>(null);
  const lastAnimId = useRef<number>(-1);
  /**
   * Ridisegniamo solo quando c'e' qualcosa di nuovo da mostrare.
   *
   * Un ciclo che ridisegna 60 volte al secondo anche a cubo fermo tiene la GPU
   * sempre accesa: su un telefono in mano a un bambino vuol dire batteria che
   * cala e telefono che scalda, per niente. Qui il disegno avviene quando c'e'
   * un'animazione, quando il dito sta girando il cubo, quando cambiano i colori
   * o quando il cubo gira da solo nella schermata iniziale.
   */
  const needsRender = useRef(true);
  const invalidate = useCallback(() => {
    needsRender.current = true;
  }, []);
  const faceletsRef = useRef(facelets);
  const highlightRef = useRef(highlight);
  const spinRef = useRef(spin);

  faceletsRef.current = facelets;
  highlightRef.current = highlight;
  spinRef.current = spin;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interactive,
      onMoveShouldSetPanResponder: () => interactive,
      onPanResponderGrant: () => {
        dragStart.current = { ...orientation.current };
      },
      onPanResponderMove: (_e, g) => {
        orientation.current = {
          y: dragStart.current.y + g.dx * 0.012,
          x: Math.max(-1.3, Math.min(1.3, dragStart.current.x + g.dy * 0.012)),
        };
        needsRender.current = true;
      },
    }),
  ).current;

  /** Ricostruisce i colori senza ricreare la geometria. */
  const paint = useCallback(() => {
    for (const { mesh, pos } of cubiesRef.current) {
      const mats = mesh.material as THREE.MeshLambertMaterial[];
      MATERIAL_FACE.forEach((face, i) => {
        const visible = inLayer(face, pos.x, pos.y, pos.z);
        if (!visible) {
          mats[i].color.set(PLASTIC);
          mats[i].emissive.set('#000000');
          return;
        }
        const idx = faceletIndex(face, pos.x, pos.y, pos.z);
        const col = faceletsRef.current[idx];
        mats[i].color.set(col === null || col === undefined ? UNKNOWN : COLOR_HEX[col]);
        // La faccia da girare "si accende": e' il segnale piu' chiaro possibile.
        const lit = highlightRef.current !== null && highlightRef.current === face;
        mats[i].emissive.set(lit ? '#FFFFFF' : '#000000');
        mats[i].emissiveIntensity = lit ? 0.28 : 0;
      });
    }
  }, []);

  useEffect(() => {
    paint();
    invalidate();
  }, [facelets, highlight, paint, invalidate]);

  /** Avvia l'animazione di una mossa. */
  useEffect(() => {
    if (!animate || animate.id === lastAnimId.current) return;
    if (!cubeRef.current || !sceneRef.current) return;
    lastAnimId.current = animate.id;

    const { move, slow } = animate;
    const axis = NORMAL[move.face].clone();
    const target = turnAngle(move.power);

    const pivot = new THREE.Group();
    cubeRef.current.add(pivot);
    const members: THREE.Mesh[] = [];
    for (const { mesh, pos } of cubiesRef.current) {
      if (inLayer(move.face, pos.x, pos.y, pos.z)) {
        pivot.attach(mesh);
        members.push(mesh);
      }
    }

    anim.current = {
      pivot,
      axis,
      target,
      current: 0,
      speed: (slow ? 1.1 : 2.6) * Math.sign(target),
      members,
    };
    invalidate();
  }, [animate, invalidate]);

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      const renderer = new Renderer({ gl, alpha: true });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        38,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        100,
      );
      camera.position.set(0, 0, 9.2);
      cameraRef.current = camera;

      scene.add(new THREE.AmbientLight(0xffffff, 1.15));
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(4, 6, 8);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.45);
      fill.position.set(-5, -3, -6);
      scene.add(fill);

      const group = new THREE.Group();
      cubeRef.current = group;
      scene.add(group);

      const geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
      const cubies: { mesh: THREE.Mesh; pos: THREE.Vector3 }[] = [];
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            if (x === 0 && y === 0 && z === 0) continue;
            const materials = MATERIAL_FACE.map(
              () => new THREE.MeshLambertMaterial({ color: PLASTIC }),
            );
            const mesh = new THREE.Mesh(geometry, materials);
            mesh.position.set(x, y, z);
            group.add(mesh);
            cubies.push({ mesh, pos: new THREE.Vector3(x, y, z) });
          }
        }
      }
      cubiesRef.current = cubies;
      paint();

      let last = Date.now();
      const loop = () => {
        frame = requestAnimationFrame(loop);
        const now = Date.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (spinRef.current) {
          orientation.current.y += dt * 0.35;
          needsRender.current = true;
        }

        // Niente da mostrare di nuovo: saltiamo il disegno e lasciamo
        // respirare processore e batteria.
        if (!needsRender.current && !anim.current) return;

        group.rotation.x = orientation.current.x;
        group.rotation.y = orientation.current.y;

        const a = anim.current;
        if (a) {
          a.current += a.speed * dt;
          const done = Math.abs(a.current) >= Math.abs(a.target);
          const angle = done ? a.target : a.current;
          a.pivot.setRotationFromAxisAngle(a.axis, angle);
          if (done) {
            // Riporta i cubetti nel gruppo principale e aggiorna la loro posizione
            // logica, cosi la mossa successiva parte da uno stato coerente.
            for (const mesh of a.members) {
              group.attach(mesh);
              const entry = cubiesRef.current.find((c) => c.mesh === mesh)!;
              entry.pos.set(
                Math.round(mesh.position.x),
                Math.round(mesh.position.y),
                Math.round(mesh.position.z),
              );
              mesh.position.copy(entry.pos);
              mesh.rotation.set(0, 0, 0);
            }
            group.remove(a.pivot);
            anim.current = null;
            paint();
            onAnimationEnd?.();
          }
        }

        needsRender.current = false;
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };

      let frame = requestAnimationFrame(loop);
      stopLoop.current = () => cancelAnimationFrame(frame);
    },
    [paint, onAnimationEnd],
  );

  // Quando il componente sparisce, fermiamo il ciclo: senza questo, uscendo
  // da una schermata il disegno continuerebbe a girare a vuoto.
  useEffect(() => () => stopLoop.current?.(), []);

  return (
    <View style={[styles.wrap, style]} {...(interactive ? panResponder.panHandlers : {})}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      {arrow ? (
        <View pointerEvents="none" style={styles.arrowLayer}>
          <Text style={styles.arrow}>{ARROW_EMOJI[arrow]}</Text>
        </View>
      ) : null}
      {interactive ? (
        <View pointerEvents="none" style={styles.hintLayer}>
          <Text style={styles.hint}>✋ trascina per girare il cubo</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 380,
  },
  arrowLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 96,
    opacity: 0.92,
    textShadowColor: '#00000066',
    textShadowRadius: 8,
  },
  hintLayer: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
});
