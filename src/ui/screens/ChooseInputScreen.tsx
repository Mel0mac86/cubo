import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Rubi from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useVoice } from '../state/voice';
import { COLOR_HEX, CubeColor } from '../../core/cube/defs';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ComeInserire'>;

const CHIEDE_TAGLIA =
  'Prima di tutto: che cubo hai in mano? Contali su una faccia sola. Se ogni fila ha tre quadratini e quello normale, se ne ha quattro e il cubo grande.';
const CHIEDE_MODO =
  'Benissimo! Adesso dimmi come preferisci: guardo io il cubo con la fotocamera, oppure mi dici tu i colori uno a uno.';

/**
 * Due domande, in quest'ordine: prima CHE CUBO, poi come inserirlo.
 *
 * Prima la taglia stava in fondo, come terzo pulsante sotto gli altri due.
 * Su un iPhone finiva sotto il bordo dello schermo (misurato: a 719 pixel su
 * 844, e le barre di Safari ne mangiano un altro centinaio), quindi chi aveva
 * un cubo 4x4 non lo vedeva proprio e finiva nel percorso del cubo normale,
 * ritrovandosi a inserire griglie da nove quadratini.
 *
 * Adesso la prima cosa che si vede e' la domanda giusta, con i due cubi
 * disegnati: un bambino li riconosce senza nemmeno leggere.
 */
export default function ChooseInputScreen({ navigation }: Props) {
  const { speak, repeat } = useVoice();
  const session = useSession();
  const [taglia, setTaglia] = React.useState<3 | 4 | null>(null);

  const dice = taglia === null ? CHIEDE_TAGLIA : CHIEDE_MODO;

  React.useEffect(() => {
    speak(dice);
  }, [dice, speak]);

  /**
   * Si riparte sempre da zero.
   * Senza questo, i colori di un tentativo precedente (per esempio una
   * scansione andata storta) restavano in memoria: le facce si aprivano gia'
   * colorate, il pulsante AVANTI era subito acceso e il bambino le sfogliava
   * senza guardarle. Alla fine il conto dei colori non tornava e sembrava
   * colpa sua.
   */
  const inizia = (dove: 'Scansione' | 'InserisciColori' | 'Cubo4Colori') => {
    session.clear();
    session.clear4();
    if (dove === 'Scansione') navigation.navigate('Scansione');
    else if (dove === 'Cubo4Colori') navigation.navigate('Cubo4Colori', { faccia: 0 });
    else navigation.navigate('InserisciColori', { faceStep: 0 });
  };

  /* --- prima domanda: che cubo hai? --- */
  if (taglia === null) {
    return (
      <Screen title="Che cubo hai?" emoji="🧩">
        <Rubi says={CHIEDE_TAGLIA} onRepeat={() => repeat(CHIEDE_TAGLIA)} />

        <View style={styles.scelte}>
          <SceltaCubo
            n={3}
            titolo="Quello normale"
            sotto="3 quadratini per fila"
            onPress={() => setTaglia(3)}
          />
          <SceltaCubo
            n={4}
            titolo="Quello grande"
            sotto="4 quadratini per fila"
            onPress={() => {
              setTaglia(4);
              inizia('Cubo4Colori');
            }}
          />
        </View>

        <Card style={styles.tip}>
          <Text style={styles.tipTitle}>💡 Come si contano</Text>
          <Text style={styles.tipText}>
            Guarda una faccia sola e conta i quadratini di una fila. Tre vuol dire cubo normale,
            quattro vuol dire cubo grande. Se ne ha cinque o piu, per adesso non lo so ancora
            risolvere!
          </Text>
        </Card>
      </Screen>
    );
  }

  /* --- seconda domanda, solo per il cubo normale: come li inseriamo? --- */
  return (
    <Screen title="Che colori ha il tuo cubo?" emoji="🎨">
      <Rubi says={CHIEDE_MODO} onRepeat={() => repeat(CHIEDE_MODO)} compact />

      <BigButton
        label="Scansiona il mio cubo"
        emoji="📷"
        sub="Uso la fotocamera e faccio tutto io"
        color={colors.success}
        giant
        onPress={() => inizia('Scansione')}
      />

      <BigButton
        label="Scelgo io i colori"
        emoji="✏️"
        sub="Tocco i quadratini uno a uno"
        color={colors.info}
        onPress={() => inizia('InserisciColori')}
      />

      <Pressable onPress={() => setTaglia(null)} accessibilityRole="button">
        <Text style={styles.indietro}>↩️ No aspetta, ho il cubo grande 4x4</Text>
      </Pressable>

      <Card style={styles.tip}>
        <Text style={styles.tipTitle}>💡 Un consiglio</Text>
        <Text style={styles.tipText}>
          Con la fotocamera e piu veloce, ma serve una stanza abbastanza illuminata. Se Rubi fa
          fatica a vedere i colori, puoi sempre sceglierli tu: si fa in un attimo.
        </Text>
      </Card>
    </Screen>
  );
}

/** Un cubo disegnato: si riconosce a colpo d'occhio, senza bisogno di leggere. */
function SceltaCubo({
  n,
  titolo,
  sotto,
  onPress,
}: {
  n: number;
  titolo: string;
  sotto: string;
  onPress: () => void;
}) {
  const vuoto = n >= 4 ? 3 : 4;
  const lato = (110 - vuoto * (n + 1)) / n;
  // Qualche colore sparso: un cubo vero non e' mai tutto di una tinta.
  const tinte: CubeColor[] = [
    CubeColor.White,
    CubeColor.Red,
    CubeColor.Green,
    CubeColor.Yellow,
    CubeColor.Orange,
    CubeColor.Blue,
  ];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titolo}, ${sotto}`}
      style={({ pressed }) => [styles.scelta, pressed && styles.sceltaPremuta]}
    >
      <View style={[styles.cubo, { width: 110, height: 110, gap: vuoto, padding: vuoto }]}>
        {Array.from({ length: n * n }, (_, i) => (
          <View
            key={i}
            style={{
              width: lato,
              height: lato,
              borderRadius: n >= 4 ? 3 : 4,
              backgroundColor: COLOR_HEX[tinte[(i * 5 + n) % 6]],
            }}
          />
        ))}
      </View>
      <Text style={styles.sceltaTitolo}>{titolo}</Text>
      <Text style={styles.sceltaSotto}>{sotto}</Text>
      <Text style={styles.sceltaMisura}>{n}×{n}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scelte: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  scelta: {
    flex: 1,
    maxWidth: 170,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderBottomWidth: 6,
    borderBottomColor: '#00000033',
  },
  sceltaPremuta: {
    transform: [{ translateY: 3 }],
    borderBottomWidth: 3,
  },
  cubo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#18181B',
    borderRadius: radius.sm,
  },
  sceltaTitolo: {
    marginTop: space.sm,
    fontSize: font.body,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  sceltaSotto: {
    fontSize: font.small,
    color: colors.textSoft,
    textAlign: 'center',
  },
  sceltaMisura: {
    marginTop: 2,
    fontSize: font.title,
    fontWeight: '900',
    color: colors.primary,
  },
  indietro: {
    marginTop: space.md,
    textAlign: 'center',
    color: colors.textOnDark,
    fontSize: font.small,
    fontWeight: '800',
  },
  tip: {
    marginTop: space.md,
  },
  tipTitle: {
    fontSize: font.body,
    fontWeight: '900',
    color: colors.text,
  },
  tipText: {
    fontSize: font.small,
    color: colors.textSoft,
    lineHeight: 24,
  },
});
