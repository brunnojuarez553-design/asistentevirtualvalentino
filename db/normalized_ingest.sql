-- Transactional ingestion into normalized tables, only callable with service_role.
-- Deploy after reviewing in staging. No Meta outbound and no workspace migration.
begin;
create or replace function public.vm_ingest_conversation(
 p_business_id uuid, p_conversation_id uuid, p_contact text, p_channel text,
 p_state text, p_reason text, p_messages jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_business uuid;
  v_message jsonb;
  v_id uuid;
  v_count integer := 0;
  v_state text;
begin
  if p_messages is null or jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages)>200 then
    raise exception 'Invalid message batch';
  end if;
  select id into v_business from public.vm_businesses where id=p_business_id;
  if v_business is null then raise exception 'Unknown business'; end if;
  v_state:=case p_state when 'revision' then 'review' when 'humano' then 'human' else 'ai' end;
  insert into public.vm_conversations(id,business_id,state,ai_paused_reason,last_message_at)
  values(p_conversation_id,p_business_id,v_state,p_reason,now())
  on conflict (id) do update set state=excluded.state,
    ai_paused_reason=excluded.ai_paused_reason,last_message_at=excluded.last_message_at,
    updated_at=now()
  where vm_conversations.business_id=excluded.business_id;
  if not found then raise exception 'Conversation belongs to another business'; end if;
  for v_message in select value from jsonb_array_elements(p_messages) loop
    if (v_message->>'id') is null or (v_message->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid message UUID';
    end if;
    v_id:=(v_message->>'id')::uuid;
    insert into public.vm_messages(id,conversation_id,provider_message_id,direction,authored_by,message_type,body,delivery_status,occurred_at)
    values(v_id,p_conversation_id,null,
      case when v_message->>'role'='cliente' then 'incoming' else 'outgoing' end,
      case when v_message->>'role'='cliente' then 'customer' else 'ai' end,
      coalesce(nullif(v_message->>'mediaType',''),'text'),v_message->>'text',
      case when v_message->>'role'='cliente' then 'received' else 'draft' end,
      coalesce(nullif(v_message->>'at','')::timestamptz,now()))
    on conflict (id) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  return jsonb_build_object('inserted',v_count,'conversation_id',p_conversation_id);
end;
$$;
revoke all on function public.vm_ingest_conversation(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.vm_ingest_conversation(uuid,uuid,text,text,text,text,jsonb) to service_role;
commit;
