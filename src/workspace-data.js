import { STORAGE_KEY, readTrip } from './trip-data.js';
import { journalStore, replaceJournalEntries } from './journal-data.js';
import { validateWorkspace } from './cloud-data.js';

export async function readLocalWorkspace(storage = window.localStorage) {
  const { trip, error } = readTrip(storage);
  if (error) throw new Error(error);
  return validateWorkspace({ version: 1, trip, entries: await journalStore('getAll') });
}

export async function applyWorkspace(workspace, storage = window.localStorage) {
  validateWorkspace(workspace);
  const previous = readTrip(storage);
  if (previous.error) throw new Error(previous.error);
  const previousRaw = storage.getItem(STORAGE_KEY);
  // Write the smaller localStorage item first. If IndexedDB rejects its atomic
  // replacement, restore the trip. Never erase local data during cloud upload.
  if (workspace.trip) storage.setItem(STORAGE_KEY, JSON.stringify(workspace.trip));
  else storage.removeItem(STORAGE_KEY);
  try { await replaceJournalEntries(workspace.entries, previous.trip); }
  catch (error) {
    if (previousRaw === null) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, previousRaw);
    throw error;
  }
}
