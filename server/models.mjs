export const MODEL = Object.freeze({version:'bkt-v1', prior:0.2, learn:0.12, guess:0.25, slip:0.1, skip:0.9, successes:3, items:2, readinessDays:30});
export function updateBkt(prior, correct) {
  const likelihood = correct ? 1 - MODEL.slip : MODEL.slip;
  const unknown = correct ? MODEL.guess : 1 - MODEL.guess;
  const observed = prior * likelihood / (prior * likelihood + (1 - prior) * unknown);
  return observed + (1 - observed) * MODEL.learn;
}
export function readiness(row, now = Date.now()) {
  if (!row) return {probability:null,status:'unknown',reason:'Not yet assessed'};
  const mastered = row.probability >= MODEL.skip && row.successes >= MODEL.successes && row.itemCount >= MODEL.items;
  const stale = now - Date.parse(row.updatedAt) >= MODEL.readinessDays * 86400000;
  return {probability:row.probability,status:mastered ? stale ? 'refresh' : 'skip' : 'teach',reason:mastered ? stale ? 'A short readiness check is due; elapsed time is not proof of forgetting.' : 'Provisional threshold reached through independent checks.' : 'More independent evidence is needed.',modelVersion:MODEL.version};
}
