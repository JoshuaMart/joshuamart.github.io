/** True when `host` is `domain` itself or one of its subdomains. */
function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Who published an advisory, from its link: Tenable, NVD, or the vendor itself. */
export function advisorySource(link: string): 'Tenable' | 'NVD' | 'Vendor' {
  let host: string;
  try {
    host = new URL(link).hostname.toLowerCase();
  } catch {
    return 'Vendor';
  }
  if (isHost(host, 'tenable.com')) return 'Tenable';
  if (isHost(host, 'nvd.nist.gov')) return 'NVD';
  return 'Vendor';
}
