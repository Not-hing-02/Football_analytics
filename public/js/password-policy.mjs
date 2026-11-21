export function passwordIssue(value) {
    if (!value) return "";

    if (Array.from(value).length < 8) {
        return "Use at least 8 characters.";
    }

    if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
        return "Include an uppercase letter, a lowercase letter, and a number.";
    }

    return "";
}