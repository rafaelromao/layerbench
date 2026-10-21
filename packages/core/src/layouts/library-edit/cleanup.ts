/**
 * Promoting a community layout moves it into the Library: once the deploy that bundles it is out,
 * its community file goes from the `layerbench-data` branch, so the Library lists it once. These
 * are the files a listing of that branch's `community/` folder holds whose layouts are bundled now;
 * the branch's index workflow lists the rest again once they are gone.
 */
export function movedCommunityFiles(
  listing: readonly string[],
  bundledIds: readonly string[],
): string[] {
  const bundled = new Set(bundledIds);
  return listing.filter((path) => {
    const m = /^community\/([A-Za-z0-9_-]+)\.json$/.exec(path);
    return m !== null && m[1] !== 'index' && bundled.has(m[1]);
  });
}
