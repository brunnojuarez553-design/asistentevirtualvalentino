import {NormalizedWriter} from './normalized-writer.mjs';

// Replays the authoritative workspace. Every message has a deterministic ID,
// so a failed or repeated run can be retried without inserting duplicates.
export async function reconcileNormalized(writer, conversations=[]){
  if(!(writer instanceof NormalizedWriter))throw Error('Normalized writer required');
  if(!Array.isArray(conversations))throw Error('Invalid workspace conversations');
  let processed=0,inserted=0;
  for(const conversation of conversations){
    const result=await writer.ingest(conversation);
    processed++;
    inserted+=Number(result?.inserted||0);
  }
  return {processed,inserted};
}
