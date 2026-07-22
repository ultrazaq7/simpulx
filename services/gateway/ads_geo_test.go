package main

import "testing"

// Ranking exists because a live search for "Jakarta Selatan" returns 22 matches,
// mostly neighbourhoods that merely contain "Selatan", with the intended subcity
// NOT first. An unsorted list is how the wrong location gets picked, which is the
// exact failure the confirmation step exists to prevent.
func TestRankGeoPutsTheIntendedPlaceFirst(t *testing.T) {
	cands := []metaGeoCandidate{
		{Name: "Duri Selatan", Type: "neighborhood"},
		{Name: "Utan Kayu Selatan", Type: "neighborhood"},
		{Name: "Jakarta Selatan", Type: "subcity"},
		{Name: "Jakarta Selatan Raya", Type: "city"},
	}
	rankGeo(cands, "Jakarta Selatan")
	if cands[0].Name != "Jakarta Selatan" {
		t.Errorf("exact match must rank first, got %q", cands[0].Name)
	}
	if cands[1].Name != "Jakarta Selatan Raya" {
		t.Errorf("prefix match must rank above a mere substring, got %q", cands[1].Name)
	}
}

// A search for "Bogor" also returns "Cibinong", which shares no text with the
// query. Fuzzy matches must sink, never lead.
func TestRankGeoSinksFuzzyMatches(t *testing.T) {
	cands := []metaGeoCandidate{
		{Name: "Cibinong", Type: "city"},
		{Name: "Bogor", Type: "city"},
	}
	rankGeo(cands, "Bogor")
	if cands[0].Name != "Bogor" {
		t.Errorf("named match must beat a fuzzy one, got %q", cands[0].Name)
	}
}

// Broader administrative units win ties, since a campaign covering a city means
// the city, not one of its neighbourhoods.
func TestRankGeoPrefersBroaderUnitsOnTies(t *testing.T) {
	cands := []metaGeoCandidate{
		{Name: "Depok", Type: "neighborhood"},
		{Name: "Depok", Type: "city"},
	}
	rankGeo(cands, "Depok")
	if cands[0].Type != "city" {
		t.Errorf("city must outrank neighborhood on an equal name, got %q", cands[0].Type)
	}
}
