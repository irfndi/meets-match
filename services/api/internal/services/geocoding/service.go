package geocoding

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Service struct {
	client    *http.Client
	userAgent string
}

func NewService() *Service {
	return &Service{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		userAgent: "meetsmatch-bot/1.0",
	}
}

func (s *Service) SearchCities(query string, opts SearchOptions) ([]Location, error) {
	if query = strings.TrimSpace(query); query == "" {
		return []Location{}, nil
	}

	params := url.Values{}
	params.Set("q", query)
	params.Set("format", "json")
	params.Set("addressdetails", "1")
	params.Set("limit", strconv.Itoa(max(1, opts.Limit)))
	if opts.Language != "" {
		params.Set("accept-language", opts.Language)
	} else {
		params.Set("accept-language", "en")
	}

	var results []NominatimResult
	if err := s.doRequest("search", params, &results); err != nil {
		return nil, err
	}

	seen := make(map[string]bool)
	var candidates []Location

	for _, r := range results {
		city, country := extractCityCountry(r.Address)
		if city == "" || country == "" {
			continue
		}

		key := city + "|" + country
		if seen[key] {
			continue
		}
		seen[key] = true

		lat, _ := strconv.ParseFloat(r.Lat, 64)
		lon, _ := strconv.ParseFloat(r.Lon, 64)

		candidates = append(candidates, Location{
			Latitude:  lat,
			Longitude: lon,
			City:      city,
			Country:   country,
		})

		if len(candidates) >= opts.Limit {
			break
		}
	}

	if opts.PreferCountry != "" || opts.PreferCoords != nil {
		sortCandidates(candidates, opts)
	}

	return candidates, nil
}

func (s *Service) ReverseGeocode(lat, lon float64) (*Location, error) {
	params := url.Values{}
	params.Set("lat", fmt.Sprintf("%f", lat))
	params.Set("lon", fmt.Sprintf("%f", lon))
	params.Set("format", "json")
	params.Set("addressdetails", "1")
	params.Set("zoom", "10") // Town/City level

	var result NominatimResult
	if err := s.doRequest("reverse", params, &result); err != nil {
		return nil, err
	}

	city, country := extractCityCountry(result.Address)
	if city == "" || country == "" {
		return nil, nil // Not found or invalid
	}

	return &Location{
		Latitude:  lat,
		Longitude: lon,
		City:      city,
		Country:   country,
	}, nil
}

func (s *Service) doRequest(endpoint string, params url.Values, v interface{}) error {
	u := fmt.Sprintf("https://nominatim.openstreetmap.org/%s?%s", endpoint, params.Encode())

	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", s.userAgent)

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("nominatim API error: %s", resp.Status)
	}

	return json.NewDecoder(resp.Body).Decode(v)
}

func extractCityCountry(addr Address) (string, string) {
	city := addr.City
	if city == "" {
		city = addr.Town
	}
	if city == "" {
		city = addr.Village
	}
	if city == "" {
		city = addr.Hamlet
	}
	if city == "" {
		city = addr.Municipality
	}
	if city == "" {
		city = addr.County
	}
	if city == "" {
		city = addr.StateDistrict
	}
	if city == "" {
		city = addr.State
	}
	return city, addr.Country
}

func sortCandidates(candidates []Location, opts SearchOptions) {
	sort.Slice(candidates, func(i, j int) bool {
		c1 := candidates[i]
		c2 := candidates[j]

		// 1. Country Match
		if opts.PreferCountry != "" {
			match1 := strings.EqualFold(c1.Country, opts.PreferCountry)
			match2 := strings.EqualFold(c2.Country, opts.PreferCountry)
			if match1 != match2 {
				return match1 // True comes before False
			}
		}

		// 2. Distance Match
		if opts.PreferCoords != nil {
			dist1 := haversine(opts.PreferCoords.Lat, opts.PreferCoords.Lon, c1.Latitude, c1.Longitude)
			dist2 := haversine(opts.PreferCoords.Lat, opts.PreferCoords.Lon, c2.Latitude, c2.Longitude)
			return dist1 < dist2
		}

		return false // Maintain original order
	})
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0 // Earth radius in km
	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180.0))*math.Cos(lat2*(math.Pi/180.0))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
