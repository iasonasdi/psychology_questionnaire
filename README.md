# Ερωτηματολόγια Ασθενούς — Δρ. Παπαθεοδοσίου

Διαδικτυακή εφαρμογή για τη συλλογή 6 ψυχολογικών ερωτηματολογίων από ασθενείς, με αποθήκευση σε Google Sheets (ένα φύλλο ανά ασθενή).

## Ερωτηματολόγια

| # | Αρχείο | Τύπος |
|---|--------|-------|
| 1 | `data/q01-adhd.json` | Κλίμακα Likert (ΔΕΠΥ) |
| 2 | `data/q02-mdq.json` | Ναι/Όχι + επακόλουθες ερωτήσεις (MDQ) |
| 3 | `data/q03-sds.json` | Κλίμακα 0–10 + αριθμητικά πεδία (SDS) |
| 4 | `data/q04-pq16.json` | Σωστό/Λάθος + επίπεδο αγχωτικότητας (PQ-16) |
| 5 | `data/q05-isi.json` | Πολλαπλές κλίμακες 0–4 (ISI) |
| 6 | `data/q06-hads.json` | HADS με υποκλίμακες Άγχους & Κατάθλιψης |

## Τοπική εκτέλεση

```bash
cp js/config.example.js js/config.js
# Επεξεργαστείτε το js/config.js με το Google Script URL

python -m http.server 8080
```

- Ερωτηματολόγια: http://localhost:8080  
- Admin: http://localhost:8080/admin.html  

## Ασφάλεια / Secrets

| Αρχείο | Στο git; | Τι περιέχει |
|--------|----------|-------------|
| `js/config.js` | **Όχι** (gitignore) | Google Script URL |
| `js/config.example.js` | Ναι | Πρότυπο χωρίς πραγματικά keys |
| `google-apps-script/Code.gs` | Ναι | Κώδικας — βάλτε `ADMIN_KEY` **μόνο** στον επεξεργαστή Apps Script |

Ο κωδικός admin **δεν** αποθηκεύεται στο site. Εισάγεται στη σελίδα admin και ελέγχεται μόνο από το Google Apps Script.

## Google Sheets setup

1. Δημιουργήστε [Google Spreadsheet](https://sheets.google.com)
2. **Extensions → Apps Script** → επικολλήστε `google-apps-script/Code.gs`
3. Στον επεξεργαστή Apps Script, ορίστε: `const ADMIN_KEY = 'your-password';`
4. **Deploy → Web app** (Execute as: Me, Access: Anyone)
5. Αντιγράψτε το URL στο `js/config.js` (τοπικά) ή στο GitHub Secret (για Pages)

## GitHub Pages (online hosting)

### Χρειάζεται public repository;

**Όχι.** Μπορείτε να χρησιμοποιήσετε **ιδιωτικό (private)** repository.  
Η ιστοσελίδα στο `*.github.io` θα είναι **δημόσια** (οποιος έχει το link μπορεί να τη δει), αλλά ο **κώδικας** μένει ιδιωτικός.

### Βήματα

1. Push το project στο GitHub
2. **Settings → Secrets and variables → Actions → New secret**
   - Name: `GOOGLE_SCRIPT_URL`
   - Value: το Web App URL σας
3. **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions**
4. Push στο branch `main` — το workflow `.github/workflows/pages.yml` κάνει deploy αυτόματα

Η σελίδα θα είναι διαθέσιμη σε:

`https://YOUR_USERNAME.github.io/psychology_questionnaire/`

(αν το repo ονομάζεται `psychology_questionnaire`)

### Σημαντικό μετά το deploy

- Ερωτηματολόγια: `https://YOUR_USERNAME.github.io/psychology_questionnaire/`
- Admin: `https://YOUR_USERNAME.github.io/psychology_questionnaire/admin.html`

## Admin Panel

- Σύνολο υποβολών, αναζήτηση ασθενούς, σύνοψη βαθμολογιών
- Πλήρεις απαντήσεις ανά ερωτηματολόγιο
- Απαιτεί κωδικό (ορίζεται στο Apps Script `ADMIN_KEY`)

## Δομή project

```
psychology_questionnaire/
├── index.html
├── admin.html
├── js/config.example.js   ← committed
├── js/config.js           ← gitignored (τοπικά + δημιουργείται στο CI)
├── data/
├── google-apps-script/Code.gs
└── .github/workflows/pages.yml
```
