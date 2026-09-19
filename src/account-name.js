export function accountName(user) {
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return user?.email?.split('@')[0] || 'Tài khoản';
}
