// Operator-only projection. Never serialize canonical_payload, reader tokens,
// card references, capabilities or keys. Lack of a heartbeat is not proof offline.
export function gatewayDiagnostics(store,readerId,{now=Date.now(),adapterState='not_probed',serviceAvailable=null}={}){
  const reader=readerId?store.getReader(readerId):null;
  const counts=Object.fromEntries(store.db.prepare('SELECT queue_state,COUNT(*) AS n FROM gateway_events GROUP BY queue_state').all().map(r=>[r.queue_state,Number(r.n)]));
  const times=store.db.prepare(`SELECT MAX(local_received_at) AS last_capture,MAX(remote_received_at) AS last_server_receipt,
    MAX(CASE WHEN remote_outcome='accepted' AND queue_state='delivered' THEN updated_at END) AS last_successful_sync,
    MIN(CASE WHEN queue_state='pending' THEN local_received_at END) AS oldest_pending,
    SUM(CASE WHEN remote_outcome='unresolved' THEN 1 ELSE 0 END) AS unresolved FROM gateway_events`).get();
  const oldest=times.oldest_pending?Math.max(0,Math.floor((now-Date.parse(times.oldest_pending))/1000)):null;
  const errors=store.db.prepare('SELECT last_error_class AS code,COUNT(*) AS count FROM gateway_events WHERE last_error_class IS NOT NULL GROUP BY last_error_class').all();
  const invalidReceiptOrder=Number(store.db.prepare('SELECT COUNT(*) AS n FROM gateway_events WHERE remote_received_at IS NOT NULL AND julianday(remote_received_at)<julianday(local_received_at)').get().n);
  return {storage:'SQLite WAL/FULL',reader:!reader?'reader_not_configured':!reader.active?'reader_revoked':adapterState,
    physicalConnectionVerified:false,service:serviceAvailable===null?'not_probed':serviceAvailable?'web_reachable':'service_unavailable',
    delivery:counts.attention?'attention_required':counts.syncing?'synchronizing':oldest!==null&&oldest>60?'sync_delayed':counts.pending?'pending':'no_pending_events',
    queue:{pending:counts.pending??0,syncing:counts.syncing??0,delivered:counts.delivered??0,attention:counts.attention??0},
    unresolvedReceipts:Number(times.unresolved??0),lastLocalCapture:times.last_capture,lastSuccessfulSync:times.last_successful_sync,
    lastServerReceipt:times.last_server_receipt,oldestPendingSeconds:oldest,inconsistentReceiptTimes:invalidReceiptOrder,errors};
}
