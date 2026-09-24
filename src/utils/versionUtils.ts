// Strict semantic version validation and comparison utilities for OTA app updates

export function isValidSemVer(version: string): boolean {
  if (!version || typeof version !== 'string') return false;
  const clean = version.trim().replace(/^v/i, '');
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(clean);
}

export function compareSemVer(v1: string, v2: string): number {
  const parsePart = (v: string) => {
    const clean = (v || '').trim().replace(/^v/i, '').split('-')[0].split('+')[0];
    return clean.split('.').map((p) => {
      const num = parseInt(p, 10);
      return isNaN(num) ? 0 : num;
    });
  };

  const p1 = parsePart(v1);
  const p2 = parsePart(v2);
  for (let i = 0; i < 3; i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}
