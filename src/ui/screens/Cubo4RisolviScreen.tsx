import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Rubi from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { ARROW_EMOJI } from '../../core/kids/instructions';
import { descriviMossa4 } from '../../core/kids/istruzioni4';
import { colors, font, radius, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Cubo4Risolvi'>;

/**
 * La soluzione del cubo grande, un passo alla volta.
 *
 * Qui conta soprattutto non far perdere il bambino: la soluzione e' lunga
 * (centoquaranta mosse circa), quindi si vede sempre a che punto si e' DENTRO
 * LA FASE, non solo sul totale. Le quattro fasi hanno un senso raccontabile
 * ("adesso rimettiamo insieme i quadrati in mezzo"), e questo trasforma una
 * lista infinita in quattro traguardi raggiungibili.
 *
 * La differenza piu' importante rispetto al cubo normale: certe mosse girano
 * DUE strati insieme. E' l'errore piu' comune, quindi e' scritto a lettere
 * grandi nella mossa, non lasciato a un simbolo.
 */
export default function Cubo4RisolviScreen({ navigation }: Props) {
  const session = useSession();
  const { settings } = useStore();
  const { speak, repeat } = useVoice();
  const [i, setI] = useState(0);

  const soluzione = session.soluzione4;
  const mosse = useMemo(() => soluzione?.mosse ?? [], [soluzione]);

  // A quale fase appartiene la mossa corrente, e quanto manca alla fine di quella fase.
  const fase = useMemo(() => {
    if (!soluzione) return null;
    let inizio = 0;
    for (const f of soluzione.fasi) {
      if (i < inizio + f.mosse.length) return { ...f, inizio, dentro: i - inizio };
      inizio += f.mosse.length;
    }
    const ultima = soluzione.fasi[soluzione.fasi.length - 1];
    return ultima ? { ...ultima, inizio: mosse.length - ultima.mosse.length, dentro: ultima.mosse.length } : null;
  }, [soluzione, i, mosse.length]);

  const finito = i >= mosse.length;
  const istruzione = finito ? null : descriviMossa4(mosse[i], settings.difficulty);

  const dice = useMemo(() => {
    if (finito) return 'Finito!! Hai risolto un cubo 4 per 4. E molto piu difficile di quello normale: sei stato bravissimo davvero.';
    if (!istruzione || !fase) return '';
    if (fase.dentro === 0) return `${fase.titolo}. ${fase.obiettivo} ${istruzione.parlato}`;
    return istruzione.parlato;
  }, [finito, istruzione, fase]);

  useEffect(() => {
    speak(dice);
  }, [dice, speak]);

  if (!soluzione) {
    return (
      <Screen title="Soluzione" emoji="🧩">
        <Rubi says="Non ho ancora una soluzione per il cubo grande. Torniamo a scegliere i colori!" mood="pensieroso" />
        <BigButton
          label="SCEGLIAMO I COLORI"
          emoji="✏️"
          color={colors.primary}
          onPress={() => navigation.navigate('Cubo4Colori', { faccia: 0 })}
        />
      </Screen>
    );
  }

  if (finito) {
    return (
      <Screen
        title="CUBO GRANDE RISOLTO!"
        emoji="🏆"
        footer={
          <BigButton
            label="TORNA ALL INIZIO"
            emoji="🏠"
            color={colors.success}
            giant
            onPress={() => {
              session.clear4();
              navigation.navigate('Home');
            }}
          />
        }
      >
        <Rubi says={dice} mood="festa" onRepeat={() => repeat(dice)} />
        <Card>
          <Text style={styles.nota}>
            Hai fatto <Text style={styles.forte}>{mosse.length} mosse</Text> in quattro tappe. Un
            cubo 4 per 4 ha 96 quadratini invece di 54: e un altro sport!
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title={`MOSSA ${i + 1} DI ${mosse.length}`}
      footer={
        <View style={{ gap: space.xs }}>
          <BigButton
            label="FATTO, AVANTI!"
            emoji="👍"
            color={colors.success}
            giant
            onPress={() => setI((k) => k + 1)}
          />
          {i > 0 ? (
            <BigButton label="Torna indietro" emoji="↩️" color={colors.bgSoft} onPress={() => setI((k) => k - 1)} />
          ) : null}
        </View>
      }
    >
      {fase ? (
        <View style={styles.fasi}>
          {soluzione.fasi.map((f, k) => (
            <View key={f.id} style={[styles.fase, f.id === fase.id && styles.faseAttiva]}>
              <Text style={[styles.faseNum, f.id === fase.id && styles.faseNumAttivo]}>{k + 1}</Text>
            </View>
          ))}
          <Text style={styles.faseTitolo}>{fase.titolo}</Text>
        </View>
      ) : null}

      <Rubi says={dice} mood="felice" onRepeat={() => repeat(dice)} compact />

      {istruzione ? (
        <Pressable style={styles.mossa} onPress={() => repeat(istruzione.parlato)}>
          <Text style={styles.freccia}>{ARROW_EMOJI[istruzione.freccia]}</Text>
          <Text style={styles.testo}>{istruzione.testo}</Text>
          {istruzione.doppia ? (
            <View style={styles.doppia}>
              <Text style={styles.doppiaTesto}>✌️ DUE STRATI INSIEME</Text>
            </View>
          ) : null}
          {istruzione.suggerimento ? <Text style={styles.aiuto}>{istruzione.suggerimento}</Text> : null}
          {settings.difficulty !== 'facile' ? (
            <Text style={styles.notazione}>I grandi la chiamano {istruzione.notazione}</Text>
          ) : null}
        </Pressable>
      ) : null}

      {fase ? (
        <Text style={styles.avanzamento}>
          {fase.titolo}: mossa {fase.dentro + 1} di {fase.mosse.length}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fasi: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  fase: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#00000044',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faseAttiva: { backgroundColor: colors.primary },
  faseNum: { color: colors.muted, fontWeight: '900', fontSize: 13 },
  faseNumAttivo: { color: '#FFFFFF' },
  faseTitolo: { color: colors.textOnDark, fontWeight: '900', fontSize: font.small, marginLeft: space.sm },
  mossa: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
    alignItems: 'center',
  },
  freccia: { fontSize: 64 },
  testo: { fontSize: font.title, fontWeight: '900', color: colors.text, textAlign: 'center' },
  doppia: {
    marginTop: space.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: space.md,
  },
  doppiaTesto: { color: '#FFFFFF', fontWeight: '900', fontSize: font.small },
  aiuto: { marginTop: space.sm, color: colors.textSoft, fontSize: font.small, textAlign: 'center', lineHeight: 22 },
  notazione: { marginTop: space.sm, color: colors.muted, fontSize: font.small, fontWeight: '700' },
  avanzamento: {
    marginTop: space.md,
    textAlign: 'center',
    color: colors.textOnDark,
    fontSize: font.small,
    fontWeight: '800',
  },
  nota: { color: colors.text, fontSize: font.body, lineHeight: 26 },
  forte: { fontWeight: '900' },
});
