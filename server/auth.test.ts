import assert from "node:assert/strict";
import test from "node:test";
import {
  createVerificationHash,
  generateVerificationCode,
  verifyVerificationHash,
} from "./auth.js";
import {
  isValidEmail,
  isDeliveryCountry,
  isLanguagePreference,
  normalizeEmail,
  userInitials,
  validateNickname,
} from "../shared/auth.js";

test("normalizes and validates email identifiers", () => {
  assert.equal(normalizeEmail("  Asahi.Lee+test@Outlook.COM "), "asahi.lee+test@outlook.com");
  assert.equal(isValidEmail("asahi.lee+test@outlook.com"), true);
  assert.equal(isValidEmail("not an email"), false);
  assert.equal(isValidEmail("a@b"), false);
});

test("validates nicknames with minimal stored profile data", () => {
  assert.deepEqual(validateNickname("  Asahi   Lee  "), { ok: true, nickname: "Asahi Lee" });
  assert.deepEqual(validateNickname("李开复"), { ok: true, nickname: "李开复" });
  assert.equal(validateNickname("").ok, false);
  assert.equal(validateNickname("   ").ok, false);
  assert.equal(validateNickname("🙂🙂").ok, false);
});

test("validates stored language and delivery country preferences", () => {
  assert.equal(isLanguagePreference("zh"), true);
  assert.equal(isLanguagePreference("nl"), true);
  assert.equal(isLanguagePreference("en"), true);
  assert.equal(isLanguagePreference("fr"), false);
  assert.equal(isDeliveryCountry("fr"), true);
  assert.equal(isDeliveryCountry("nl"), true);
  assert.equal(isDeliveryCountry("de"), false);
});

test("derives compact avatar initials", () => {
  assert.equal(userInitials("Asahi Lee"), "AL");
  assert.equal(userInitials("Mike"), "M");
  assert.equal(userInitials("李开复"), "李");
  assert.equal(userInitials(null, "cool.person@example.com"), "CP");
});

test("generates and verifies six-digit verification codes without storing plaintext", () => {
  const code = generateVerificationCode();
  assert.match(code, /^\d{6}$/);
  const salt = "test-salt";
  const hash = createVerificationHash("User@Example.com", "123456", salt);
  assert.equal(hash, createVerificationHash("user@example.com", "123456", salt));
  assert.equal(verifyVerificationHash("user@example.com", "123456", salt, hash), true);
  assert.equal(verifyVerificationHash("user@example.com", "000000", salt, hash), false);
});
