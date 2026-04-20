# Road to Riccione

Web app per il monitoraggio del percorso degli atleti U14 verso i Campionati Italiani U14 di Riccione.

## Obiettivo del progetto

L'app permette allo staff di:
- creare gli atleti
- inserire i punteggi delle sessioni di allenamento
- condividere a ogni atleta un link personale
- mostrare una barra di avanzamento verso la soglia obiettivo

Ogni atleta vede solo il proprio percorso pubblico.

## Periodo e logica punti

- Periodo del percorso: **16 aprile 2026 → 6 maggio 2026**
- Sessioni previste in questa versione: **9**
- Punti massimi per sessione: **40**
- Punti massimi totali: **360**
- Soglia obiettivo: **252 punti** (70%)

Date sessioni attualmente codificate nel progetto:
- 2026-04-16
- 2026-04-17
- 2026-04-19
- 2026-04-20
- 2026-04-22
- 2026-04-24
- 2026-04-27
- 2026-04-29
- 2026-05-04

## Stack attuale

- Frontend: **HTML + CSS + JavaScript vanilla**
- Backend: **Firebase**
  - **Firebase Authentication** per accesso admin email/password
  - **Cloud Firestore** per dati atleti e punteggi
- Esecuzione locale frontend: **Live Server** di VS Code oppure server statico semplice

## File reali del progetto

Questi sono i file effettivamente presenti nella versione attuale:

- `index.html` → pagina iniziale / lookup manuale slug
- `athlete.html` → dashboard pubblica atleta tramite `?slug=`
- `admin.html` → pannello tecnico con login staff
- `styles.css` → stile condiviso
- `app.js` → logica pagina atleta
- `admin.js` → logica area admin
- `firebase-config.js` → inizializzazione Firebase app/auth/firestore
- `README.md` → documentazione (da sostituire con questa versione aggiornata)

### File legacy da rimuovere o ignorare

Questi file sono residui della vecchia fase Supabase e **non fanno più parte del backend reale**:

- `supabase-config.js`
- `supabase-config.example.js`
- `supabase.sql`

Se non ti servono più, conviene eliminarli dal repository per evitare confusione futura.

## Struttura dati Firestore attuale

### Collection `athletes`
Campi attualmente usati dal codice:
- `full_name`
- `slug`
- `is_active`
- `created_at`
- `updated_at`

Nota: l'ID documento Firestore viene usato come `athlete.id` lato app.

### Collection `scores`
Campi attualmente usati:
- `athlete_id`
- `session_date`
- `attendance_points`
- `application_points`
- `technical_points`
- `resilience_points`
- `notes`
- `created_at`
- `updated_at`

Nota importante: in `admin.js` il documento viene salvato con ID composto:

`<athlete_id>_<session_date>`

Quindi per ogni atleta può esistere una sola valutazione per data.

## Come funziona oggi

### Pagina pubblica atleta
La pagina `athlete.html`:
1. legge lo `slug` dalla query string
2. cerca l'atleta in `athletes`
3. recupera i punteggi in `scores` filtrando per `athlete_id`
4. calcola:
   - punti attuali
   - percentuale
   - punti mancanti alla soglia
   - timeline delle sessioni

### Pagina admin
La pagina `admin.html`:
1. esegue login con Firebase Auth email/password
2. mostra il pannello tecnico solo se l'utente è autenticato
3. permette di:
   - creare atleta
   - generare slug pubblico
   - salvare valutazioni su Firestore
   - leggere elenco atleti
   - leggere storico valutazioni

## Configurazione Firebase

Il progetto usa un file `firebase-config.js` con:
- `initializeApp(...)`
- `getAuth(...)`
- `getFirestore(...)`

Il file esporta:
- `auth`
- `db`

## Prerequisiti console Firebase

### 1. Authentication
Nel progetto Firebase devi avere attivato il provider:
- **Email/Password**

Percorso console:
- **Build → Authentication → Sign-in method**

Firebase supporta l'accesso con email e password sul web e il metodo va abilitato dalla console. citeturn178084search0turn178084search14

### 2. Firestore Database
Devi avere creato il database Firestore in modalità nativa.

Percorso console:
- **Build → Firestore Database**

Per le app web che usano Firestore, la protezione dei dati va gestita tramite Firebase Authentication + Cloud Firestore Security Rules. citeturn178084search19turn178084search1

## Come creare un utente admin

Hai due strade.

### Metodo semplice dalla console Firebase
1. Apri **Build → Authentication → Users**
2. Clicca **Add user**
3. Inserisci email e password
4. Salva

Firebase consente di creare utenti password-authenticated anche dalla sezione Users della console. citeturn178084search11turn178084search0

### Regola pratica consigliata
All'inizio crea **un solo utente admin** per evitare errori durante la fase di setup.

## Come avviare in locale

### Metodo A — VS Code + Live Server
1. Apri la cartella progetto in VS Code
2. Installa l'estensione **Live Server**
3. Avvia `index.html`
4. Testa anche:
   - `admin.html`
   - `athlete.html?slug=slug-di-test`

### Metodo B — server statico minimale
Da Terminale, nella cartella progetto:

```bash
python3 -m http.server 8080
```

Poi apri nel browser:
- `http://localhost:8080/`
- `http://localhost:8080/admin.html`
- `http://localhost:8080/athlete.html?slug=slug-di-test`

## Query e indice Firestore

Il progetto usa già una query ordinata su `scores` filtrando per `athlete_id` e ordinando per `session_date` in `admin.js`.

Query effettiva attuale:
- `where('athlete_id', '==', athleteId)`
- `orderBy('session_date', 'desc')`

Questa combinazione può richiedere un indice composito in Firestore, e infatti nel tuo stato attuale risulta già creato. Firestore richiede spesso indici compositi per query che combinano filtri e ordinamenti su campi multipli. citeturn178084search5turn178084search9

### Come creare un indice Firestore se richiesto
Quando una query ha bisogno di un indice, Firestore normalmente restituisce un errore con il link diretto per crearlo.

Passi pratici:
1. Esegui la pagina o l'azione che genera la query
2. Apri la console browser
3. Se compare errore Firestore con link indice, aprilo
4. Conferma la creazione indice nella console Firebase
5. Attendi che lo stato diventi **Enabled**

### Indice già atteso da questo progetto
Collection:
- `scores`

Campi:
- `athlete_id` → Ascending
- `session_date` → Descending

## Problema reale di sicurezza nella struttura attuale

Questo è il punto più importante da ricordare.

### Situazione attuale
La pagina pubblica `athlete.html` legge direttamente da Firestore:
- il documento atleta tramite `slug`
- i documenti `scores` tramite `athlete_id`

### Conseguenza
Se abiliti lettura pubblica su `scores` per far funzionare la dashboard atleta, il client pubblico può leggere **l'intero documento score**, non solo i campi che mostri a schermo.

Cloud Firestore applica le regole di lettura a livello di documento: o un documento è leggibile, o non lo è; non puoi concedere lettura pubblica solo ad alcuni campi del documento usando solo le security rules. citeturn178084search2turn178084search1

### Perché questo conta nel tuo caso
Nel documento `scores` c'è anche il campo `notes`, che può contenere osservazioni tecniche o comportamentali. Oggi non lo mostri nella pagina atleta, ma se il documento è leggibile pubblicamente quel campo resta comunque esposto lato client.

## Strategia consigliata per blindare davvero Firestore

Per una sicurezza seria senza rompere il frontend admin, la soluzione migliore è separare i dati pubblici dai dati riservati.

### Struttura consigliata
Mantieni:
- `athletes` → privato o semi-pubblico
- `scores` → **solo admin autenticato**

Aggiungi una collection pubblica dedicata, ad esempio:
- `public_progress`

Ogni documento `public_progress` può contenere solo i dati necessari alla pagina atleta, ad esempio:
- `slug`
- `full_name`
- `total_points`
- `percent`
- `missing_to_target`
- `stage_totals` (mappa data → punti sessione)
- `qualified`
- `updated_at`

Così:
- la dashboard atleta legge solo `public_progress`
- `scores.notes` resta veramente privato
- l'admin continua a leggere/scrivere `scores`

## Regole Firestore consigliate

### Obiettivo regole
- nessuna scrittura pubblica
- lettura/scrittura completa solo per utenti autenticati nell'area admin
- lettura pubblica solo della collection pubblica dedicata

### Esempio regole consigliate

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    match /athletes/{athleteId} {
      allow read, write: if isSignedIn();
    }

    match /scores/{scoreId} {
      allow read, write: if isSignedIn();
    }

    match /public_progress/{docId} {
      allow read: if true;
      allow write: if isSignedIn();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Le regole di Firestore usano condizioni booleane; `request.auth != null` è il controllo base per consentire accesso solo a utenti autenticati. Il simulatore delle rules nella console permette di verificare richieste autenticate e non autenticate prima del deploy. citeturn178084search1turn178084search5turn178084search16

## Ordine giusto dei prossimi lavori

### Step 1 — README
Sostituire il vecchio README Supabase con questa versione aggiornata.

### Step 2 — Sicurezza vera
Prima di toccare le rules, aggiornare il codice in modo che la pagina atleta legga da `public_progress` e non da `scores`.

### Step 3 — Deploy rules
Dopo la modifica codice, pubblicare le security rules definitive.

### Step 4 — Deploy frontend
Pubblicare il frontend su Vercel oppure Firebase Hosting.

## Deploy consigliato: Vercel

Per questo progetto statico Vercel va bene ed è semplice.

Vercel consente il deploy diretto da Git o CLI; per siti statici HTML/CSS/JS non serve build step, e nelle impostazioni puoi usare il preset **Other** lasciando vuoto il build command. citeturn178084search3turn178084search10turn178084search13

### Setup minimo consigliato su Vercel
- Framework Preset: `Other`
- Build Command: vuoto
- Output Directory: `.` se i file sono nella root

## Checklist operativa finale

### README
- [ ] sostituito il README vecchio
- [ ] rimossi riferimenti Supabase
- [ ] documentata struttura file reale
- [ ] documentato avvio locale
- [ ] documentato setup Firebase Auth
- [ ] documentato indice Firestore

### Sicurezza
- [ ] aggiunta collection `public_progress`
- [ ] aggiornata `athlete.html/app.js` per leggere da dati pubblici
- [ ] lasciata `scores` privata
- [ ] pubblicate rules Firestore definitive
- [ ] testate letture anonime e admin con Rules Simulator

### Deploy
- [ ] repository ordinato
- [ ] file legacy rimossi o esclusi
- [ ] deploy Vercel eseguito
- [ ] URL pubblico testato
- [ ] test link atleta eseguito da browser anonimo
- [ ] test admin eseguito con login reale

## Nota finale importante

Il progetto attuale **non è da blindare solo con una regola veloce**, perché la pagina atleta oggi legge una collection che contiene anche dati potenzialmente sensibili. Prima si separano i dati pubblici da quelli riservati, poi si chiude Firestore. Fare il contrario rischia o di rompere il frontend, o di lasciare visibili più dati del dovuto.
