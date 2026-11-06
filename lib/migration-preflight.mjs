// Pure preview of legacy workspace before a controlled migration.
// No customer message contents or identifiers are returned in the report.
export function migrationPreflight(workspace={}){
 const conversations=Array.isArray(workspace.conversations)?workspace.conversations:[];
 const events=Array.isArray(workspace.events)?workspace.events:[];
 const ids=new Set();
 let messages=0,duplicates=0,invalid=0,review=0,human=0;
 for(const c of conversations){
   if(!c||typeof c!=='object'||typeof c.id!=='string'||!c.id){invalid++;continue;}
   if(ids.has(c.id))duplicates++;
   ids.add(c.id);
   messages+=Array.isArray(c.messages)?c.messages.length:0;
   if(c.state==='revision')review++;
   if(c.state==='humano')human++;
 }
 return {conversations:conversations.length,messages,events:events.length,
   invalidConversations:invalid,duplicateConversationIds:duplicates,
   reviewConversations:review,humanConversations:human,
   ready:invalid===0&&duplicates===0};
}
