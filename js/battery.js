/**
 * Battery identity for issued links and submissions.
 * Records created before batteryId existed are the same intake set, so they resolve as CPAB_V1.
 */
const Battery = {
  LEGACY: {
    id: 'CPAB_V1',
    name: 'Comprehensive Psychiatric Assessment Battery',
    nameEl: 'Ολοκληρωμένη ψυχιατρική αξιολόγηση',
    category: 'Transdiagnostic Intake',
  },

  fromManifest(manifest) {
    return this.resolve(manifest && manifest.battery);
  },

  resolve(battery) {
    const fallback = { ...this.LEGACY };
    if (!battery || typeof battery !== 'object') return fallback;

    const id = typeof battery.id === 'string' ? battery.id.trim() : '';
    if (!id) return fallback;

    const name = typeof battery.name === 'string' ? battery.name.trim() : '';
    const nameEl = typeof battery.nameEl === 'string' ? battery.nameEl.trim() : '';
    const category = typeof battery.category === 'string' ? battery.category.trim() : '';

    return {
      id,
      name: name || id,
      nameEl,
      category,
    };
  },

  resolveId(record) {
    const id = record && typeof record.batteryId === 'string' ? record.batteryId.trim() : '';
    return id || this.LEGACY.id;
  },

  uiLabel(record, activeBattery) {
    const id = this.resolveId(record);
    const stored = record && typeof record.batteryName === 'string' ? record.batteryName.trim() : '';
    const active = activeBattery && activeBattery.id === id ? activeBattery : null;
    const name =
      (active && active.nameEl) ||
      stored ||
      (active && active.name) ||
      (id === this.LEGACY.id ? this.LEGACY.name : id);

    return { id, name };
  },

  matches(record, filterId) {
    if (!filterId || filterId === 'all') return true;
    return this.resolveId(record) === filterId;
  },

  matchesListFilters(patient, filters = {}) {
    const status = filters.status || 'all';
    const batteryId = filters.batteryId || 'all';
    if (status !== 'all' && patient.status !== status) return false;
    if (!this.matches(patient, batteryId)) return false;

    const words = String(filters.query || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return true;

    const label = this.uiLabel(patient, filters.activeBattery);
    const statusLabel = typeof filters.statusLabel === 'function' ? filters.statusLabel(patient.status) : '';
    const haystack = [
      patient.code,
      patient.date,
      patient.status,
      statusLabel,
      patient.issuedAt,
      patient.submittedAt,
      label.id,
      label.name,
      patient.batteryName,
    ]
      .join(' ')
      .toLowerCase();

    return words.every((word) => haystack.includes(word));
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Battery };
}
