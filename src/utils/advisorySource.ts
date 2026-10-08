/** Who published an advisory, from its link: Tenable, NVD, or the vendor itself. */
export function advisorySource(link: string): 'Tenable' | 'NVD' | 'Vendor' {
  if (link.includes('tenable.com')) return 'Tenable';
  if (link.includes('nvd.nist.gov')) return 'NVD';
  return 'Vendor';
}
