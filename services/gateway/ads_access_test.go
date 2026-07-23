package main

import "testing"

// The client's permission and our own kill switch answer different questions, and
// the narrower must always win. These pin that, because the tempting "fix" later
// is to check only ADS_AUTOPAUSE - which would let the rule engine write to an
// account whose owner only ever agreed to reporting.
func TestCanWriteRequiresClientConsent(t *testing.T) {
	if (managedCampaign{accessMode: "read"}).canWrite() {
		t.Error("a read-only account must never be writable")
	}
	if !(managedCampaign{accessMode: "manage"}).canWrite() {
		t.Error("a managed account must be writable")
	}
	// Anything unexpected (empty, typo, a value from a future migration) must fall
	// closed rather than open.
	for _, m := range []string{"", "READ", "Manage", "full", "write"} {
		if (managedCampaign{accessMode: m}).canWrite() {
			t.Errorf("accessMode %q must not grant write access", m)
		}
	}
}
