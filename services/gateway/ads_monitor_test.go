package main

import "testing"

// The threshold resolver is the part most likely to be "fixed" later by someone
// giving the columns a NOT NULL DEFAULT. These pin the contract: NULL means fall
// back to env, and 0 is a real value, not "unset".
func TestFirstFloatTreatsZeroAsAValue(t *testing.T) {
	zero := 0.0
	if got := firstFloat(&zero, 3.5); got != 0 {
		t.Errorf("an explicit 0 override must win, got %v", got)
	}
	if got := firstFloat(nil, 3.5); got != 3.5 {
		t.Errorf("NULL must fall back to the env value, got %v", got)
	}
	v := 2.25
	if got := firstFloat(&v, 3.5); got != 2.25 {
		t.Errorf("override must win, got %v", got)
	}
}

func TestRupiahFormatting(t *testing.T) {
	cases := map[float64]string{
		0:       "Rp 0",
		999:     "Rp 999",
		1000:    "Rp 1.000",
		112197:  "Rp 112.197",
		1234567: "Rp 1.234.567",
		42383.6: "Rp 42.384", // rounds, so an alert never reads "Rp 42.383,6"
	}
	for in, want := range cases {
		if got := rupiah(in); got != want {
			t.Errorf("rupiah(%v) = %q, want %q", in, got, want)
		}
	}
}

// The email must state plainly when nothing was actually changed in Meta,
// otherwise a "paused" line reads as an action that never happened.
func TestAlertEmailSaysWhenAutopauseIsOff(t *testing.T) {
	t.Setenv("ADS_AUTOPAUSE", "false")
	body := adsAlertHTML("Danafin Campaign", []alert{{
		kind: "fatigue", metric: 4.1, threshold: 3.5, action: "flagged",
		detail: "Ad \"X\" frequency 4.10 over 7d (threshold 3.50)",
	}})
	if !contains(body, "Auto-pause is OFF") {
		t.Error("email must disclose that auto-pause is off")
	}
	if !contains(body, "Danafin Campaign") {
		t.Error("email must name the campaign")
	}

	t.Setenv("ADS_AUTOPAUSE", "true")
	if contains(adsAlertHTML("X", nil), "Auto-pause is OFF") {
		t.Error("must not claim auto-pause is off when it is on")
	}
}

func contains(hay, needle string) bool {
	return len(hay) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(hay); i++ {
			if hay[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}
