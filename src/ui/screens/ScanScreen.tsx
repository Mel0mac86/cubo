import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import FaceGrid from '../components/FaceGrid';
import Rubi, { RubiMood } from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { CubeColor, Face } from '../../core/cube/defs';
import { analyzeFrame } from '../../core/vision/frame';
import {
  SCAN_ORDER,
  ScannerState,
  crossCheck,
  faceChecklist,
  finalizeScan,
  newScanner,
  pushFrame,
  readyForNextFace,
} from '../../core/vision/scanner';
import { grabFrame } from '../../services/camera';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Scansione'>;

/** Il lato della cornice di guida, in frazione della larghezza dello schermo. */
const GUIDE_FRACTION = 0.72;
/** Ogni quanto guardiamo un fotogramma. Piu' lento = meno batteria. */
const FRAME_INTERVAL_MS = 420;

/**
 * Scansione guidata.
 *
 * Il bambino non deve sapere niente di orientamenti: mette il cubo nella
 * cornice, l'app scatta da sola quando l'immagine e' buona e poi gli dice
 * esattamente come girare il cubo per la faccia successiva.
 */
export default function ScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const scanner = useRef<ScannerState>(newScanner());
  const previousGray = useRef<Float32Array | undefined>(undefined);
  const busy = useRef(false);
  const alive = useRef(true);

  const session = useSession();
  const { updateProgress } = useStore();
  const { speak } = useVoice();

  const [tick, setTick] = useState(0);
  const [explaining, setExplaining] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  const state = scanner.current;
  const stepInfo = SCAN_ORDER[state.stepIndex];
  const checklist = faceChecklist(state);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Un giro del ciclo: prendi un fotogramma, analizzalo, aggiorna lo stato. */
  const step = useCallback(async () => {
    if (busy.current || !cameraRef.current || explaining) return;
    busy.current = true;
    try {
      const frame = await grabFrame(cameraRef.current);
      if (!frame || !alive.current) return;

      const side = Math.round(frame.width * GUIDE_FRACTION);
      const region = {
        x: Math.round((frame.width - side) / 2),
        y: Math.round((frame.height - side) / 2),
        w: side,
        h: side,
      };

      const analysis = analyzeFrame(frame, { region, previousGray: previousGray.current });
      previousGray.current = analysis.gray;

      const before = scanner.current.captured.length;
      const update = pushFrame(scanner.current, analysis);
      if (update.speak) speak(update.speak);

      if (scanner.current.captured.length > before) {
        updateProgress((p) => {
          p.facesEntered += 1;
        });
        const check = crossCheck(scanner.current);
        if (!check.ok) setProblem(check.message ?? null);
      }

      if (update.done) {
        finish();
      }
      setTick((t) => t + 1);
    } catch {
      // Un fotogramma perso non e' un problema: si riprova al giro dopo.
    } finally {
      busy.current = false;
    }
  }, [explaining, speak, updateProgress]);

  useEffect(() => {
    if (explaining) return;
    const id = setInterval(step, FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, [step, explaining]);

  const finish = () => {
    try {
      const { assignment, colorToFace } = finalizeScan(scanner.current);
      // Rimettiamo i colori nell'ordine dei 54 quadratini e li passiamo alla
      // sessione: da qui in poi il percorso e' identico a quello manuale,
      // compresa la possibilita' di correggere a mano.
      session.setColors(assignment.colors as unknown as (CubeColor | null)[]);
      updateProgress((p) => {
        p.modeUsage.scansione = (p.modeUsage.scansione ?? 0) + 1;
      });
      navigation.navigate('AnteprimaScansione', {
        uncertain: assignment.uncertain,
      });
    } catch {
      setProblem('Mi sono perso qualche faccia. Riproviamo?');
    }
  };

  /* --- permessi --- */
  if (!permission) {
    return (
      <Screen title="Un attimo..." emoji="📷">
        <Rubi says="Sto accendendo la fotocamera..." mood="pensieroso" />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen title="Mi serve la fotocamera" emoji="📷">
        <Rubi
          says="Per guardare il tuo cubo mi serve il permesso di usare la fotocamera. La uso solo per riconoscere i colori: le foto non vengono salvate ne mandate a nessuno."
          mood="pensieroso"
        />
        <BigButton label="Va bene, usa la fotocamera" emoji="✅" color={colors.success} onPress={requestPermission} />
        <BigButton
          label="Preferisco scegliere i colori io"
          emoji="✏️"
          color={colors.info}
          onPress={() => navigation.replace('InserisciColori', { faceStep: 0 })}
        />
      </Screen>
    );
  }

  /* --- spiegazione di come tenere il cubo --- */
  if (explaining) {
    return (
      <Screen
        title="Ti spiego come tenerlo"
        emoji="👐"
        footer={
          <BigButton
            label="Sono pronto!"
            emoji="👍"
            color={colors.success}
            giant
            onPress={() => {
              setExplaining(false);
              readyForNextFace(scanner.current);
              speak('Perfetto! Metti il cubo dentro il quadrato e tienilo fermo.');
            }}
          />
        }
      >
        <Rubi
          says="Perfetto! Useremo la fotocamera per guardare il tuo cubo. Tienilo con tutte e due le mani ai lati, senza coprire i quadratini. Non preoccuparti: ti diro io quando girarlo!"
          mood="felice"
        />
        <Card>
          <Text style={styles.tipTitle}>Come tenere il cubo</Text>
          <Text style={styles.tipRow}>🤚 Mano sinistra a sinistra</Text>
          <Text style={styles.tipRow}>✋ Mano destra a destra</Text>
          <Text style={styles.tipRow}>👀 La faccia da guardare verso di me</Text>
          <Text style={styles.tipRow}>💡 Meglio in una stanza illuminata</Text>
        </Card>
        <BigButton
          label="Preferisco scegliere i colori io"
          emoji="✏️"
          color={colors.bgSoft}
          onPress={() => navigation.replace('InserisciColori', { faceStep: 0 })}
        />
      </Screen>
    );
  }

  /* --- scansione vera e propria --- */
  const preview = state.preview;
  const mood: RubiMood = state.phase === 'conto-alla-rovescia' ? 'sorpreso' : 'felice';

  return (
    <View style={styles.full}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Text style={styles.counter}>
            {state.captured.length}/6 facce {'⭐'.repeat(state.captured.length)}
          </Text>
          <View style={styles.checklist}>
            {checklist.map((c) => (
              <Text key={c.face} style={styles.checkItem}>
                {c.emoji} {c.done ? '✅' : '⬜'}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.guideWrap} pointerEvents="none">
          <View style={[styles.guide, state.phase === 'conto-alla-rovescia' && styles.guideReady]}>
            {/* La griglia 3x3 sovrapposta al cubo vero */}
            {[0, 1, 2].map((r) => (
              <View key={r} style={styles.guideRow}>
                {[0, 1, 2].map((c) => {
                  const i = r * 3 + c;
                  const col = preview?.colors[i];
                  const sure = (preview?.confidences[i] ?? 0) >= 0.7;
                  return (
                    <View
                      key={c}
                      style={[
                        styles.guideCell,
                        col !== undefined && {
                          borderColor: sure ? '#FFFFFF' : colors.primary,
                          borderWidth: sure ? 2 : 4,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottom}>
          {preview ? (
            <View style={styles.previewWrap}>
              <FaceGrid
                cells={preview.colors as unknown as (CubeColor | null)[]}
                confidences={preview.confidences}
                size={140}
              />
            </View>
          ) : null}

          <Rubi says={problem ?? state.message} mood={problem ? 'pensieroso' : mood} compact />

          {state.phase === 'gira-il-cubo' ? (
            <BigButton
              label="Fatto, ho girato il cubo!"
              emoji="🔄"
              color={colors.success}
              onPress={() => {
                readyForNextFace(scanner.current);
                setTick((t) => t + 1);
              }}
            />
          ) : null}

          {problem ? (
            <BigButton
              label="Sistemo io i colori"
              emoji="✏️"
              color={colors.primary}
              onPress={() => navigation.replace('InserisciColori', { faceStep: 0 })}
            />
          ) : null}

          <Text
            style={styles.escape}
            onPress={() => navigation.replace('InserisciColori', { faceStep: 0 })}
          >
            ✏️ Non funziona? Scegli tu i colori
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    paddingTop: 56,
    paddingHorizontal: space.md,
    gap: space.xs,
  },
  counter: {
    color: '#FFFFFF',
    fontSize: font.title,
    fontWeight: '900',
    textShadowColor: '#000000AA',
    textShadowRadius: 6,
  },
  checklist: {
    flexDirection: 'row',
    gap: space.sm,
  },
  checkItem: {
    fontSize: 16,
  },
  guideWrap: {
    alignItems: 'center',
  },
  guide: {
    width: '72%',
    aspectRatio: 1,
    borderWidth: 5,
    borderColor: '#FFFFFFAA',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  guideReady: {
    borderColor: colors.success,
  },
  guideRow: {
    flex: 1,
    flexDirection: 'row',
  },
  guideCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#FFFFFF44',
  },
  bottom: {
    backgroundColor: '#2E1065EE',
    padding: space.md,
    gap: space.sm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  previewWrap: {
    alignItems: 'center',
  },
  escape: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: font.small,
    fontWeight: '700',
    padding: space.sm,
  },
  tipTitle: {
    fontSize: font.body,
    fontWeight: '900',
    color: colors.text,
  },
  tipRow: {
    fontSize: font.body,
    color: colors.textSoft,
    fontWeight: '700',
  },
});
