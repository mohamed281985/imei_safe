const EARTH_RADIUS_METERS = 6371000;

export const normalizeCountryName = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

export const buildCountryAliases = (countries) => {
  const aliases = new Map();
  for (const country of countries || []) {
    const canonical = normalizeCountryName(country.name_en || country.name_ar);
    if (!canonical) continue;
    for (const name of [country.name_en, country.name_ar]) {
      const alias = normalizeCountryName(name);
      if (alias) aliases.set(alias, canonical);
    }
  }
  return aliases;
};

export const resolveCountryKey = (countryName, aliases) => {
  const normalized = normalizeCountryName(countryName);
  return normalized ? aliases.get(normalized) || normalized : '';
};

export const distanceInMeters = (latitude1, longitude1, latitude2, longitude2) => {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLatitude = toRadians(latitude2 - latitude1);
  const deltaLongitude = toRadians(longitude2 - longitude1);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(deltaLongitude / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const filterNearbyRewardOffers = ({
  offers,
  sellerCountries,
  countryAliases,
  userCountry,
  latitude,
  longitude,
  radiusMeters = 10000,
}) => {
  const userCountryKey = resolveCountryKey(userCountry, countryAliases);
  if (!userCountryKey) return [];

  const distanceRankedOffers = (offers || [])
    .filter((offer) => {
      const offerCountry = offer.countries || sellerCountries.get(offer.user_id);
      return resolveCountryKey(offerCountry, countryAliases) === userCountryKey;
    })
    .filter((offer) => offer.store_latitude != null && offer.store_longitude != null
      && Number.isFinite(Number(offer.store_latitude)) && Number.isFinite(Number(offer.store_longitude)))
    .map((offer) => ({
      ...offer,
      exact_distance_meters: distanceInMeters(
        latitude,
        longitude,
        Number(offer.store_latitude),
        Number(offer.store_longitude),
      ),
    }))
    .sort((first, second) => first.exact_distance_meters - second.exact_distance_meters);

  const nearbyOffers = distanceRankedOffers.filter((offer) => offer.exact_distance_meters <= radiusMeters);
  const selectedOffers = nearbyOffers.length > 0
    ? nearbyOffers
    : distanceRankedOffers.slice(0, 1).map((offer) => ({ ...offer, nearest_fallback: true }));

  return selectedOffers
    .map(({ exact_distance_meters, ...offer }) => ({
      ...offer,
      distance_meters: Math.round(exact_distance_meters),
    }));
};
