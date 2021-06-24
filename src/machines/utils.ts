export type NarrowEvent<T, N> = T extends { type: N } ? T : never;

export const shallowCompare = (
  obj1?: Record<string, string>,
  obj2?: Record<string, string>
): boolean => {
  if (!obj1 || !obj2) {
    return false;
  }
  return (
    Object.keys(obj1).length === Object.keys(obj2).length &&
    Object.keys(obj1).every((key) => obj1[key] === obj2[key])
  );
};
