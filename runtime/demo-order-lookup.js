// Read-only evidence from the n8n demo_orders table. Never fall back to bundled records.
function lookupDemoOrder(orderReference) {
  const candidates = $input.all().map(item => item.json).filter(row => row.orderReference === orderReference && orderReference);
  if (!candidates.length) return { order: null, orderLookupIssue: null };
  if (candidates.length !== 1) return { order: null, orderLookupIssue: 'Multiple sample payments have this order reference.' };
  const row = candidates[0];
  if (typeof row.itemName !== 'string' || !row.itemName.trim() || typeof row.amount !== 'number' ||
      !Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 1000000 || Math.abs(row.amount * 100 - Math.round(row.amount * 100)) > 0.000001 ||
      typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency) ||
      typeof row.paymentReference !== 'string' || !row.paymentReference.trim() || typeof row.duplicateCharge !== 'boolean') {
    return { order: null, orderLookupIssue: 'The sample payment record is incomplete or invalid.' };
  }
  return { order: Object.fromEntries(['orderReference','itemName','amount','currency','paymentReference','duplicateCharge'].map(key => [key,row[key]])), orderLookupIssue: null };
}
