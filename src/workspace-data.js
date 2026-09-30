import { STORAGE_KEY, readTrip } from './trip-data.js';
import { journalStore, replaceJournalEntries } from './journal-data.js';
import { validateWorkspace } from './cloud-data.js';
import {PLANS_KEY,readPlans,savePlans} from './plans-data.js';

export async function readLocalWorkspace(storage = window.localStorage) {
  const { trip, error } = readTrip(storage);
  if (error) throw new Error(error);
  const saved=readPlans(storage);if(saved.error)throw new Error(saved.error);
  const hasPlans=storage.getItem(PLANS_KEY)!==null;
  return validateWorkspace({ version: 1, trip:hasPlans?(saved.plans[0]||null):trip, ...(hasPlans?{trips:saved.plans}:{}), entries: await journalStore('getAll') });
}

export async function applyWorkspace(workspace, storage = window.localStorage) {
  validateWorkspace(workspace);
  const previous = readTrip(storage);
  if (previous.error) throw new Error(previous.error);
  const previousRaw = storage.getItem(STORAGE_KEY);
  const previousPlansRaw=storage.getItem(PLANS_KEY);
  const previousPlans=readPlans(storage);if(previousPlans.error)throw new Error(previousPlans.error);
  // Write the smaller localStorage item first. If IndexedDB rejects its atomic
  // replacement, restore the trip. Never erase local data during cloud upload.
  try {
    if (workspace.trip) storage.setItem(STORAGE_KEY, JSON.stringify(workspace.trip));
    else storage.removeItem(STORAGE_KEY);
    if(workspace.trips!==undefined)savePlans(storage,workspace.trips);
    else if(previousPlansRaw!==null)storage.removeItem(PLANS_KEY);
    await replaceJournalEntries(workspace.entries, previous.trip, previousPlansRaw!==null?previousPlans.plans:undefined);
  }
  catch (error) {
    if (previousRaw === null) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, previousRaw);
    if(previousPlansRaw===null){if(storage.getItem(PLANS_KEY)!==null)storage.removeItem(PLANS_KEY);}
    else storage.setItem(PLANS_KEY,previousPlansRaw);
    throw error;
  }
}
