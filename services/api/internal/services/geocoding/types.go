package geocoding

type Location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	City      string  `json:"city"`
	Country   string  `json:"country"`
}

type NominatimResult struct {
	Lat         string  `json:"lat"`
	Lon         string  `json:"lon"`
	DisplayName string  `json:"display_name"`
	Address     Address `json:"address"`
}

type Address struct {
	City          string `json:"city,omitempty"`
	Town          string `json:"town,omitempty"`
	Village       string `json:"village,omitempty"`
	Hamlet        string `json:"hamlet,omitempty"`
	Municipality  string `json:"municipality,omitempty"`
	County        string `json:"county,omitempty"`
	StateDistrict string `json:"state_district,omitempty"`
	State         string `json:"state,omitempty"`
	Country       string `json:"country,omitempty"`
}

type SearchOptions struct {
	Limit         int
	Language      string
	PreferCountry string
	PreferCoords  *struct{ Lat, Lon float64 }
}
