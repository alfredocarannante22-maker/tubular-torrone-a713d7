# Setup Famiglia App

## 1. Crea il progetto Firebase

1. Vai su https://console.firebase.google.com
2. Clicca "Aggiungi progetto" → dai un nome tipo "famiglia-app"
3. Disabilita Google Analytics (non serve) → Crea progetto

## 2. Abilita Google Auth

1. Nel menu a sinistra: **Authentication** → **Sign-in method**
2. Clicca **Google** → Abilita → Salva

## 3. Crea il database Firestore

1. Nel menu: **Firestore Database** → **Crea database**
2. Scegli **Modalità produzione** → Seleziona la regione `europe-west1` → Crea

## 4. Regole di sicurezza Firestore

Vai su **Firestore → Regole** e incolla questo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /events/{id} {
      allow read, write: if request.auth != null && request.auth.uid in resource.data.participants;
      allow create: if request.auth != null;
    }
    match /notes/{id} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null;
    }
    match /expenses/{id} {
      allow read, write: if request.auth != null && request.auth.uid in resource.data.participants;
      allow create: if request.auth != null;
    }
  }
}
```

## 5. Ottieni la configurazione

1. Vai su **Impostazioni progetto** (icona ingranaggio in alto a sinistra)
2. Scorri fino a "Le tue app" → clicca **</>** (Web)
3. Dai un nome all'app → Registra app
4. Copia l'oggetto `firebaseConfig`

## 6. Aggiorna app.js

Apri `app.js` e sostituisci il blocco `firebaseConfig` con i tuoi valori:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "famiglia-app-xxxxx.firebaseapp.com",
  projectId: "famiglia-app-xxxxx",
  storageBucket: "famiglia-app-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## 7. Pubblica l'app (gratis)

### Opzione A — Firebase Hosting (consigliata)
Richiede Node.js → salta se non puoi installarlo

### Opzione B — Apri direttamente nel browser
1. Apri `index.html` con un server locale
2. Se hai Python installato, nella cartella del progetto esegui:
   `python -m http.server 8080`
   poi apri http://localhost:8080

### Opzione C — Netlify Drop (più semplice, zero installazioni)
1. Vai su https://app.netlify.com/drop
2. Trascina l'intera cartella `famiglia-app` nella pagina
3. Netlify ti dà un URL pubblico tipo `https://famiglia-app-abc123.netlify.app`
4. Apri quell'URL sul telefono → "Aggiungi a schermata Home"

## 8. Condivisione con tua moglie

Per condividere gli eventi del calendario con tua moglie:
- Per ora gli eventi sono visibili solo a te (campo `participants`)
- Nella prossima versione aggiungeremo un sistema di invito via email
- Per condividere manualmente: aggiungi l'UID di tua moglie all'array `participants` degli eventi
