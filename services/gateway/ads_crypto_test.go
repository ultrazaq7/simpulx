package main

import (
	"crypto/rand"
	"strings"
	"testing"
)

func withKey(t *testing.T) {
	t.Helper()
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		t.Fatal(err)
	}
	adsTokenKey = k
	t.Cleanup(func() { adsTokenKey = nil })
}

func TestEncryptDecryptRoundtrip(t *testing.T) {
	withKey(t)
	plain := "EAAMANNlfC5E_a_real_looking_meta_token_1234567890"
	enc, err := encryptAdToken(plain)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(enc, adsTokenPrefix) {
		t.Fatalf("ciphertext missing prefix: %q", enc)
	}
	if strings.Contains(enc, plain) {
		t.Fatal("ciphertext leaks the plaintext token")
	}
	got, err := decryptAdToken(enc)
	if err != nil {
		t.Fatal(err)
	}
	if got != plain {
		t.Fatalf("roundtrip mismatch: got %q want %q", got, plain)
	}
}

func TestEmptyStaysEmpty(t *testing.T) {
	withKey(t)
	enc, err := encryptAdToken("")
	if err != nil || enc != "" {
		t.Fatalf("empty must stay empty, got %q err %v", enc, err)
	}
}

func TestLegacyPlaintextPassesThrough(t *testing.T) {
	withKey(t)
	// A value with no prefix is a pre-encryption row: returned unchanged so a
	// mid-deploy sync never breaks.
	got, err := decryptAdToken("EAAplaintextlegacy")
	if err != nil || got != "EAAplaintextlegacy" {
		t.Fatalf("legacy plaintext must pass through, got %q err %v", got, err)
	}
}

func TestNoDoubleEncrypt(t *testing.T) {
	withKey(t)
	enc, _ := encryptAdToken("tok")
	enc2, err := encryptAdToken(enc)
	if err != nil || enc2 != enc {
		t.Fatalf("already-encrypted value must not be re-wrapped")
	}
}

func TestEncryptDisabledWithoutKey(t *testing.T) {
	adsTokenKey = nil
	enc, err := encryptAdToken("tok")
	if err != nil || enc != "tok" {
		t.Fatalf("no key => plaintext passthrough, got %q err %v", enc, err)
	}
}

func TestDecryptEncryptedWithoutKeyErrors(t *testing.T) {
	withKey(t)
	enc, _ := encryptAdToken("tok")
	adsTokenKey = nil
	if _, err := decryptAdToken(enc); err == nil {
		t.Fatal("decrypting an encrypted value with no key must error, not return empty")
	}
}

func TestWrongKeyFailsAuth(t *testing.T) {
	withKey(t)
	enc, _ := encryptAdToken("tok")
	// Rotate to a different key: GCM auth tag must reject it.
	k := make([]byte, 32)
	rand.Read(k)
	adsTokenKey = k
	if _, err := decryptAdToken(enc); err == nil {
		t.Fatal("decrypt with wrong key must fail the GCM auth tag")
	}
}
