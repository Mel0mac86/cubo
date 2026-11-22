import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import ColorTally from '../components/ColorTally';
import FaceGrid from '../components/FaceGrid';
import Rubi from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useSession } from '../state/cubeSession';
import { useVoice } from '../state/voice';
import { CubeColor, Face } from '../../core/cube/defs';
import { QUADRATINI_PER_COLORE_4 } from '../../core/kids/entry';
import { Rapporto4, validaCubo4 } from '../../core/cube4/validator4';
import { NonRisolvibile4, risolvi4 } from '../../core/cube4/solver4';
import { libreria } from '../../core/cube4/macro';
import { colors, font, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Cubo4Controllo'>;

const FACCE: { faccia: Face; nome: string }[] = [
  { faccia: Face.F, nome: 'Davanti' },
  { faccia: Face.R, nome: 'Destra' },
  { faccia: Face.B, nome: 'Dietro' },
  { faccia: Face.L, nome: 'Sinistra' },
  { faccia: Face.U, nome: 'Sopra' },
  { faccia: Face.D, nome: 'Sotto' },
];

/**
 * Controllo e soluzione del cubo grande.
 *
 * I controlli non sono quelli del cubo normale, e la differenza piu'
 * importante e' questa: sul 4x4 certe situazioni che sul 3x3 sarebbero la
 * prova di un errore (uno spigolo girato da solo, due spigoli scambiati) sono
 * invece del tutto normali. Rifiutarle manderebbe il bambino a ricontrollare
 * all'infinito dei colori giustissimi.
 */
export default function Cubo4ControlloScreen({ navigation }: Props) {
  const session = useSession();
  const { speak, repeat } = useVoice();

  const [rapporto, setRapporto] = useState<Rapporto4 | null>(null);
  const [calcolo, setCalcolo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setRapporto(validaCubo4(session.colori4)), 700);
    return () => clearTimeout(t);
  }, [session.colori4]);

  const dice = useMemo(() => {
    if (!rapporto) return 'Controllo il tuo cubo grande...';
    if (rapporto.valid) {
      return 'Il tuo cubo grande e pronto! Sara piu lungo del solito: un cubo 4 per 4 ha quasi il doppio dei quadratini. Ma ci arriviamo insieme, un pezzo alla volta.';
    }
    const rotto = rapporto.checks.find((c) => !c.ok && c.message);
    return `Credo che abbiamo colorato qualcosa nel modo sbagliato. ${rotto?.message ?? 'Controlliamo insieme!'}`;
  }, [rapporto]);

  useEffect(() => {
    speak(dice);
  }, [dice, speak]);

  const risolvi = () => {
    setCalcolo(true);
    setErrore(null);
    // Il calcolo occupa il thread principale: senza questo respiro la
    // schermata resterebbe congelata senza nemmeno mostrare "sto pensando".
    setTimeout(() => {
      try {
        libreria(); // si costruisce una volta sola, un paio di secondi
        const colori = Uint8Array.from(session.colori4 as CubeColor[]);
        // Sul cubo grande si usa sempre il motore piu' corto, anche in
        // modalita' facile: la riduzione da sola e' gia' un centinaio di
        // mosse, e il metodo a strati ne aggiungerebbe altre novanta (227 di
        // media invece di 139, misurate). Per un bambino e' la differenza fra
        // una cosa lunga e una impossibile.
        const sol = risolvi4(colori, { motore: 'kociemba' });
        if (!sol.verificata) throw new NonRisolvibile4('La soluzione non torna.');
        session.setSoluzione4(sol);
        navigation.navigate('Cubo4Risolvi');
      } catch (e) {
        setErrore(
          e instanceof NonRisolvibile4
            ? 'Uffa, su questo cubo non riesco a trovare la strada. Ricontrolliamo i colori?'
            : 'Qualcosa non ha funzionato. Riproviamo?',
        );
      } finally {
        setCalcolo(false);
      }
    }, 80);
  };

  if (!rapporto) {
    return (
      <Screen title="Controllo del cubo grande" emoji="🔍" scroll={false}>
        <Rubi says={dice} mood="pensieroso" />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.lg }} />
      </Screen>
    );
  }

  if (rapporto.valid) {
    return (
      <Screen
        title="IL CUBO GRANDE E PRONTO!"
        emoji="🎉"
        footer={
          <BigButton
            label={calcolo ? 'Sto studiando il cubo grande...' : 'RISOLVI IL CUBO GRANDE!'}
            emoji={calcolo ? '🧠' : '🚀'}
            color={colors.success}
            giant
            disabled={calcolo}
            onPress={risolvi}
          />
        }
      >
        <Rubi says={dice} mood="festa" onRepeat={() => repeat(dice)} />
        <Card>
          {rapporto.checks.map((c) => (
            <View key={c.id} style={styles.riga}>
              <Text style={styles.icona}>✅</Text>
              <Text style={styles.etichetta}>{c.label}</Text>
            </View>
          ))}
        </Card>
        {errore ? <Text style={styles.errore}>{errore}</Text> : null}
      </Screen>
    );
  }

  const sospetta = rapporto.suspects.length ? Math.floor(rapporto.suspects[0] / 16) : null;
  const facciaMostrata = (sospetta ?? Face.F) as Face;

  return (
    <Screen
      title="Hmm... qualcosa non torna!"
      emoji="🤔"
      footer={
        <View style={{ gap: space.xs }}>
          <BigButton
            label="RIFACCIAMO I COLORI"
            emoji="✏️"
            color={colors.primary}
            onPress={() => {
              session.clear4();
              navigation.navigate('Cubo4Colori', { faccia: 0 });
            }}
          />
        </View>
      }
    >
      <Rubi says={dice} mood="pensieroso" onRepeat={() => repeat(dice)} />

      <View style={styles.griglia}>
        <FaceGrid
          cells={Array.from({ length: 16 }, (_, i) => session.colori4[facciaMostrata * 16 + i])}
          n={4}
          suspects={rapporto.suspects.filter((s) => Math.floor(s / 16) === facciaMostrata).map((s) => s % 16)}
          caption={`Faccia ${FACCE.find((f) => f.faccia === facciaMostrata)?.nome ?? ''}`}
        />
      </View>

      <Card>
        <Text style={styles.nota}>
          🔢 Su un cubo grande ogni colore compare <Text style={styles.forte}>16 volte</Text>.
        </Text>
        <View style={styles.conti}>
          <ColorTally cells={session.colori4} perColore={QUADRATINI_PER_COLORE_4} />
        </View>
      </Card>

      <Card>
        {rapporto.checks
          .filter((c) => c.message || c.ok)
          .map((c) => (
            <View key={c.id} style={styles.riga}>
              <Text style={styles.icona}>{c.ok ? '✅' : '❌'}</Text>
              <Text style={[styles.etichetta, !c.ok && styles.fallito]}>{c.label}</Text>
            </View>
          ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  riga: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icona: { fontSize: 20 },
  etichetta: { flex: 1, color: colors.text, fontSize: font.small, fontWeight: '700' },
  fallito: { color: colors.danger },
  griglia: { alignItems: 'center', marginVertical: space.md },
  nota: { color: colors.text, fontSize: font.body, lineHeight: 26 },
  forte: { fontWeight: '900' },
  conti: { marginTop: space.sm, backgroundColor: '#1E1B4B', borderRadius: 12, paddingVertical: space.sm },
  errore: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: space.md,
  },
});
