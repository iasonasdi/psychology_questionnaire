# Ερωτηματολόγια Ασθενούς

Διαδικτυακή εφαρμογή για τη συλλογή 6 ψυχολογικών ερωτηματολογίων από ασθενείς, με αποθήκευση σε Google Sheets (ένα φύλλο ανά έκδοση/κωδικό).

## Ερωτηματολόγια

| # | Τύπος |
|---|-------|
| 1 |  Κλίμακα Likert (ΔΕΠΥ) |
| 2 | Ναι/Όχι + επακόλουθες ερωτήσεις (MDQ) |
| 3 | Κλίμακα 0–10 + αριθμητικά πεδία (SDS) |
| 4 |  Σωστό/Λάθος + επίπεδο αγχωτικότητας (PQ-16) |
| 5 |  Πολλαπλές κλίμακες 0–4 (ISI) |
| 6 |  HADS με υποκλίμακες Άγχους & Κατάθλιψης |

## Τοπική εκτέλεση

```bash
cp js/config.example.js js/config.js
# Επεξεργαστείτε το js/config.js με το Google Script URL

python -m http.server 8080
```

- Ερωτηματολόγια: http://localhost:8080  
- Admin: http://localhost:8080/admin.html  


## Google Sheets 

Κάθε έκδοση δημιουργεί **ξεχωριστό φύλλο** στο spreadsheet βάση κωδικού. 

## GitHub Pages (online hosting)

Η σελίδα θα είναι διαθέσιμη σε:

`https://YOUR_USERNAME.github.io/psychology_questionnaire/`

(αν το repo ονομάζεται `psychology_questionnaire`)

## Admin Panel

- Δημιουργία νέου questionnaire link με μοναδικό κωδικό και προεπιλεγμένη ημερομηνία
- Λίστα όλων των εκδόσεων με κατάσταση `pending` / `submitted`
- Αντιγραφή link ξανά από τη λίστα ή από το detail view
- Πλήρεις απαντήσεις και σύνοψη βαθμολογιών για όσες υποβολές έχουν ολοκληρωθεί
