export const cleanUrl = (value: string) => {
  const url = new URL(value);
  url.hash = "";
  return url.href;
};
