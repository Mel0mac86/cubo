import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { Face } from '../core/cube/defs';
import { colors } from './theme';
import ErrorBoundary from './components/ErrorBoundary';

import HomeScreen from './screens/HomeScreen';
import ChooseInputScreen from './screens/ChooseInputScreen';
import ColorInputScreen from './screens/ColorInputScreen';
import ScanScreen from './screens/ScanScreen';
import FixColorsScreen from './screens/FixColorsScreen';
import CheckScreen from './screens/CheckScreen';
import SolveScreen from './screens/SolveScreen';
import FinishScreen from './screens/FinishScreen';
import LearnScreen from './screens/LearnScreen';
import LevelScreen from './screens/LevelScreen';
import PracticeScreen from './screens/PracticeScreen';
import MiniGamesScreen from './screens/MiniGamesScreen';
import AchievementsScreen from './screens/AchievementsScreen';
import SettingsScreen from './screens/SettingsScreen';
import ParentScreen from './screens/ParentScreen';
import ChallengeScreen from './screens/ChallengeScreen';

export type PracticeGoal =
  | 'cross'
  | 'firstLayer'
  | 'secondLayer'
  | 'topCross'
  | 'topCorners'
  | 'solved';

export type RootStackParamList = {
  Home: undefined;
  ComeInserire: undefined;
  InserisciColori: { faceStep: number };
  Scansione: undefined;
  AnteprimaScansione: { uncertain?: number[] };
  Correggi: { face?: Face };
  Controllo: undefined;
  Risolvi: undefined;
  Finito: { moves: number; timeMs?: number; usedHelp: boolean };
  Impara: undefined;
  Livello: { level: number };
  Allenamento: { scramble: string; goal: PracticeGoal; level: number };
  MiniGiochi: undefined;
  Conquiste: undefined;
  Impostazioni: undefined;
  AreaGenitore: undefined;
  Sfida: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Intestazioni: titolo grande e pulsante indietro sempre presente, perche' un
 * bambino che si perde deve poter tornare indietro senza chiedere aiuto.
 */
/**
 * Avvolge una schermata nella sua barriera: se si rompe, il bambino puo'
 * tornare indietro e usare il resto dell'app invece di restare bloccato.
 */
function protetta<P extends object>(Componente: React.ComponentType<P>, nome: string) {
  return function Protetta(props: P) {
    return (
      <ErrorBoundary nome={nome}>
        <Componente {...props} />
      </ErrorBoundary>
    );
  };
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.bgSoft },
          headerTintColor: colors.textOnDark,
          headerTitleStyle: { fontWeight: '900', fontSize: 20 },
          headerBackTitle: 'Indietro',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Home" component={protetta(HomeScreen, "Home")} options={{ headerShown: false }} />
        <Stack.Screen name="ComeInserire" component={protetta(ChooseInputScreen, "ComeInserire")} options={{ title: 'Il tuo cubo' }} />
        <Stack.Screen name="InserisciColori" component={protetta(ColorInputScreen, "InserisciColori")} options={{ title: 'I colori' }} />
        <Stack.Screen name="Scansione" component={protetta(ScanScreen, "Scansione")} options={{ title: 'Scansione', headerShown: false }} />
        <Stack.Screen name="AnteprimaScansione" component={protetta(FixColorsScreen, "AnteprimaScansione")} options={{ title: 'Controlla' }} />
        <Stack.Screen name="Correggi" component={protetta(FixColorsScreen, "Correggi")} options={{ title: 'Correggi' }} />
        <Stack.Screen name="Controllo" component={protetta(CheckScreen, "Controllo")} options={{ title: 'Controllo' }} />
        <Stack.Screen name="Risolvi" component={protetta(SolveScreen, "Risolvi")} options={{ title: 'Risolviamo!' }} />
        <Stack.Screen name="Finito" component={protetta(FinishScreen, "Finito")} options={{ title: 'Bravissimo!' }} />
        <Stack.Screen name="Impara" component={protetta(LearnScreen, "Impara")} options={{ title: 'La scuola di Rubi' }} />
        <Stack.Screen name="Livello" component={protetta(LevelScreen, "Livello")} options={{ title: 'Lezione' }} />
        <Stack.Screen name="Allenamento" component={protetta(PracticeScreen, "Allenamento")} options={{ title: 'Allenamento' }} />
        <Stack.Screen name="MiniGiochi" component={protetta(MiniGamesScreen, "MiniGiochi")} options={{ title: 'Giochiamo' }} />
        <Stack.Screen name="Conquiste" component={protetta(AchievementsScreen, "Conquiste")} options={{ title: 'Conquiste' }} />
        <Stack.Screen name="Impostazioni" component={protetta(SettingsScreen, "Impostazioni")} options={{ title: 'Impostazioni' }} />
        <Stack.Screen name="AreaGenitore" component={protetta(ParentScreen, "AreaGenitore")} options={{ title: 'Area genitore' }} />
        <Stack.Screen name="Sfida" component={protetta(ChallengeScreen, "Sfida")} options={{ title: 'Sfida a tempo' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
