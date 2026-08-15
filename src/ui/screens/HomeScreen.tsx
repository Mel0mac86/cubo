import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import CubeView from '../components/CubeView';
import Rubi from '../components/Rubi';
import Screen from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useStore } from '../state/store';
import { useVoice } from '../state/voice';
import { useSession } from '../state/cubeSession';
import { cubieToFacelet, identityCube } from '../../core/cube/cubie';
import { CLASSIC_COLORS } from '../../core/cube/scheme';
import { applyMoves } from '../../core/cube/moves';
import { makeRng, randomMoveSequence } from '../../core/cube/scramble';
import { colors, font, space } from '../theme';
import { heroTitle } from '../../core/kids/achievements';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const GREETING = 'Ciao! Sono Rubi! Ti aiutero a risolvere il tuo cubo!';

/**
 * Un cubo mescolato in modo carino da far girare nella schermata iniziale.
 * Qui usiamo la corrispondenza classica fra facce e colori (sopra bianco,
 * davanti verde, e cosi via): serve solo per la vetrina.
 */
const SHOWCASE = cubieToFacelet(
  applyMoves(identityCube(), randomMoveSequence(8, makeRng(20250815))),
).map((f) => CLASSIC_COLORS[f]);

export default function HomeScreen({ navigation }: Props) {
  const { progress } = useStore();
  const { repeat } = useVoice();
  const session = useSession();

  const name = progress.nickname ? `${progress.nickname}` : null;
  const greeting = name ? `Ciao ${name}! 👋 Sono Rubi! Ti aiutero a risolvere il tuo cubo!` : `Ciao! 👋 Sono Rubi!\nTi aiutero a risolvere il tuo cubo!`;

  const startSolving = () => {
    session.clear();
    navigation.navigate('ComeInserire');
  };

  return (
    <Screen>
      <CubeView facelets={SHOWCASE} spin interactive={false} style={styles.cube} />

      <Rubi says={greeting} onRepeat={() => repeat(GREETING)} />

      <BigButton
        label="INIZIAMO!"
        emoji="🚀"
        giant
        color={colors.primary}
        onPress={startSolving}
      />

      <View style={styles.menu}>
        <BigButton
          label="Risolvi il mio cubo"
          emoji="🧩"
          color={colors.success}
          onPress={startSolving}
        />
        <BigButton
          label="Impara a risolverlo"
          emoji="🎓"
          color={colors.info}
          onPress={() => navigation.navigate('Impara')}
        />
        <BigButton
          label="Giochiamo"
          emoji="🎮"
          color={colors.pink}
          onPress={() => navigation.navigate('MiniGiochi')}
        />
        <BigButton
          label="Le mie conquiste"
          emoji="🏆"
          color={colors.purple}
          sub={`${progress.stars} stelle · ${heroTitle(progress)}`}
          onPress={() => navigation.navigate('Conquiste')}
        />
        <BigButton
          label="Impostazioni"
          emoji="⚙️"
          color={colors.bgSoft}
          onPress={() => navigation.navigate('Impostazioni')}
        />
      </View>

      <Text style={styles.parent} onPress={() => navigation.navigate('AreaGenitore')}>
        👨‍👩‍👧 Area genitore
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cube: {
    maxHeight: 260,
  },
  menu: {
    marginTop: space.sm,
  },
  parent: {
    marginTop: space.lg,
    textAlign: 'center',
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
    padding: space.md,
  },
});
