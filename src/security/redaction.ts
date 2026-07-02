const SECRET_PATTERNS: RegExp[] = [
  /\b(OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|PASSWORD|PASS|SECRET|TOKEN|API_KEY)\s*=\s*([^\s"']+)/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

export function redactSecrets(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match, key) => (typeof key === "string" ? `${key}=[REDACTED]` : "[REDACTED]"));
  }
  return output;
}

export function containsSecretLikeText(input: string): boolean {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}
