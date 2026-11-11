const predictablePasswords = new Set([
  "password", "passw0rd", "qwerty", "qwertyuiop", "1234567890", "abcdefghijklmno",
  "123456789012345", "1234567890123456", "1234567890123456789",
  "iloveyou", "letmein", "premierleague", "premierleagueanalytics", "footballanalytics"
]);

export function passwordIssue(value, username, email) {
  if (!value) return "";
  if (Array.from(value.normalize("NFC")).length < 15) return "Use at least 15 characters.";

  const folded = value.normalize("NFKC").trim().toLowerCase();
  const accountNames = [username, email, email.split("@")[0]];
  if (accountNames.some(name => name && folded === name.trim().normalize("NFKC").toLowerCase())) {
    return "Choose a password different from your username and email.";
  }

  // Compare common passwords and simple numbered variants without changing the input.
  const compact = folded.replace(/[^\p{L}\p{N}]/gu, "");
  const baseWord = compact.replace(/[0-9]+$/, "");
  if (!folded || /^(?:([\s\S]{1,12})\1+)$/u.test(folded) ||
      predictablePasswords.has(compact) || predictablePasswords.has(baseWord)) {
    return "This password is easy to guess. Try several unrelated words.";
  }
  return "";
}
