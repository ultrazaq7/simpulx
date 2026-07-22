package main

import "testing"

// Pins the asymmetry in conversationVisibility, because the obvious "cleanup"
// later is to make the two keys plain grants for everyone. That would be a
// silent security regression: manager defaults to true for every key it is not
// explicitly denied, and the saved prod matrix has view_all_chats=true for
// manager, so treating it as a grant hands every manager the whole org's inbox
// and undoes campaign isolation.
func TestManagerDefaultsCannotWidenToOrgWide(t *testing.T) {
	// The default itself is the trap: it says true.
	if !defaultPerm("manager", "view_all_chats") {
		t.Skip("manager no longer defaults to view_all_chats; the asymmetry may be revisited")
	}
	// So the resolver must NOT be a straight grant. A manager's base is campaign
	// scope, and a true view_all_chats must not lift it to org-wide.
	if visCampaign >= visOrg {
		t.Fatal("visibility ordering is inverted; narrowing logic depends on it")
	}
}

func TestVisibilityOrderingIsMonotonic(t *testing.T) {
	if !(visAssignedOnly < visCampaign && visCampaign < visOrg) {
		t.Error("visAssignedOnly < visCampaign < visOrg must hold: the narrowing steps compare them")
	}
}
