/** Old Portuguese declarations become the one supported tag, `pt`, in the document itself. */
export function canonicalLanguages(languages: readonly string[] | undefined): string[] | undefined {
  if (!languages) return undefined;
  const out: string[] = [];
  let portuguese = false;
  for (const tag of languages) {
    if (/^pt(?:-|$)/i.test(tag)) {
      if (!portuguese) out.push('pt');
      portuguese = true;
    } else {
      out.push(tag);
    }
  }
  return out;
}
