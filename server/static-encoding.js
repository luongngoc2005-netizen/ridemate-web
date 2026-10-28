// Missing encodings are not accepted unless a wildcard allows them. Identity is
// still a fallback unless it or the wildcard was explicitly refused.
export function acceptedEncodings(header = '') {
  if (!header.trim()) return ['identity'];
  const weights = new Map();
  for (const part of header.toLowerCase().split(',')) {
    const [token, ...parameters] = part.trim().split(';');
    const quality = parameters.find(value => value.trim().startsWith('q='));
    const q = quality == null ? 1 : Number(quality.trim().slice(2));
    weights.set(token.trim(), Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0);
  }
  const result = ['br', 'gzip'].map(encoding => ({encoding, q:weights.get(encoding) ?? weights.get('*') ?? 0}));
  if (weights.has('identity')) result.push({encoding:'identity', q:weights.get('identity')});
  const preferred = result.filter(item => item.q > 0).sort((a,b) => b.q-a.q).map(item => item.encoding);
  if (!weights.has('identity') && weights.get('*') !== 0) preferred.push('identity');
  return preferred;
}
