export const referenceSlug = (value: string) => {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  if (!slug) throw new Error('Reference name must contain letters or numbers');
  return slug;
};
