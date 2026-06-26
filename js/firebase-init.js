/**
 * Firebase app bootstrap (compat SDK).
 * Auth is optional — patient pages load Firestore only; admin loads Auth too.
 */
const FirebaseApp = {
  app: null,
  auth: null,
  db: null,

  init() {
    if (this.app) return this;

    if (!CONFIG.FIREBASE || !CONFIG.FIREBASE.apiKey || !CONFIG.FIREBASE.projectId) {
      throw new Error(
        'Το Firebase δεν έχει ρυθμιστεί. Συμπληρώστε το js/config.js (βλ. js/config.example.js).'
      );
    }

    this.app = firebase.apps.length
      ? firebase.app()
      : firebase.initializeApp(CONFIG.FIREBASE);

    if (typeof firebase.firestore === 'function') {
      this.db = firebase.firestore();
    } else {
      throw new Error('Το Firestore SDK δεν φορτώθηκε.');
    }

    if (typeof firebase.auth === 'function') {
      this.auth = firebase.auth();
    }

    return this;
  },

  async requireAdmin() {
    this.init();
    if (!this.auth) {
      throw new Error('Το Firebase Auth δεν είναι διαθέσιμο σε αυτή τη σελίδα.');
    }

    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Απαιτείται σύνδεση admin.');
    }

    const adminDoc = await this.db.collection('admins').doc(user.uid).get();
    if (!adminDoc.exists) {
      throw new Error('Ο λογαριασμός δεν έχει δικαιώματα admin.');
    }

    return user;
  },
};
