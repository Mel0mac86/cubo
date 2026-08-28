/**
 * EDUCAZIONE FINANZIARIA — 10 mini-lezioni da 2-3 minuti, ognuna con quiz.
 * Linguaggio pensato per bambini dai 9 anni: frasi corte, esempi concreti.
 */

export interface LessonPage {
  emoji: string;
  title: string;
  body: string;
  /** Elemento visivo opzionale renderizzato dalla UI. */
  visual?: { kind: 'jars' | 'bars' | 'growth' | 'scale'; data?: Record<string, number | string> };
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  position: number;
  title: string;
  emoji: string;
  summary: string;
  minutes: number;
  pages: LessonPage[];
  quiz: QuizQuestion[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'denaro',
    position: 1,
    title: "Cos'è il denaro?",
    emoji: '💶',
    summary: 'Il denaro è uno scambio: tempo e lavoro che diventano scelte.',
    minutes: 2,
    pages: [
      { emoji: '🔁', title: 'Prima si scambiava', body: 'Tanto tempo fa non esistevano le monete. Chi aveva due galline le scambiava con un sacco di grano. Funzionava... finché trovavi qualcuno che voleva proprio le tue galline!' },
      { emoji: '🪙', title: 'Poi sono arrivate le monete', body: 'Le monete sono un modo furbo per scambiare qualsiasi cosa con qualsiasi altra. Sono come dei "buoni" che tutti accettano.' },
      { emoji: '⏳', title: 'Il denaro è tempo', body: 'Quando fai un lavoretto e guadagni 3 euro, quei 3 euro sono il tuo tempo e la tua fatica trasformati in scelta. Per questo spenderli è una decisione importante: stai decidendo a cosa è servito il tuo tempo.' },
    ],
    quiz: [
      { id: 'd1', question: 'Prima delle monete, come si faceva?', options: ['Si scambiavano oggetti', 'Non esisteva il commercio', 'Si usavano le carte'], correctIndex: 0, explanation: 'Si chiamava baratto: cosa contro cosa.' },
      { id: 'd2', question: 'Se guadagni 3 € lavando la macchina, quei 3 € rappresentano...', options: ['Solo un numero', 'Il tuo tempo e il tuo lavoro', 'Un regalo'], correctIndex: 1, explanation: 'Il denaro è il tuo tempo trasformato in possibilità di scegliere.' },
      { id: 'd3', question: 'Perché tutti accettano le monete?', options: ['Perché sono belle', 'Perché tutti sono d’accordo sul loro valore', 'Perché pesano poco'], correctIndex: 1, explanation: 'Il valore del denaro nasce da un accordo fra le persone.' },
    ],
  },
  {
    id: 'risparmiare',
    position: 2,
    title: "Cos'è risparmiare?",
    emoji: '🐷',
    summary: 'Risparmiare non è "non spendere": è spendere dopo, per qualcosa di più grande.',
    minutes: 2,
    pages: [
      { emoji: '🐷', title: 'Mettere da parte', body: 'Risparmiare vuol dire tenere da parte un po’ di soldi oggi per poterli usare domani.' },
      { emoji: '🚲', title: 'Perché funziona', body: 'Una bici da 250 € non arriva in un giorno. Ma 10 € alla settimana per 25 settimane sì. Il risparmio trasforma le cose "impossibili" in cose "tra un po’".', visual: { kind: 'bars' } },
      { emoji: '🧠', title: 'Il trucco', body: 'Il momento migliore per decidere quanto risparmiare è QUANDO ARRIVANO i soldi, non dopo. Per questo l’app ti fa scegliere subito la divisione fra SAVE, SPEND e GIVE.' },
    ],
    quiz: [
      { id: 'r1', question: 'Risparmiare significa...', options: ['Non spendere mai', 'Spendere dopo, per qualcosa che conta di più', 'Nascondere i soldi'], correctIndex: 1, explanation: 'Risparmiare è scegliere di rimandare, non di rinunciare.' },
      { id: 'r2', question: 'Quando conviene decidere quanto mettere in SAVE?', options: ['Appena arrivano i soldi', 'Alla fine del mese', 'Quando ne sono avanzati'], correctIndex: 0, explanation: 'Se aspetti che avanzino, spesso non avanzano!' },
      { id: 'r3', question: 'Quante settimane servono per 100 € risparmiando 10 € a settimana?', options: ['5', '10', '20'], correctIndex: 1, explanation: '100 ÷ 10 = 10 settimane.' },
    ],
  },
  {
    id: 'bisogni-desideri',
    position: 3,
    title: 'Bisogni e desideri',
    emoji: '⚖️',
    summary: 'I bisogni servono per stare bene. I desideri sono belli. Sono due cose diverse.',
    minutes: 3,
    pages: [
      { emoji: '🍎', title: 'I bisogni', body: 'Il cibo, i vestiti, la casa, i libri di scuola: sono cose che servono davvero. Senza di loro stiamo male.' },
      { emoji: '🎮', title: 'I desideri', body: 'Lo slime, il videogioco, le figurine: sono cose belle che ci fanno piacere. Non sono sbagliate! Ma possono aspettare.', visual: { kind: 'scale' } },
      { emoji: '🤔', title: 'La domanda magica', body: 'Prima di comprare, chiediti: "Ne ho bisogno o mi va?". Se la risposta è "mi va", aspetta un giorno. Se lo vuoi ancora domani, allora lo desideri davvero.' },
    ],
    quiz: [
      { id: 'b1', question: 'Quale di questi è un bisogno?', options: ['Uno slime', 'La merenda per la scuola', 'Un cappellino nuovo alla moda'], correctIndex: 1, explanation: 'Mangiare è un bisogno; il resto è desiderio.' },
      { id: 'b2', question: 'I desideri sono sbagliati?', options: ['Sì, sempre', 'No, ma possono aspettare', 'Sì, se costano poco'], correctIndex: 1, explanation: 'Nessun desiderio è sbagliato: va solo messo in fila dopo i bisogni.' },
      { id: 'b3', question: 'La "domanda magica" prima di comprare è...', options: ['Quanto costa?', 'Ne ho bisogno o mi va?', 'Ce l’hanno i miei amici?'], correctIndex: 1, explanation: 'Distinguere bisogno e desiderio è il primo passo di ogni decisione.' },
      { id: 'b4', question: 'Se dopo un giorno non lo vuoi più...', options: ['Era un desiderio passeggero', 'Devi comprarlo lo stesso', 'Era un bisogno'], correctIndex: 0, explanation: 'Aspettare un giorno smaschera i desideri passeggeri.' },
    ],
  },
  {
    id: 'percentuali',
    position: 4,
    title: 'Come funzionano le percentuali?',
    emoji: '📊',
    summary: 'Percentuale vuol dire "ogni 100". È il modo più semplice per dividere.',
    minutes: 3,
    pages: [
      { emoji: '💯', title: 'Per cento = ogni 100', body: '50% vuol dire "50 ogni 100", cioè la metà. 10% vuol dire "10 ogni 100", cioè un decimo.' },
      { emoji: '🧮', title: 'Come si calcola', body: 'Per calcolare il 10% di una cifra, dividi per 10. Il 10% di 20 € è 2 €. Per il 50%, dividi per 2.' },
      { emoji: '🫙', title: 'Nei tuoi salvadanai', body: 'Se arrivano 10 € e scegli SAVE 60%, SPEND 30%, GIVE 10%, allora: 6 € in SAVE, 3 € in SPEND, 1 € in GIVE. Somma: 10 €. Deve sempre tornare!', visual: { kind: 'jars', data: { save: 60, spend: 30, give: 10 } } },
    ],
    quiz: [
      { id: 'p1', question: 'Quanto fa il 10% di 20 €?', options: ['1 €', '2 €', '10 €'], correctIndex: 1, explanation: '10% = dividere per 10 → 20 ÷ 10 = 2 €.' },
      { id: 'p2', question: 'SAVE 60 + SPEND 30 + GIVE 10 fa...', options: ['90%', '100%', '110%'], correctIndex: 1, explanation: 'La somma deve sempre essere 100%.' },
      { id: 'p3', question: 'Il 50% di 8 € è...', options: ['4 €', '2 €', '8 €'], correctIndex: 0, explanation: '50% è la metà: 8 ÷ 2 = 4 €.' },
      { id: 'p4', question: 'Se metti 100% in SPEND, quanto va in SAVE?', options: ['Niente', 'Metà', 'Dipende'], correctIndex: 0, explanation: 'Il 100% in un salvadanaio lascia zero negli altri.' },
    ],
  },
  {
    id: 'budget',
    position: 5,
    title: "Cos'è un budget?",
    emoji: '🗺️',
    summary: 'Un budget è un piano: decidi tu dove vanno i soldi, prima che spariscano.',
    minutes: 2,
    pages: [
      { emoji: '🗺️', title: 'Un piano, non una gabbia', body: 'Il budget è come la mappa di un viaggio: dice dove vuoi arrivare con i tuoi soldi.' },
      { emoji: '✋', title: 'Chi comanda?', body: 'Senza budget sono i soldi a decidere per te: finiscono e basta. Con un budget decidi tu.' },
      { emoji: '🔧', title: 'Si può cambiare', body: 'Un budget non è un compito in classe: se una settimana non funziona, lo cambi. L’importante è sapere dove vanno i tuoi soldi.' },
    ],
    quiz: [
      { id: 'g1', question: 'Un budget serve a...', options: ['Vietarti di spendere', 'Decidere prima dove vanno i soldi', 'Guadagnare di più'], correctIndex: 1, explanation: 'È un piano che decidi tu, non un divieto.' },
      { id: 'g2', question: 'Se il budget non funziona?', options: ['Lo cambi', 'Rinunci a tutto', 'Lo ignori per sempre'], correctIndex: 0, explanation: 'Un budget si aggiusta con l’esperienza.' },
      { id: 'g3', question: 'Senza budget di solito succede che...', options: ['I soldi durano di più', 'I soldi finiscono senza sapere dove', 'Si guadagna di più'], correctIndex: 1, explanation: 'Senza piano è difficile ricordare dove sono finiti i soldi.' },
    ],
  },
  {
    id: 'interesse',
    position: 6,
    title: "Cos'è l'interesse?",
    emoji: '🌱',
    summary: 'È un piccolo premio che ricevi perché lasci i soldi al loro posto.',
    minutes: 2,
    pages: [
      { emoji: '🌱', title: 'Un premio per la pazienza', body: 'Quando lasci i soldi nel salvadanaio SAVE, ricevi un piccolo extra. Nella tua app il papà o la mamma ti danno, per esempio, 5 centesimi per ogni euro che resta lì per un mese.' },
      { emoji: '🧮', title: 'Facciamo il conto', body: 'Hai 100 € in SAVE. Ogni euro ti dà 5 centesimi → 100 × 0,05 € = 5 €. Il mese dopo hai 105 €.', visual: { kind: 'growth', data: { start: 10000, rate: 5 } } },
      { emoji: '💡', title: 'Il segreto', body: 'L’interesse non premia chi ha di più: premia chi ASPETTA. È l’unico modo per guadagnare senza lavorare... ma serve pazienza.' },
    ],
    quiz: [
      { id: 'i1', question: 'Hai 100 € in SAVE con 5 centesimi per euro. Quanto ricevi in un mese?', options: ['0,50 €', '5 €', '50 €'], correctIndex: 1, explanation: '100 euro × 5 centesimi = 500 centesimi = 5 €.' },
      { id: 'i2', question: "L'interesse premia soprattutto...", options: ['Chi spende in fretta', 'Chi lascia i soldi da parte', 'Chi chiede di più'], correctIndex: 1, explanation: 'È un premio per la pazienza.' },
      { id: 'i3', question: 'Se togli tutti i soldi da SAVE, quanto interesse ricevi?', options: ['Zero', 'Lo stesso di prima', 'Il doppio'], correctIndex: 0, explanation: 'Niente soldi fermi, niente interesse.' },
    ],
  },
  {
    id: 'interesse-composto',
    position: 7,
    title: "Cos'è l'interesse composto?",
    emoji: '🚀',
    summary: 'È interesse sull’interesse: cresce piano, poi corre.',
    minutes: 3,
    pages: [
      { emoji: '❄️', title: 'La palla di neve', body: 'Immagina una palla di neve che rotola: raccoglie neve, diventa più grande e così ne raccoglie ancora di più. I soldi fanno la stessa cosa.' },
      { emoji: '📈', title: 'Guarda i numeri', body: '100 € → 105 € → 110,25 € → 115,76 €. Il secondo mese guadagni più del primo, perché l’interesse si calcola anche sull’interesse!', visual: { kind: 'growth', data: { start: 10000, rate: 5, months: 4 } } },
      { emoji: '⏰', title: 'Il tempo è l’ingrediente', body: 'L’interesse composto ha bisogno di tempo. Per questo chi inizia a risparmiare da bambino ha un vantaggio enorme.' },
    ],
    quiz: [
      { id: 'c1', question: 'Interesse composto vuol dire...', options: ['Interesse anche sull’interesse', 'Interesse pagato due volte', 'Interesse più basso'], correctIndex: 0, explanation: 'Il guadagno si aggiunge al capitale e a sua volta produce guadagno.' },
      { id: 'c2', question: 'Con 100 € al 5% al mese, dopo 2 mesi hai...', options: ['110 €', '110,25 €', '105 €'], correctIndex: 1, explanation: '100 → 105 → 110,25. I 25 centesimi in più sono l’interesse sull’interesse.' },
      { id: 'c3', question: 'Qual è l’ingrediente più importante?', options: ['La fortuna', 'Il tempo', 'Avere tanti soldi'], correctIndex: 1, explanation: 'Più tempo passa, più la palla di neve cresce.' },
    ],
  },
  {
    id: 'beneficenza',
    position: 8,
    title: 'Perché fare beneficenza?',
    emoji: '❤️',
    summary: 'Donare è una scelta: piccola per te, grande per qualcun altro.',
    minutes: 2,
    pages: [
      { emoji: '❤️', title: 'Il salvadanaio GIVE', body: 'Una parte dei tuoi soldi è per aiutare: persone, animali, l’ambiente. Non è una tassa: è una scelta che fai tu.' },
      { emoji: '🐶', title: 'Piccolo per te, grande per altri', body: '5 € per te sono una merenda. Per un rifugio di animali possono essere una giornata di cibo per un cane.' },
      { emoji: '🎯', title: 'Scegli tu la causa', body: 'Puoi decidere a chi donare e quando. Puoi anche darti un obiettivo GIVE, esattamente come per la bici.' },
    ],
    quiz: [
      { id: 'be1', question: 'Il salvadanaio GIVE serve a...', options: ['Pagare le tasse', 'Aiutare qualcun altro', 'Risparmiare per te'], correctIndex: 1, explanation: 'GIVE è la parte dedicata agli altri.' },
      { id: 'be2', question: 'Chi sceglie la causa?', options: ['L’app', 'Tu', 'Nessuno'], correctIndex: 1, explanation: 'La scelta della causa è tua.' },
      { id: 'be3', question: 'Donare poco serve?', options: ['No, serve solo tanto', 'Sì, perché conta per chi riceve', 'Solo se lo sanno gli altri'], correctIndex: 1, explanation: 'Anche piccole cifre cambiano qualcosa per chi le riceve.' },
    ],
  },
  {
    id: 'obiettivi',
    position: 9,
    title: 'Come stabilire un obiettivo?',
    emoji: '🎯',
    summary: 'Un buon obiettivo ha un nome, un prezzo e una data.',
    minutes: 3,
    pages: [
      { emoji: '🎯', title: 'Tre ingredienti', body: 'Nome ("bicicletta"), prezzo (250 €) e una data ("prima dell’estate"). Senza prezzo non sai quanto manca; senza data non sai se stai andando abbastanza veloce.' },
      { emoji: '➗', title: 'Spezzalo in pezzi', body: '250 € sembrano tanti. Ma 250 ÷ 25 settimane = 10 € a settimana. Un obiettivo grande è solo tanti obiettivi piccoli in fila.' },
      { emoji: '👀', title: 'Guardalo spesso', body: 'Tenere l’obiettivo davanti agli occhi (con la foto!) aiuta a scegliere meglio quando arriva la tentazione.' },
    ],
    quiz: [
      { id: 'o1', question: 'Cosa manca a questo obiettivo: "voglio risparmiare tanto"?', options: ['Il prezzo e la data', 'Niente', 'Il colore'], correctIndex: 0, explanation: 'Senza cifra e data non è un obiettivo, è un desiderio.' },
      { id: 'o2', question: '200 € in 20 settimane sono...', options: ['20 € a settimana', '10 € a settimana', '5 € a settimana'], correctIndex: 1, explanation: '200 ÷ 20 = 10 € a settimana.' },
      { id: 'o3', question: 'Perché mettere la foto dell’obiettivo?', options: ['Per fare bella figura', 'Per ricordarti perché stai aspettando', 'Non serve'], correctIndex: 1, explanation: 'Vedere l’obiettivo rende più facile scegliere.' },
    ],
  },
  {
    id: 'decidere',
    position: 10,
    title: 'Come decidere prima di comprare',
    emoji: '🤔',
    summary: 'Ogni euro speso qui è un euro che non va lì. Si chiama trade-off.',
    minutes: 3,
    pages: [
      { emoji: '⚖️', title: 'Il trade-off', body: 'Ogni volta che compri qualcosa, stai anche dicendo "no" a qualcos’altro. Non è una cosa brutta: è come funzionano le scelte.' },
      { emoji: '🔮', title: 'Usa il simulatore', body: 'Prima di comprare, apri il simulatore dell’app: ti mostra il tuo obiettivo con e senza quell’acquisto. Nessuno ti dirà cosa fare: vedrai solo cosa succede.' },
      { emoji: '🕐', title: 'La regola del giorno dopo', body: 'Per le cose che costano tanto, aspetta 24 ore. Se domani lo vuoi ancora, probabilmente ne vale la pena.' },
    ],
    quiz: [
      { id: 't1', question: 'Trade-off significa...', options: ['Fare un affare', 'Scegliere una cosa vuol dire rinunciare a un’altra', 'Comprare in saldo'], correctIndex: 1, explanation: 'Ogni scelta ha un costo: quello che non hai scelto.' },
      { id: 't2', question: 'Il simulatore dell’app serve a...', options: ['Impedirti di comprare', 'Mostrarti cosa succede al tuo obiettivo', 'Fare la spesa'], correctIndex: 1, explanation: 'Tu decidi, l’app ti mostra le conseguenze.' },
      { id: 't3', question: 'La regola del giorno dopo dice di...', options: ['Comprare subito', 'Aspettare 24 ore per gli acquisti grandi', 'Non comprare mai'], correctIndex: 1, explanation: 'Aspettare un giorno aiuta a capire se lo vuoi davvero.' },
      { id: 't4', question: 'Se compri lo slime e l’obiettivo si allontana di 2 settimane...', options: ['Hai sbagliato', 'Hai fatto una scelta: sai cosa costa', 'L’app ti blocca'], correctIndex: 1, explanation: 'Nessuna punizione: l’importante è scegliere sapendo cosa succede.' },
    ],
  },
];

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
