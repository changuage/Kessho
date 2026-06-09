type PublicSupabaseEnvName =
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_ANON_KEY';

const SUPABASE_URL_ENV_NAMES = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const;
const SUPABASE_ANON_KEY_ENV_NAMES = ['VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;

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

function readPublicSupabaseEnvValue(
  names: readonly PublicSupabaseEnvName[],
): string | null {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  for (const name of names) {
    const value = normalizePublicSupabaseEnvValue(name, env[name]);
    if (value) return value;
  }
  return null;
}

export function getPublicSupabaseConfig(): { url: string | null; anonKey: string | null } {
  return {
    url: readPublicSupabaseEnvValue(SUPABASE_URL_ENV_NAMES),
    anonKey: readPublicSupabaseEnvValue(SUPABASE_ANON_KEY_ENV_NAMES),
  };
}

export function isCloudEnabled(): boolean {
  const { url, anonKey } = getPublicSupabaseConfig();
  return !!url && !!anonKey && /^https?:\/\//i.test(url);
}
