import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import BigButton from '../components/BigButton';
import Rubi from '../components/Rubi';
import Screen, { Card } from '../components/Screen';
import { RootStackParamList } from '../navigation';
import { useVoice } from '../state/voice';
import { colors, font, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ComeInserire'>;

const SAYS =
  'Prima dobbiamo conoscere il tuo cubo! Ti faro vedere sei facce e tu mi dirai quali colori vedi. E facilissimo, ti guido io.';

/**
 * Il bivio fra fotocamera e inserimento a mano.
 * La modalita' manuale non e' un ripiego nascosto: e' sempre in vista, perche'
 * su un telefono vecchio o con poca luce e' la strada piu' veloce.
 */
export default function ChooseInputScreen({ navigation }: Props) {
  const { speak, repeat } = useVoice();

  React.useEffect(() => {
    speak(SAYS);
  }, [speak]);

  return (
    <Screen title="Che colori ha il tuo cubo?" emoji="🎨">
      <Rubi says={SAYS} onRepeat={() => repeat(SAYS)} />

      <BigButton
        label="Scansiona il mio cubo"
        emoji="📷"
        sub="Uso la fotocamera e faccio tutto io"
        color={colors.success}
        giant
        onPress={() => navigation.navigate('Scansione')}
      />

      <BigButton
        label="Scelgo io i colori"
        emoji="✏️"
        sub="Tocco i quadratini uno a uno"
        color={colors.info}
        onPress={() => navigation.navigate('InserisciColori', { faceStep: 0 })}
      />

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

const styles = StyleSheet.create({
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
