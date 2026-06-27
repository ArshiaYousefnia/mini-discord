export function normalizeDate(date: string) {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const englishDigits = "0123456789";

  let result = date;

  for (let i = 0; i < persianDigits.length; i++) {
    const regex = new RegExp(persianDigits[i], "g");
    result = result.replace(regex, englishDigits[i]);
  }

  result = result.replace(/\//g, "-");

  return result;
}
