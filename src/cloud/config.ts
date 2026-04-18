type PublicSupabaseEnvName = 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY';

export function normalizePublicSupabaseEnvValue(
  name: PublicSupabaseEnvName,
  rawValue?: string,
): string | null {
  let value = rawValue?.trim() ?? '';
  if (!value) return null;

  const assignmentPrefix = `${name}=`;
  if (value.startsWith(assignmentPrefix)) {
    value = value.slice(assignmentPrefix.length).trim();
  }

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value || null;
}

export function getPublicSupabaseConfig(): { url: string | null; anonKey: string | null } {
  return {
    url: normalizePublicSupabaseEnvValue('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
    anonKey: normalizePublicSupabaseEnvValue('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  };
}

export function isCloudEnabled(): boolean {
  const { url, anonKey } = getPublicSupabaseConfig();
  return !!url && !!anonKey && /^https?:\/\//i.test(url);
}
