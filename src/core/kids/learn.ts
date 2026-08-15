/**
 * La scuola di Rubi: sei livelli.
 *
 * Ogni livello e' una sequenza di schede. Una scheda puo' essere una
 * spiegazione con animazione, un esercizio pratico sul cubo virtuale, oppure
 * una domanda a risposta multipla. Il contenuto sta qui (dati puri) cosi puo'
 * essere provato dai test e tradotto senza toccare l'interfaccia.
 */

import { Face } from '../cube/defs';

export type CardKind = 'spiega' | 'prova' | 'domanda';

export interface ExplainCard {
  kind: 'spiega';
  title: string;
  text: string;
  /** Animazione da mostrare: sequenza in notazione, oppure una posa. */
  demo?: string;
  /** Faccia da evidenziare. */
  highlight?: Face;
  rubi: string;
}

export interface PracticeCard {
  kind: 'prova';
  title: string;
  text: string;
  /** Mescolamento di partenza (notazione). */
  scramble: string;
  /**
   * Obiettivo da raggiungere. Corrisponde a una fase del solver a strati:
   * il livello e' superato quando quella fase risulta completata.
   */
  goal: 'cross' | 'firstLayer' | 'secondLayer' | 'topCross' | 'topCorners' | 'solved';
  rubi: string;
}

export interface QuizCard {
  kind: 'domanda';
  question: string;
  options: string[];
  answer: number;
  /** Spiegazione mostrata dopo la risposta, giusta o sbagliata che sia. */
  why: string;
}

export type LearnCard = ExplainCard | PracticeCard | QuizCard;

export interface LearnLevel {
  level: number;
  title: string;
  subtitle: string;
  stars: string;
  cards: LearnCard[];
}

export const LEARN_LEVELS: LearnLevel[] = [
  {
    level: 1,
    title: 'Conosciamo il cubo',
    subtitle: 'Chi sono i pezzi del cubo?',
    stars: '⭐',
    cards: [
      {
        kind: 'spiega',
        title: 'I centri comandano',
        text:
          'Guarda bene: il quadratino in mezzo a ogni faccia non si sposta mai, nemmeno se giri tutto! Sono loro a decidere di che colore sara ogni faccia.',
        demo: "R U R' U'",
        rubi: 'I centri sono i capi del cubo: stanno sempre fermi al loro posto.',
      },
      {
        kind: 'spiega',
        title: 'Pezzi con due colori',
        text:
          'I pezzi in mezzo a ogni lato hanno due colori. Si chiamano spigoli, ma tu puoi chiamarli "pezzi doppi". Ce ne sono dodici.',
        rubi: 'Un pezzo doppio ha sempre due colori, mai tre.',
      },
      {
        kind: 'spiega',
        title: 'Pezzi con tre colori',
        text:
          'Negli angoli ci sono i pezzi con tre colori. Sono otto e sono i piu difficili da mettere a posto.',
        rubi: 'Angolo uguale tre colori. Facile da ricordare!',
      },
      {
        kind: 'domanda',
        question: 'Quanti colori ha un pezzo che sta in un angolo?',
        options: ['Uno', 'Due', 'Tre'],
        answer: 2,
        why: 'Gli angoli si vedono da tre facce, quindi hanno tre colori.',
      },
      {
        kind: 'domanda',
        question: 'Il quadratino in mezzo a una faccia puo cambiare posto?',
        options: ['Si, sempre', 'No, mai'],
        answer: 1,
        why: 'I centri sono attaccati al cuore del cubo: girano su se stessi ma non si spostano.',
      },
    ],
  },
  {
    level: 2,
    title: 'La croce',
    subtitle: 'Il primo disegno sul cubo',
    stars: '⭐⭐',
    cards: [
      {
        kind: 'spiega',
        title: 'Che cosa e la croce',
        text:
          'Prendiamo la faccia di sotto e mettiamoci i quattro pezzi doppi giusti. Verra fuori il disegno di una croce (o di un piu).',
        highlight: Face.D,
        rubi: 'Prima la croce, poi tutto il resto viene piu facile.',
      },
      {
        kind: 'spiega',
        title: 'Un pezzo alla volta',
        text:
          'Cerca un pezzo doppio che ha il colore di sotto. Portalo in cima girando il lato dove si trova, poi falla scendere al posto giusto girando due volte quel lato.',
        demo: 'F2',
        rubi: 'Portalo in cima, mettilo sopra la sua casetta, poi giu con due giri!',
      },
      {
        kind: 'prova',
        title: 'Prova tu!',
        text: 'Ti ho mescolato solo un pochino. Riesci a fare la croce sotto?',
        scramble: "F R U' R2 F2",
        goal: 'cross',
        rubi: 'Vai tranquillo: se sbagli, si puo sempre tornare indietro.',
      },
    ],
  },
  {
    level: 3,
    title: 'Il primo lato',
    subtitle: 'Completiamo il piano di sotto',
    stars: '⭐⭐⭐',
    cards: [
      {
        kind: 'spiega',
        title: 'Adesso gli angoli',
        text:
          'La croce c e. Mancano i quattro angoli del piano di sotto. Ogni angolo ha una casetta sola: quella dove i tre colori corrispondono ai centri vicini.',
        rubi: 'Ogni angolo ha una casa sola. Dobbiamo solo trovarla!',
      },
      {
        kind: 'spiega',
        title: 'La mossa magica',
        text:
          'Metti l angolo in cima, proprio sopra la sua casetta. Poi ripeti questa mossa finche scende: gira il lato destro in alto, il lato di sopra a sinistra, il destro in basso, il sopra a destra.',
        demo: "R U R' U'",
        rubi: 'Questa mossa la userai un sacco di volte: e la mossa magica!',
      },
      {
        kind: 'prova',
        title: 'Prova tu!',
        text: 'Fai la croce e poi metti a posto gli angoli di sotto.',
        scramble: "R U R' U' R U R' F R U",
        goal: 'firstLayer',
        rubi: 'Ricordati: prima la croce, poi gli angoli.',
      },
    ],
  },
  {
    level: 4,
    title: 'Il piano di mezzo',
    subtitle: 'La fascia in mezzo al cubo',
    stars: '⭐⭐⭐⭐',
    cards: [
      {
        kind: 'spiega',
        title: 'Cerchiamo i pezzi senza giallo',
        text:
          'Guarda in cima: i pezzi doppi che NON hanno il colore di sopra devono scendere nella fascia di mezzo.',
        rubi: 'Se ha il colore di sopra, resta in cima. Altrimenti deve scendere!',
      },
      {
        kind: 'spiega',
        title: 'Scendi a destra',
        text:
          'Se il pezzo deve andare a destra, allontanalo con un giro di sopra, poi fai scendere il lato destro e riporta tutto a posto.',
        demo: "U R U' R' U' F' U F",
        rubi: 'Prima a destra, poi a sinistra: sono la stessa mossa allo specchio.',
      },
      {
        kind: 'prova',
        title: 'Prova tu!',
        text: 'Adesso tocca a te riempire la fascia di mezzo.',
        scramble: "R U R' U' F' U F U2 R U R'",
        goal: 'secondLayer',
        rubi: 'Sei arrivato a due piani su tre. Che campione!',
      },
    ],
  },
  {
    level: 5,
    title: 'L ultimo lato',
    subtitle: 'Il pezzo piu difficile',
    stars: '⭐⭐⭐⭐⭐',
    cards: [
      {
        kind: 'spiega',
        title: 'Prima la croce in cima',
        text:
          'Guarda la faccia di sopra: puo esserci un puntino, una elle o una riga. Ogni volta che fai questa mossa il disegno cambia: puntino, elle, riga, croce.',
        demo: "F R U R' U' F'",
        rubi: 'Puntino, elle, riga, croce: e sempre la stessa mossa!',
      },
      {
        kind: 'spiega',
        title: 'Poi gli angoli in cima',
        text:
          'Adesso gli angoli devono diventare tutti dello stesso colore. Questa mossa ne gira un po alla volta: ripetila e guarda cosa succede.',
        demo: "R U R' U R U2 R'",
        rubi: 'Non spaventarti se sembra che si rovini tutto: si sistema, fidati!',
      },
      {
        kind: 'spiega',
        title: 'E per finire, al posto giusto',
        text:
          'Ultimo sforzo: spostiamo gli angoli nella loro casa e poi i pezzi doppi. Quando finisci, il cubo e risolto!',
        demo: "R U' R U R U R U' R' U' R2",
        rubi: 'Ci siamo quasi! Manca davvero pochissimo.',
      },
      {
        kind: 'prova',
        title: 'Prova tu!',
        text: 'Ultimo piano: prova a finire il cubo.',
        scramble: "R U R' U R U2 R' F R U R' U' F'",
        goal: 'solved',
        rubi: 'Se ti blocchi, premi Aiutami: sono qui.',
      },
    ],
  },
  {
    level: 6,
    title: 'Diventa un Rubik Hero!',
    subtitle: 'Tutto da solo, dall inizio alla fine',
    stars: '🏆',
    cards: [
      {
        kind: 'spiega',
        title: 'Il piano completo',
        text:
          'Ripassiamo: croce sotto, angoli sotto, fascia di mezzo, croce sopra, angoli girati, angoli al posto giusto, ultimi pezzi doppi. Sette passi!',
        rubi: 'Sette passi e il cubo e tuo.',
      },
      {
        kind: 'domanda',
        question: 'Qual e il primo passo per risolvere il cubo?',
        options: ['Gli angoli in cima', 'La croce sotto', 'La fascia di mezzo'],
        answer: 1,
        why: 'Si parte sempre dalla croce sotto: e la base di tutto il resto.',
      },
      {
        kind: 'domanda',
        question: 'Come si chiama il lato destro nella lingua dei grandi?',
        options: ['R', 'D', 'L'],
        answer: 0,
        why: 'R viene da "right", che in inglese vuol dire destra. U e sopra, F e davanti.',
      },
      {
        kind: 'prova',
        title: 'La prova finale!',
        text: 'Cubo mescolato per bene. Riesci a risolverlo tutto da solo?',
        scramble: "D2 L' B2 R2 F' U R2 F2 D' B U2 R'",
        goal: 'solved',
        rubi: 'E il momento! Se ce la fai diventi ufficialmente un Rubik Hero.',
      },
    ],
  },
];

export function levelById(level: number): LearnLevel | undefined {
  return LEARN_LEVELS.find((l) => l.level === level);
}

/** Un livello e' sbloccato se il precedente e' stato completato. */
export function isLevelUnlocked(level: number, completed: number[]): boolean {
  if (level <= 1) return true;
  return completed.includes(level - 1);
}
